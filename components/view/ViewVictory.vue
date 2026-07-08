<template>
  <div v-if="game" class="victory-stage" :class="{ 'show-atlas': showAtlas }">
    <!-- Act one: the takeover — a full-screen beat before any numbers -->
    <div v-if="showHero" class="hero" @click="endHero">
      <ContourRipple class="hero-ripple" :delay="0.3" />
      <span data-hero="eyebrow" class="eyebrow">{{
        isChampion ? 'Victory' : 'The finish line'
      }}</span>
      <h1 data-hero="name">{{ heroHeading }}</h1>
      <p data-hero="sub" class="hero-sub">{{ heroSub }}</p>
    </div>

    <!-- Act two: the report — a living end-screen over the game's atlas -->
    <ModalWrapper v-else>
      <!-- Atlas peek: the report steps aside so the glowing map can be seen -->
      <button v-if="showAtlas" type="button" class="atlas-return" @click="showAtlas = false">
        {{ atlasSelection ? 'Tap another country' : 'Tap any country to explore' }} — back to the report
      </button>

      <AtlasCard
        v-if="showAtlas && atlasSelection"
        :country="atlasSelection"
        @close="clearAtlasSelection"
        @select="selectAtlasCountry"
      />

      <article v-show="!showAtlas" ref="card" class="pane victory-report tl decorator-bottom">
        <section class="report-main">
          <header class="pane-content report-header">
            <span class="eyebrow">Final Standings</span>
            <h2>{{ isChampion ? `Champion: ${ownName}` : `You placed ${ordinal(placement ?? 0)}` }}</h2>
          </header>

          <div class="pane-content stat-banner">
            <div class="stat">
              <strong class="stat-value">{{ animatedPoints }}</strong>
              <span class="stat-label">points scored</span>
            </div>
            <div class="stat">
              <strong class="stat-value">{{ ownStats?.roundWins ?? 0 }}</strong>
              <span class="stat-label">rounds won</span>
            </div>
            <div class="stat badge">
              <strong class="stat-value">{{ ownStats?.superlative.title }}</strong>
              <span class="stat-label">{{ ownStats?.superlative.detail }}</span>
            </div>
          </div>

          <section v-if="ownStats?.timeline.length" class="pane-content timeline">
            <span class="eyebrow">Your Game, Round by Round</span>
            <div class="timeline-bars">
              <div
                v-for="result in ownStats.timeline"
                :key="result.number"
                class="timeline-bar"
                :title="`Round ${result.number} — ${result.scored}/${result.maximum}`"
              >
                <div
                  class="bar-fill"
                  :style="{ height: `${Math.max(6, (result.scored / result.maximum) * 100)}%` }"
                />
                <span class="bar-label">{{ result.number }}</span>
              </div>
            </div>
            <p v-if="ownStats.sharpestRound" class="sharpest">
              Sharpest moment: {{ ownStats.sharpestRound.scored }}/{{
                ownStats.sharpestRound.maximum
              }}
              on the round {{ ownStats.sharpestRound.number }} {{ kindLabel(ownStats.sharpestRound.kind) }}.
            </p>
          </section>

          <footer class="pane-content atlas-line">
            <p>
              This game visited <strong>{{ atlas.length }}</strong> countries — they're glowing on
              the map behind this card.
            </p>
            <nav class="report-nav">
              <ButtonLine @click="showAtlas = true">
                <span>View the atlas</span>
              </ButtonLine>
              <ButtonLine @click="goHome">
                <span>Back to the home screen</span>
              </ButtonLine>
            </nav>
            <p v-if="!raceOver" class="leave-note">
              You're free to leave — the race carries on without you, and this room remembers your
              crown if you return.
            </p>
          </footer>
        </section>

        <section class="player-listing pane-content">
          <header class="listing-header">
            <span class="eyebrow">{{ raceOver ? 'Final Order' : 'The Race Continues' }}</span>
          </header>
          <div
            v-for="(standing, index) in gameStore.standings"
            :key="standing.id"
            class="standing-row"
            :class="{ 'own-player': standing.id === playerId, champion: index === 0 }"
          >
            <span class="rank">{{ index + 1 }}</span>
            <PlayerTile :player="standing">
              <div class="standing-status">
                <template v-if="standing.completedAtRound">
                  <span class="finished">Round {{ standing.completedAtRound }}</span>
                </template>
                <template v-else>
                  <span class="racing">tile {{ standing.currentPosition + 1 }}…</span>
                </template>
              </div>
            </PlayerTile>
            <span class="badge-line">{{ statsByPlayer[standing.id]?.superlative.title }}</span>
          </div>
        </section>
      </article>
    </ModalWrapper>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import AtlasCard from '~/components/atlas/AtlasCard.vue'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import { getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { useCountUp } from '~~/lib/use-count-up'
import { gameStats, visitedCountries } from '~~/lib/victory-stats'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

const { game, player, playerId, gameStore, clearBoard } = useClientEvents()

const router = useRouter()
// Replace, not push: leaving a finished game shouldn't leave the room URL in
// history, or the browser back button drops the player into a stale lobby.
const goHome = () => router.replace('/')

const ownName = computed(() => player.value?.name)

const placement = computed(() => {
  const index = gameStore.standings.findIndex(standing => standing.id === playerId.value)
  return index === -1 ? undefined : index + 1
})

const isChampion = computed(() => placement.value === 1)
const raceOver = computed(() =>
  gameStore.standings.every(standing => !!standing.completedAtRound)
)

const heroHeading = computed(() =>
  isChampion.value ? `${ownName.value ?? 'You'} takes the crown` : `${ownName.value ?? 'You'} crosses the line`
)
const heroSub = computed(() => {
  if (isChampion.value) return 'First through the final gauntlet — the world is yours.'
  return `${ordinal(placement.value ?? 0)} across the finish — the report awaits.`
})

const ordinal = (value: number) => {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
  const tens = value % 100
  return `${value}${tens >= 11 && tens <= 13 ? 'th' : (suffixes[value % 10] ?? 'th')}`
}

const kindLabel = (kind: RoundChallengeKind) => kind.replace(/-/g, ' ')

// --- The report data --------------------------------------------------------
const statsByPlayer = computed(() => (game.value ? gameStats(game.value) : {}))
const ownStats = computed(() => statsByPlayer.value[playerId.value])
const atlas = computed(() => (game.value ? visitedCountries(game.value) : []))

const { display: animatedPoints } = useCountUp(() => ownStats.value?.totalScored ?? 0, {
  delay: 0.4,
})

// --- Act one: hero beat ------------------------------------------------------
const HERO_HOLD_MS = 3400
const showHero = ref(true)
let heroTimer: ReturnType<typeof setTimeout> | undefined

const endHero = () => {
  if (heroTimer) clearTimeout(heroTimer)
  showHero.value = false
}

onMounted(() => {
  // The game's atlas glows behind the report — every country the rounds touched
  clearBoard()
  for (const isoCode of atlas.value) {
    gameStore.map.tints[isoCode] = isChampion.value ? 'optimal' : 'inefficient'
  }

  heroTimer = setTimeout(endHero, prefersReducedMotion() ? 600 : HERO_HOLD_MS)
  document.addEventListener('mapClick', onAtlasMapClick)

  if (prefersReducedMotion()) return
  nextTick(() => {
    gsap.fromTo(
      '[data-hero="eyebrow"]',
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.4, ease: EASE.enter }
    )
    gsap.fromTo(
      '[data-hero="name"]',
      { opacity: 0, scale: 0.85, y: 24 },
      { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: EASE.enter, delay: 0.25 }
    )
    gsap.fromTo(
      '[data-hero="sub"]',
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.5, ease: EASE.enter, delay: 0.7 }
    )
  })
})

