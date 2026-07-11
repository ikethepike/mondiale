<template>
  <div class="group-challenge-wrapper" :class="{ peeking }">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1}`"
      :title="details?.phrasing || 'Group Challenge'"
      stakes="The better your ranking, the more steps you take."
      @done="showInterstitial = false"
    />
    <form id="active-round" @submit.prevent="submitRanking">
      <header>
        <ButtonFilled class="peek-button" element="a" @click="peeking = !peeking">
          <span>Peek</span>
          <div class="peek-icon" />
        </ButtonFilled>
      </header>

      <section id="question">
        <div class="question-caption">
          <StatTopicIcon v-if="accessorId" class="topic-icon" :accessor="accessorId" />
          <h1 class="map-caption">
            {{ details?.phrasing || 'Group Challenge' }}
          </h1>
        </div>
      </section>

      <footer>
        <div class="indicators">
          <span class="pole pole-most">
            <svg class="pole-arrow" viewBox="0 0 40 16" aria-hidden="true">
              <path
                d="M39 8H2M2 8l6-5M2 8l6 5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="pole-label">{{ details?.markers?.most }}</span>
          </span>
          <ButtonFilled>Submit Ranking</ButtonFilled>
          <span class="pole pole-least">
            <span class="pole-label">{{ details?.markers?.least }}</span>
            <svg class="pole-arrow" viewBox="0 0 40 16" aria-hidden="true">
              <path
                d="M1 8h37M38 8l-6-5M38 8l-6 5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </div>
        <Sortable
          :list="countries"
          :options="options"
          item-key="isoCode"
          class="countries"
          :class="{ dense: countries.length > 5 }"
          @sort="updateRanking"
        >
          <template #item="{ element }">
            <article :key="element.isoCode" class="country draggable" :data-iso="element.isoCode">
              <CountryTile :country="element" />
            </article>
          </template>
        </Sortable>
      </footer>
    </form>
  </div>
</template>
<script lang="ts" setup>
import { Sortable } from 'sortablejs-vue3'
import Interstitial from '~/components/feedback/Interstitial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'
import { isGroupChallenge } from '~~/types/challenges/traversal-challenge.type'
import { type Country, type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

const { gameStore, update, currentRound } = useClientEvents()
const countries = ref<Country[]>(
  gameStore.currentGroupChallengeForPlayer?.map(isoCode => COUNTRIES[isoCode]) || []
)
const peeking = ref(false)
const showInterstitial = ref(true)

const ranking = ref<ISOCountryCode[]>(gameStore.currentGroupChallengeForPlayer || [])
watch(
  () => gameStore.currentGroupChallengeForPlayer,
  current => {
    if (!current) return

    const parsed: Country[] = []
    for (const isoCode of current) {
      parsed.push(COUNTRIES[isoCode])
    }

    countries.value = parsed
  }
)

const accessorId = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  // This view only mounts for ranking rounds — traversal and group-mode rounds
  // render their own views — but the round data itself is a union.
  return isGroupChallenge(challenge) ? challenge.id : undefined
})

const details = computed(() =>
  accessorId.value ? getChallengeDetails(accessorId.value) : undefined
)

const updateRanking = (event: Event) => {
  ranking.value = []
  const parent = event.target as HTMLDivElement
  const divs = parent.querySelectorAll('.country')
  for (const div of divs) {
    if (!(div instanceof HTMLElement)) continue

    const { iso } = div.dataset
    if (!isValidISOCode(iso)) continue

    ranking.value.push(iso)
  }
}

const submitRanking = () => {
  update({
    event: 'submit-group-challenge-answers',
    ranking: ranking.value,
  })
}

// No touch delay: the tiles refuse the browser's pan gestures entirely (the
// dense layout keeps even 7-tile hands on screen without scrolling), so a
// drag can start the instant a finger lands.
const options = ref({
  draggable: '.draggable',
  animation: 150,
  ghostClass: 'ghost',
  dragClass: 'drag',
  forceFallback: true,
  bubbleScroll: true,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

// Full-size and positioned: the phase transition animates a transform on this
// wrapper, which makes it the containing block for the absolutely-positioned
// form below. Without explicit dimensions the form's height:100% would
// collapse to zero mid-animation and jump back after — a hard layout shift.
.group-challenge-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

#active-round {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 3rem;
  display: flex;
  position: absolute;
  pointer-events: auto;
  flex-flow: column nowrap;
  // A long-press must pick a tile up, never start iOS text selection —
  // nothing in the round is copy-worthy prose.
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  backdrop-filter: blur(0.3rem);
  transition: backdrop-filter 0.3s;
  > * {
    position: relative;
  }
}

.peeking {
  #active-round {
    pointer-events: none;
    backdrop-filter: blur(0);
  }
  footer {
    transform: translateY(calc(100% - 9rem));
  }

  #question {
    opacity: 0;
  }
}

h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
}

.peek-button {
  top: 5vh;
  z-index: 10;
  flex-shrink: 0;
  position: absolute;
  width: max-content;
  pointer-events: auto;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  .peek-icon {
    width: 4rem;
    height: 2rem;
    background: #fff;
    mask: url('~/assets/icons/eye.svg') no-repeat center/contain;
  }
}

footer {
  gap: 2rem;
  display: grid;
  padding: 0 2rem;
  transition: 0.6s;
  grid-template-rows: max-content 1fr;
  // transition: 1s;
}

.indicators {
  width: 100%;
  display: grid;
  align-items: center;
  justify-content: space-between;
  grid-template-columns: 1fr max-content 1fr;
}

// The two poles frame the ranking: they tell the player which direction is
// "more" and which is "less". They earn real prominence — an eyebrow-scale
// small-caps label sitting beside a large arrow that drifts toward its extreme,
// nudging the drag intent. Purely decorative and non-interactive, so the
// ambient loop is safe here (see mondiale-dev-quirks: never on the button).
.pole {
  gap: 1rem;
  display: inline-flex;
  align-items: center;
  color: var(--soft-blue);
}

.pole-most {
  justify-self: start;
}
.pole-least {
  justify-self: end;
}

.pole-label {
  font-weight: bold;
  font-size: 1.6rem;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dark-blue);
}

// An inline SVG rather than a ⟵/⟶ glyph: the math-arrow characters sit on the
// font's math axis, not the text baseline, so they rendered low and unevenly
// across fonts. The SVG's ink is centred in its viewBox, so flex centring lands
// it true against the label with no magic offset. Shares the label's accent
// (currentColor) so the pole reads as one unit.
.pole-arrow {
  display: block;
  width: 3rem;
  height: 1.2rem;
  flex-shrink: 0;
  overflow: visible;
  color: var(--soft-blue);
}

// Entrance: the poles ease in from their own edge as the round settles.
.pole-most {
  animation: pole-in-left var(--motion-slow) var(--ease-out-expressive) both;
}
.pole-least {
  animation: pole-in-right var(--motion-slow) var(--ease-out-expressive) both;
}

// Continuous, restrained drift on the arrow only — echoes the "drifting
// backdrop" ambient language without pulling the eye off the tiles.
.pole-most .pole-arrow {
  animation: nudge-left var(--motion-ambient) var(--ease-smooth) infinite;
}
.pole-least .pole-arrow {
  animation: nudge-right var(--motion-ambient) var(--ease-smooth) infinite;
}

@keyframes pole-in-left {
  from {
    opacity: 0;
    transform: translateX(1.6rem);
  }
}
@keyframes pole-in-right {
  from {
    opacity: 0;
    transform: translateX(-1.6rem);
  }
}
@keyframes nudge-left {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(-0.6rem);
  }
}
@keyframes nudge-right {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(0.6rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pole-most,
  .pole-least,
  .pole-most .pole-arrow,
  .pole-least .pole-arrow {
    animation: none;
  }
}

#question {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.question-caption {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .topic-icon {
    width: 2.4rem;
    height: 2.4rem;
    opacity: 0.6;
    color: var(--dark-blue);
  }
}

.countries {
  gap: 1rem;
  width: 100%;
  display: grid;
  pointer-events: all;
  justify-content: center;
  // One row of N equal columns without knowing N (hands are 4/5/7 by
  // difficulty) — implicit tracks replace the old inline repeat(N, 1fr).
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}

.ghost {
  opacity: 0.5;
}

// Card entrance staggering is handled by the 'challenge' phase-transition
// recipe in lib/phase-transitions.ts, which targets these .country elements.

@media screen and (min-width: $tablet) {
  #active-round {
    padding: 0;
  }
}

// Vertical ranking on phones: the tiles stack as wide bars (CountryTile's own
// $tablet mode), framed by the poles — most on top, least on bottom — with
// the submit button last. The DOM order is unchanged; `display: contents`
// lets the footer reorder the indicator pieces around the list.
@media screen and (max-width: $tablet) {
  #active-round {
    padding: calc(1.2rem + var(--safe-top)) calc(1.2rem + var(--safe-right))
      calc(1.2rem + var(--safe-bottom)) calc(1.2rem + var(--safe-left));
  }

  // No peek on phones: the vertical list owns the screen and the blurred map
  // behind it isn't worth a control. (The map is fully visible between rounds.)
  .peek-button {
    display: none;
  }

  // The question keeps its caption intact (min-height: auto) and absorbs
  // only the leftover space; when the screen runs short the deficit lands on
  // the tile list, which compresses toward its row minimum and then scrolls.
  #question {
    height: auto;
    flex: 1 1 auto;

    h1 {
      margin-bottom: 0;
    }
  }

  footer {
    gap: 1.2rem;
    display: flex;
    flex: 0 1 auto;
    min-height: 0;
    padding: 0;
    flex-flow: column nowrap;
  }

  .indicators {
    display: contents;
  }

  .pole-most {
    order: 1;
    align-self: center;
    flex-shrink: 0;
  }
  .countries {
    order: 2;
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    // A drag that overshoots the list must not chain into a page bounce —
    // the rubber-banding wrestles the tile out of the player's finger.
    overscroll-behavior: contain;
    // Breathing room so the first/last tile's hairline border isn't shaved
    // by the scroll container's clip edge.
    padding: 0.2rem 0;
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: minmax(4.6rem, 6.4rem);
    justify-content: stretch;
  }
  .pole-least {
    order: 3;
    align-self: center;
    flex-shrink: 0;
  }
  .indicators > .button {
    order: 4;
    width: 100%;
    flex-shrink: 0;
  }

  // Every hand fits on screen (dense sizing covers 7-tile hard hands), so
  // there is never anything to scroll: refuse the pan entirely and drags
  // start the instant a finger lands.
  .country {
    touch-action: none;
  }

  // Hard hands (6–7 tiles): tighter rows, gaps and flags so the whole hand
  // still shares one screen with the poles and submit — scroll-free.
  .countries.dense {
    gap: 0.6rem;
    grid-auto-rows: minmax(4rem, 5.2rem);

    :deep(.country-tile article) {
      padding: 0.4rem 1.2rem;
    }
    :deep(.flag svg) {
      max-height: 3.4rem;
    }
  }

  // Point the arrows at their extremes: the left-pointing "most" arrow turns
  // up, the right-pointing "least" arrow turns down. A square layout box
  // keeps the rotated ink tight against the label instead of leaving the
  // original 3rem-wide gap. The horizontal nudge loops animate the wrong
  // axis here, so they rest.
  .pole {
    gap: 0.6rem;
  }
  .pole-label {
    font-size: 1.3rem;
    letter-spacing: 0.12em;
  }
  .pole-most .pole-arrow,
  .pole-least .pole-arrow {
    width: 2rem;
    height: 2rem;
    transform: rotate(90deg);
    animation: none;
  }
}
</style>
