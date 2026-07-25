<template>
  <article v-if="stage !== 'board'" class="pane tl stage-card" :class="`stage-${stage}`">
    <div class="pane-content">
      <!-- Scores: the round settles — who took what -->
      <template v-if="stage === 'scores'">
        <span class="eyebrow">{{ raceOver ? 'Race complete' : 'Round scored' }}</span>
        <h2 v-if="headline" class="stage-prompt">{{ headline }}</h2>
        <ul class="score-rows">
          <li
            v-for="(card, index) in scorecards"
            :key="card.player.id"
            class="score-row"
            :style="`--player-color: ${card.player.color}`"
          >
            <span class="rank">{{ index + 1 }}</span>
            <PlayerPawn class="pawn" :player="card.player" />
            <span class="name">{{ card.player.name || 'Player' }}</span>
            <strong class="scored">
              {{ card.score ? `${card.score.points.scored}/${card.score.points.maximum}` : '—' }}
            </strong>
          </li>
        </ul>
      </template>

      <!-- Question / gate / final / idle: the story card -->
      <template v-else>
        <span class="eyebrow">{{ story.kicker }}</span>
        <h2 class="stage-prompt">{{ story.prompt }}</h2>

        <img v-if="story.image" class="stage-photo" :src="story.image" alt="" />

        <!-- Silhouette: the outline IS the question, so it shows either way.
             It draws itself in, echoing the racer's reveal. -->
        <svg v-if="outlinePath" class="stage-outline" :viewBox="outlinePath.viewBox">
          <path ref="outlineEl" :d="outlinePath.d" />
        </svg>

        <!-- Flag-palette: the colour swatches the racer names the flag from -->
        <ul v-if="story.swatches?.length" class="swatches">
          <li
            v-for="(hex, index) in story.swatches"
            :key="`${hex}-${index}`"
            class="swatch stagger-in"
            :style="{ background: hex, '--i': index }"
          />
        </ul>

        <!-- The dossier / claims the racer reads (stat-detective, two-truths),
             flipping in one at a time like the racer's own reveal. -->
        <ul v-if="story.facts?.length" class="facts">
          <li
            v-for="(fact, index) in story.facts"
            :key="`${fact.label}-${index}`"
            class="fact stagger-in"
            :style="{ '--i': index }"
          >
            <span class="fact-label">{{ fact.label }}</span>
            <strong v-if="fact.value" class="fact-value">{{ fact.value }}</strong>
          </li>
        </ul>

        <!-- The choices the racer reasons over (flag options / neighbour ring).
             The question itself, so shown even under spoiler-protection; only
             the correct pick is marked, and only when spoilers are shown. -->
        <ul v-if="optionCountries.length" class="options-row">
          <li
            v-for="(country, index) in optionCountries"
            :key="country.isoCode"
            class="option-flag-item stagger-in"
            :class="{ correct: !hideSpoilers && country.isoCode === story.answer }"
            :style="{ '--i': index }"
          >
            <CountryFlag class="option-flag" :country="country" />
            <span v-if="!hideSpoilers && country.isoCode === story.answer" class="option-tick"
              >✓</span
            >
          </li>
        </ul>

        <!-- Ranking rounds: the followed player's actual hand -->
        <ul v-if="hand.length" class="hand">
          <li v-for="country in hand" :key="country.isoCode" class="hand-card">
            <CountryFlag class="hand-flag" :country="country" />
            <span class="hand-name">{{ countryName(country) }}</span>
          </li>
        </ul>

        <!-- The audience's dramatic irony — the racers can't see this -->
        <p v-if="story.secret && !hideSpoilers" class="secret">
          <span class="secret-tag">Only you can see this</span>
          {{ story.secret }}
        </p>

        <!-- Final gauntlet: the run so far -->
        <div v-if="stage === 'final' && gauntlet" class="gauntlet">
          <div class="gauntlet-track">
            <div
              class="gauntlet-fill"
              :style="{ width: `${(gauntlet.answeredCorrect / gauntlet.totalCount) * 100}%` }"
            />
          </div>
          <span class="gauntlet-label">
            {{ gauntlet.answeredCorrect }}/{{ gauntlet.totalCount }} cleared ·
            {{ gauntlet.lives }} {{ gauntlet.lives === 1 ? 'life' : 'lives' }} left
          </span>
        </div>

        <!-- Group rounds: who's answered, who's still sweating -->
        <ul v-if="stage === 'question' && answerChips.length > 1" class="answer-chips">
          <li
            v-for="chip in answerChips"
            :key="chip.player.id"
            class="answer-chip"
            :class="{ answered: chip.answered }"
            :title="`${chip.player.name} ${chip.answered ? 'answered' : 'is thinking'}`"
          >
            <PlayerPawn class="chip-pawn" :player="chip.player" />
            <span v-if="chip.answered" class="tick">✓</span>
            <span v-else class="pulse" aria-hidden="true" />
          </li>
        </ul>
      </template>
    </div>
  </article>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { gsap } from 'gsap'