// --- Act two: report entrance -------------------------------------------------
const showAtlas = ref(false)
const card = ref<HTMLElement>()

// --- Atlas explore: click any country for an enriched fact sheet -------------
const atlasReveal = ref<ISOCountryCode>()
const atlasSelection = computed(() =>
  atlasReveal.value ? getCountry(atlasReveal.value) : undefined
)

const selectAtlasCountry = (iso: ISOCountryCode) => {
  atlasReveal.value = iso
  // Reuse the map's reveal watcher: setting reveal flies the camera to it.
  gameStore.map.reveal = iso
}
const clearAtlasSelection = () => {
  atlasReveal.value = undefined
  gameStore.map.reveal = undefined
}

const onAtlasMapClick = (event: Event) => {
  if (!showAtlas.value || !isMapClickEvent(event)) return
  const iso = event.detail.isoCode
  if (isValidISOCode(iso)) selectAtlasCountry(iso)
}

// Entering the atlas suppresses the terse reveal card and enables click-explore;
// leaving it restores normal state and drops any selection.
watch(showAtlas, open => {
  gameStore.map.atlasMode = open
  if (!open) clearAtlasSelection()
})
watch(showHero, value => {
  if (value || prefersReducedMotion()) return
  nextTick(() => {
    if (!card.value) return
    gsap.fromTo(
      card.value.querySelectorAll('.report-main > *'),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.45, ease: EASE.enter, stagger: 0.1, clearProps: 'all' }
    )
    gsap.fromTo(
      card.value.querySelectorAll('.standing-row'),
      { opacity: 0, x: 18 },
      { opacity: 1, x: 0, duration: 0.4, ease: EASE.enter, stagger: 0.09, clearProps: 'opacity,transform' }
    )
    gsap.fromTo(
      card.value.querySelectorAll('.bar-fill'),
      { scaleY: 0, transformOrigin: 'bottom center' },
      { scaleY: 1, duration: 0.5, ease: EASE.enter, stagger: 0.06, delay: 0.4 }
    )
  })
})

onBeforeUnmount(() => {
  if (heroTimer) clearTimeout(heroTimer)
  document.removeEventListener('mapClick', onAtlasMapClick)
  clearBoard()
})
</script>
<style lang="scss" scoped>
$hairline: hsla(0, 0%, 7.5%, 0.12);

.victory-stage {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  position: absolute;
}

// Atlas peek: the full-screen modal wrapper otherwise swallows every click, so
// the glowing GameMap behind it never receives them. Make the wrapper (and its
// scroll layer) click-through while the atlas is open, but keep the return
// button + AtlasCard interactive so the map underneath is explorable.
.victory-stage.show-atlas {
  :deep(.modal-wrapper) {
    pointer-events: none;
  }
  .atlas-return,
  :deep(.atlas-card) {
    pointer-events: auto;
  }
}

// --- Act one -----------------------------------------------------------------
.hero {
  gap: 1.2rem;
  width: 100%;
  height: 100%;
  display: flex;
  cursor: pointer;
  position: relative;
  text-align: center;
  align-items: center;
  pointer-events: auto;
  flex-flow: column nowrap;
  justify-content: center;

  // A soft glow lifts the headline off the atlas linework behind it
  &::before {
    content: '';
    inset: 0;
    position: absolute;
    background: radial-gradient(
      ellipse 62% 48% at center,
      hsla(36, 100%, 98%, 0.96) 0%,
      hsla(36, 100%, 98%, 0.82) 55%,
      transparent 78%
    );
  }

  > * {
    z-index: 1;
  }

  h1 {
    margin: 0;
    font-size: clamp(4.2rem, 9vw, 9rem);
    line-height: 1.05;
    color: var(--dark-blue);
    max-width: 90vw;
  }
}

.hero-sub {
  margin: 0;
  opacity: 0.75;
  font-size: 1.9rem;
}