import { roundChallengeHeadline } from '~~/lib/challenge-headline'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { mainlandOutline } from '~~/lib/outline'
import type { SpectateStageKind, SpectateStory } from '~~/lib/spectate'
import { isGroupChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Player } from '~~/types/player.type'

// The story is computed by the booth (ViewSpectate), which also paints the
// shared map from its focus — one owner for both renditions of the moment.
const props = defineProps<{
  stage: SpectateStageKind
  story: SpectateStory
  followed?: Player
  raceOver: boolean
  hideSpoilers?: boolean
}>()

const hideSpoilers = computed(() => props.hideSpoilers)

const { game, gameStore } = useClientEvents()

const round = computed(() => gameStore.currentRound?.round)
const challenge = computed(() => round.value?.groupChallenge)

const story = computed(() => props.story)

/** Gate choices (flag options, a neighbour ring) as country records to flag. */
const optionCountries = computed(() =>
  (props.story.options ?? []).map(getCountry).filter(country => !!country)
)

// Silhouette: the mainland outline path, resolved from the HD map data (falls
// back to the mounted world map's DOM path). Async, so it's fetched per-country.
const outlinePath = ref<{ d: string; viewBox: string }>()
const outlineEl = ref<SVGPathElement>()
watch(
  () => props.story.outline,
  async iso => {
    if (!iso) {
      outlinePath.value = undefined
      return
    }
    const resolved = await mainlandOutline(iso)
    // Guard against a race: only apply if the followed country is still this one.
    if (props.story.outline !== iso) return
    outlinePath.value = resolved
    await nextTick()
    drawOutline()
  },
  { immediate: true }
)

// The border strokes itself in, then the fill washes up under it — the same
// beat the racer sees, on the spectator's own clock (the reveal timing isn't
// in the snapshot, so this is ambience, not a synced game timer).
const drawOutline = () => {
  const el = outlineEl.value
  if (!el) return
  if (prefersReducedMotion()) {
    gsap.set(el, { strokeDashoffset: 0, fillOpacity: 0.85 })
    return
  }
  let length = 0
  try {
    length = el.getTotalLength()
  } catch {
    return // getTotalLength is browser-only; skip if unavailable
  }
  gsap.set(el, { strokeDasharray: length, strokeDashoffset: length, fillOpacity: 0 })
  gsap.to(el, { strokeDashoffset: 0, duration: 1.5, ease: EASE.enter })
  gsap.to(el, { fillOpacity: 0.85, duration: 0.6, delay: 1.1, ease: 'power1.out' })
}

/** Ranking rounds deal hands — show the followed player's cards. */
const hand = computed(() => {
  if (props.stage !== 'question' || !props.followed) return []
  if (!isGroupChallenge(challenge.value)) return []
  const isoCodes = challenge.value.countriesPerPlayer[props.followed.id] ?? []
  return isoCodes.map(getCountry).filter(country => !!country)
})

/** Post-scoring reveal line. Held back under spoiler-protection until the race
 *  is over, since a pinned fast player reaches scores while others still play. */
const headline = computed(() => {
  if (props.raceOver) return 'Every racer has crossed the line'
  if (props.hideSpoilers) return ''
  return roundChallengeHeadline(challenge.value)
})

const scorecards = computed(() => gameStore.rankedScores)

const gauntlet = computed(() => {
  const gauntletChallenge = props.followed?.moves[0]?.challenge
  return gauntletChallenge?._type === 'final-challenge' ? gauntletChallenge : undefined
})