.hero-ripple {
  top: 50%;
  left: 50%;
  width: 56rem;
  height: 56rem;
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

// --- Act two -----------------------------------------------------------------
.victory-report {
  width: 100%;
  margin: auto;
  display: grid;
  max-width: 110rem;
  grid-template-columns: 68% 32%;
}

.eyebrow {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.8rem;
}

.report-header {
  padding-bottom: 2rem;
  border-bottom: 0.1rem solid $hairline;

  h2 {
    margin: 0;
    font-size: 2.8rem;
    color: var(--dark-blue);
  }
}

.stat-banner {
  gap: 2.8rem;
  display: flex;
  align-items: flex-start;
  padding-top: 2.2rem;
  padding-bottom: 2.2rem;
  border-bottom: 0.1rem solid $hairline;

  .stat {
    display: flex;
    flex-flow: column nowrap;
  }
  .stat-value {
    font-size: 4.2rem;
    line-height: 1.1;
    color: var(--dark-blue);
  }
  .badge .stat-value {
    font-size: 2.4rem;
    padding-top: 0.9rem;
  }
  .stat-label {
    opacity: 0.6;
    font-size: 1.3rem;
  }
}

.timeline {
  padding-top: 2rem;
  padding-bottom: 2rem;
  border-bottom: 0.1rem solid $hairline;
}

.timeline-bars {
  gap: 0.8rem;
  display: flex;
  height: 9rem;
  align-items: flex-end;
}

.timeline-bar {
  gap: 0.4rem;
  height: 100%;
  display: flex;
  flex: 0 1 3.2rem;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: flex-end;

  .bar-fill {
    width: 100%;
    border-radius: 0.3rem 0.3rem 0 0;
    background: var(--soft-blue);
  }
  .bar-label {
    opacity: 0.5;
    font-size: 1.1rem;
  }
}

.sharpest {
  margin: 1.4rem 0 0;
  opacity: 0.7;
  font-size: 1.4rem;
}

.atlas-line {
  padding-top: 1.8rem;
  padding-bottom: 2.2rem;

  p {
    margin: 0;
    opacity: 0.75;
    font-size: 1.5rem;
  }

  .report-nav {
    gap: 1.2rem;
    display: flex;
    flex-flow: row wrap;
    margin-top: 1.4rem;
    pointer-events: auto;
  }

  .leave-note {
    opacity: 0.55;
    font-size: 1.3rem;
    margin-top: 1.2rem;
  }
}

// Floating return pill while the report steps aside for the atlas
.atlas-return {
  left: 50%;
  bottom: 4rem;
  position: fixed;
  cursor: pointer;
  font-size: 1.5rem;
  font-family: inherit;
  padding: 1rem 2.2rem;
  border-radius: 3rem;
  pointer-events: auto;
  color: var(--dark-blue);
  transform: translateX(-50%);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.92);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.35);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  &:hover {
    border-color: var(--dark-blue);
    transform: translateX(-50%) translateY(-0.2rem);
  }
}

// Sidebar: the live standings
.player-listing {
  border-left: 0.1rem solid var(--text-color);
}

.listing-header {
  margin-bottom: 1.6rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }
}

.standing-row {
  gap: 1rem;
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  margin-bottom: 1rem;

  .rank {
    width: 2rem;
    opacity: 0.45;
    flex-shrink: 0;
    font-size: 1.4rem;
    text-align: right;
    font-weight: bold;
  }

  :deep(.player-tile) {
    flex: 1;
    min-width: 0;
  }

  &.champion .rank {
    opacity: 1;
    color: var(--dark-blue);
  }
  &.champion :deep(.player-tile) {
    outline: 0.2rem solid var(--warm-sand);
    outline-offset: 0.2rem;
  }
  &.own-player .rank {
    opacity: 1;
  }

  .badge-line {
    width: 100%;
    opacity: 0.55;
    font-size: 1.2rem;
    padding-left: 3rem;
  }
}

.standing-status {
  margin-left: auto;
  font-size: 1.4rem;

  .finished {
    font-weight: bold;
  }
  .racing {
    opacity: 0.6;
    animation: racing-pulse 2.4s ease-in-out infinite;
  }
}

@keyframes racing-pulse {
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .racing {
    animation: none;
  }
}
</style>