const answerChips = computed(() => {
  if (!game.value || !round.value) return []
  return Object.values(game.value.players)
    .filter(player => !['kicked', 'victory'].includes(player.phase))
    .map(player => ({ player, answered: !!round.value?.groupAnswers[player.id] }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
$hairline: hsla(215.7, 76.4%, 21.6%, 0.12);

// A broadcast lower-third: centre-bottom, wide but never in the rail's lane.
.stage-card {
  position: absolute;
  left: 50%;
  bottom: calc(2rem + var(--safe-bottom));
  transform: translateX(-50%);
  width: min(52rem, calc(100% - 3rem));
  max-height: 55vh;
  overflow-y: auto;
}

.eyebrow {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.6rem;
}

.stage-prompt {
  margin: 0;
  font-size: 2rem;
  line-height: 1.25;
  color: var(--dark-blue);
}

.stage-photo {
  display: block;
  width: 100%;
  max-height: 18rem;
  object-fit: cover;
  margin-top: 1.2rem;
  border-radius: 0.6rem;
  border: 0.1rem solid $hairline;
}

// The audience secret: a hushed aside set apart from the racers' view
.secret {
  margin: 1.4rem 0 0;
  padding: 1rem 1.2rem;
  font-size: 1.4rem;
  border-radius: 0.6rem;
  color: var(--dark-blue);
  background: hsla(29.7, 79.9%, 72.7%, 0.18); // warm-sand wash
  border-left: 0.3rem solid var(--warm-sand);

  .secret-tag {
    display: block;
    font-size: 1rem;
    font-weight: bold;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
    margin-bottom: 0.3rem;
  }
}

.stage-outline {
  display: block;
  width: 100%;
  max-height: 16rem;
  margin-top: 1.4rem;

  path {
    fill: var(--dark-blue);
    // GSAP drives fill-opacity from 0 → 0.85 as the stroke draws in; this is
    // the no-JS / pre-animation resting state so the shape is never invisible.
    fill-opacity: 0.85;
    stroke: var(--dark-blue);
    stroke-width: 0.5;
  }
}

// Assets flip in one at a time (facts, swatches, option flags), echoing the
// racer's staggered reveal. Index drives the delay via the --i custom property.
.stagger-in {
  animation: stage-pop 0.4s var(--ease-out-expressive, ease) backwards;
  animation-delay: calc(var(--i, 0) * 0.09s);
}

@keyframes stage-pop {
  from {
    opacity: 0;
    transform: translateY(0.6rem) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stagger-in {
    animation: none;
  }
}

.swatches {
  gap: 0.6rem;
  margin: 1.4rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
}

.swatch {
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 0.5rem;
  border: 0.1rem solid $hairline;
}

.facts {
  gap: 0.5rem;
  margin: 1.4rem 0 0;
  padding: 0;
  display: grid;
  list-style: none;
}

.fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.6rem;
  background: hsla(0, 0%, 100%, 0.5);
  border-left: 0.3rem solid var(--soft-blue);

  .fact-label {
    font-size: 1.35rem;
    text-transform: capitalize;
  }
  .fact-value {
    font-size: 1.4rem;
    color: var(--dark-blue);
    white-space: nowrap;
  }
}

.options-row {
  gap: 0.8rem;
  margin: 1.4rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
}

.option-flag-item {
  position: relative;
  width: 6rem;
  border-radius: 0.4rem;
  border: 0.2rem solid transparent;

  &.correct {
    border-color: var(--soft-mint, #6cae94);
  }
}

.option-flag {
  width: 100%;
  border: 0.1rem solid $hairline;
  :deep(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
}

.option-tick {
  position: absolute;
  top: -0.7rem;
  right: -0.7rem;
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  border-radius: 50%;
  background: var(--dark-blue);
}

.hand {
  gap: 0.8rem;
  margin: 1.4rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
}

.hand-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: 7.2rem;
}

.hand-flag {
  width: 100%;
  border: 0.1rem solid $hairline;
  :deep(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
}

.hand-name {
  font-size: 1.1rem;
  text-align: center;
  line-height: 1.2;
  opacity: 0.75;
}

.gauntlet {
  margin-top: 1.4rem;
}

.gauntlet-track {
  height: 0.6rem;
  border-radius: 0.3rem;
  overflow: hidden;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
}

.gauntlet-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 0.5s var(--ease-smooth, ease);
}

.gauntlet-label {
  display: block;
  margin-top: 0.5rem;
  font-size: 1.2rem;
  opacity: 0.7;
}

.answer-chips {
  gap: 0.6rem;
  margin: 1.4rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
}

.answer-chip {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background: hsla(215.7, 76.4%, 21.6%, 0.06);
  border: 1px solid $hairline;
  opacity: 0.55;

  &.answered {
    opacity: 1;
    border-color: var(--soft-mint, #9fd6bc);
  }
}

.chip-pawn {
  width: 2rem;
  height: 2rem;
}

.tick {
  position: absolute;
  right: -0.2rem;
  bottom: -0.2rem;
  width: 1.4rem;
  height: 1.4rem;
  display: grid;
  place-items: center;
  font-size: 0.9rem;
  font-weight: bold;
  color: #fff;
  border-radius: 50%;
  background: var(--dark-blue);
}

.answer-chip .pulse {
  position: absolute;
  right: -0.1rem;
  bottom: -0.1rem;
}

// Scores
.score-rows {
  gap: 0.7rem;
  margin: 1.2rem 0 0;
  padding: 0;
  display: grid;
  list-style: none;
}

.score-row {
  display: grid;
  grid-template-columns: 2rem 2.2rem 1fr auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.8rem;
  background: hsla(0, 0%, 100%, 0.5);
  border-left: 0.3rem solid var(--player-color);

  .rank {
    opacity: 0.45;
    font-size: 1.3rem;
    font-weight: bold;
    text-align: right;
  }
  .pawn {
    width: 2.2rem;
    height: 2.2rem;
  }
  .name {
    font-size: 1.4rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .scored {
    font-size: 1.5rem;
    color: var(--dark-blue);
  }
}

@media screen and (max-width: $tablet) {
  .stage-card {
    left: 1rem;
    right: 1rem;
    width: auto;
    transform: none;
    bottom: calc(1rem + var(--safe-bottom));
    max-height: 42vh;
  }

  .stage-prompt {
    font-size: 1.7rem;
  }
}
</style>
