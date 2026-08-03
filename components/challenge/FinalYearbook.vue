<template>
  <div class="final-yearbook" :class="{ committed }">
    <article class="front-page">
      <header class="masthead">
        <span class="paper-name">The World Gazette</span>
        <span class="edition">
          <template v-if="!committed">
            Year unknown · headline {{ shownCount }}/{{ challenge.headlines.length }}
          </template>
          <template v-else>All the news of one year</template>
        </span>
        <span v-if="committed && year !== undefined" class="year-stamp">{{
          formatEventYear(year)
        }}</span>
      </header>
      <TransitionGroup name="headline" tag="ul" class="stories" aria-live="polite">
        <li v-for="story in stories" :key="story.slug" class="story">
          <span class="kicker eyebrow">{{ story.kicker }}</span>
          <h3 class="headline">
            {{ story.name }}
            <span v-if="committed && year !== undefined" class="date-stamp">{{
              formatEventYear(year)
            }}</span>
          </h3>
          <p v-if="committed" class="body">{{ story.description }}</p>
        </li>
      </TransitionGroup>
    </article>
    <footer v-if="!committed" class="dial-console">
      <div class="dial-row">
        <button
          v-for="jump in [-100, -10]"
          :key="jump"
          type="button"
          class="step map-caption"
          :class="jump === -10 ? 'fine' : 'coarse'"
          :disabled="paused"
          @click="nudge(jump)"
        >
          {{ jump }}
        </button>
        <div
          ref="tape"
          class="tape"
          role="slider"
          tabindex="0"
          aria-label="Year dial"
          :aria-valuemin="DIAL_MIN"
          :aria-valuemax="DIAL_MAX"
          :aria-valuenow="shownYear"
          :aria-valuetext="formatEventYear(shownYear)"
          @pointerdown="onDialDown"
          @pointermove="onDialMove"
          @pointerup="onDialUp"
          @pointercancel="onDialUp"
          @keydown="onDialKeys"
          @wheel.prevent="onDialWheel"
        >
          <span
            v-for="tick in ticks"
            :key="tick.year"
            class="tick"
            :class="{ decade: tick.decade, century: tick.century }"
            :style="{ transform: `translateX(${tick.offset}px)` }"
          >
            <em v-if="tick.decade">{{ formatEventYear(tick.year) }}</em>
          </span>
          <span class="needle" aria-hidden="true" />
          <strong class="readout">{{ formatEventYear(shownYear) }}</strong>
        </div>
        <button
          v-for="jump in [10, 100]"
          :key="jump"
          type="button"
          class="step map-caption"
          :class="jump === 10 ? 'fine' : 'coarse'"
          :disabled="paused"
          @click="nudge(jump)"
        >
          +{{ jump }}
        </button>
      </div>
      <div class="commit-row">
        <ButtonFilled :disabled="paused" @click="commit">
          <span class="commit-label">Commit {{ formatEventYear(shownYear) }}</span>
          <!-- Invisible widest labels hold the button's width still while the dial spins -->
          <span
            v-for="bound in [DIAL_MIN, DIAL_MAX]"
            :key="bound"
            class="commit-sizer"
            aria-hidden="true"
            >Commit {{ formatEventYear(bound) }}</span
          >
        </ButtonFilled>
        <ChallengeTimerRadial :value="secondsLeft" :total="totalSeconds" />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { EVENTS } from '~~/data/events.gen'
import { YEARBOOK_DIAL_BOUNDS, yearbookYear } from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { EASE, MOTION, prefersReducedMotion } from '~~/lib/motion'
import { clamp } from '~~/lib/number'
import { EVENT_KIND_COPY, formatEventYear } from '~~/lib/timeline'
import {
  FLICK_PX_PER_MS,
  releaseVelocity,
  SHEET_RUBBER,
  VELOCITY_SAMPLES,
  type PointerSample,
} from '~~/lib/use-drag-sheet'
import type { YearbookChallenge } from '~~/types/challenges/final-challenge.type'
import { isValidISOCode } from '~~/types/geography.types'

/**
 * The Yearbook: a front page assembles — headlines from one year drip in on
 * the stat-detective cadence — and a year dial waits under the page. Commit
 * when confident: each extra headline narrows the answer, but the clock runs
 * out into an auto-commit of whatever the dial shows. The reveal re-uses the
 * same page: the year stamps the masthead, every headline gets its date, and
 * the event descriptions unfold as the lesson.
 */
const props = defineProps<{ challenge: YearbookChallenge; paused: boolean }>()

const emit = defineEmits<{ finished: [year: number] }>()

const DIAL_MIN = YEARBOOK_DIAL_BOUNDS.min
const DIAL_MAX = YEARBOOK_DIAL_BOUNDS.max
/** Tape gearing: one drag-pixel per ninth of a year keeps ±1 reachable by
 *  thumb while a full swipe still travels a generation. */
const PX_PER_YEAR = 9
/** Years visible either side of the needle. */
const DIAL_SPAN = 34
/** Momentum time constant, ms — a flick's glide distance is velocity × this. */
const GLIDE_TAU_MS = 260
/** Glide duration bounds, seconds — a big flick coasts, a small one settles fast. */
const GLIDE_MIN_S = 0.45
const GLIDE_MAX_S = 1.5
/** Glide duration per √year of travel, s — the coast lengthens sub-linearly. */
const GLIDE_S_PER_SQRT_YEAR = 0.18
/** One wheel notch in line mode, px — the browser's own line-height convention. */
const WHEEL_LINE_PX = 16
/** Wheel gearing is coarser than drag — a trackpad swipe covers a decade, not a lifetime. */
const WHEEL_PX_PER_YEAR = PX_PER_YEAR * 2
/** Wheel deltas stop arriving for this long → the tape settles on a whole year. */
const WHEEL_SETTLE_MS = 160

const committed = ref(false)
const shownCount = ref(1)
const secondsLeft = ref(0)
const dialYear = ref(Math.round((DIAL_MIN + DIAL_MAX) / 2 / 10) * 10)
const tape = ref<HTMLElement>()

const year = computed(() => yearbookYear(props.challenge))
/** What the needle, readout and commit all agree on — whole years inside the rails. */
const shownYear = computed(() => clamp(Math.round(dialYear.value), DIAL_MIN, DIAL_MAX))
const totalSeconds = props.challenge.headlines.length * props.challenge.secondsPerHeadline

// The reveal shows the WHOLE page — headlines the clock never dripped included
const stories = computed(() =>
  props.challenge.headlines
    .slice(0, committed.value ? props.challenge.headlines.length : shownCount.value)
    .flatMap(slug => {
      const event = EVENTS[slug]
      if (!event) return []
      const dateline = isValidISOCode(event.country)
        ? ` · ${countryName(COUNTRIES[event.country])}`
        : ''
      return [
        {
          slug,
          name: event.name,
          description: event.description,
          kicker: `${EVENT_KIND_COPY[event.kind]}${dateline}`,
        },
      ]
    })
)

// One 1s ticker drives the countdown AND the drip, stat-detective style — the
// drained arc and the headline count can never drift apart.
let ticker: ReturnType<typeof setInterval> | undefined

const commit = () => {
  if (committed.value) return
  committed.value = true
  if (ticker) clearInterval(ticker)
  ticker = undefined
  stopGlide()
  dialYear.value = shownYear.value
  emit('finished', dialYear.value)
}

const start = () => {
  if (ticker || committed.value) return
  secondsLeft.value = totalSeconds
  ticker = setInterval(() => {
    secondsLeft.value = Math.max(0, secondsLeft.value - 1)
    const elapsed = totalSeconds - secondsLeft.value
    shownCount.value = Math.min(
      props.challenge.headlines.length,
      1 + Math.floor(elapsed / props.challenge.secondsPerHeadline)
    )
    if (secondsLeft.value > 0) return
    commit()
  }, 1000)
}

const stopGlide = () => {
  gsap.killTweensOf(dialYear)
  clearTimeout(wheelSettle)
  wheelSettle = undefined
}

/** The sheet home's flick threshold, translated through the tape's gearing. */
const isFlick = (yearVelocity: number) => Math.abs(yearVelocity) * PX_PER_YEAR > FLICK_PX_PER_MS

/** Ease the tape onto a whole year — post-flick coast, spring-back from the
 *  rubber zone, and the plain release-snap all land through here. */
const settleDial = (target: number, { velocity = 0 } = {}) => {
  const to = clamp(Math.round(target), DIAL_MIN, DIAL_MAX)
  stopGlide()
  if (prefersReducedMotion()) {
    dialYear.value = to
    return
  }
  const flicked = isFlick(velocity)
  gsap.to(dialYear, {
    value: to,
    duration: flicked
      ? clamp(
          Math.sqrt(Math.abs(to - dialYear.value)) * GLIDE_S_PER_SQRT_YEAR,
          GLIDE_MIN_S,
          GLIDE_MAX_S
        )
      : MOTION.quick,
    // A flick decelerates like a spun wheel; everything else just eases home
    ease: flicked ? 'power3.out' : EASE.enter,
  })
}

const nudge = (delta: number) => {
  if (committed.value) return
  settleDial(shownYear.value + delta)
}

let dragPointer: number | undefined
let dragStartX = 0
let dragStartYear = 0
let samples: PointerSample[] = []

const onDialDown = (event: PointerEvent) => {
  if (committed.value || paused.value) return
  // Grabbing a coasting tape catches it where it is
  stopGlide()
  dragPointer = event.pointerId
  dragStartX = event.clientX
  dragStartYear = dialYear.value
  samples = [{ p: event.clientX, t: performance.now() }]
  tape.value?.setPointerCapture(event.pointerId)
  tape.value?.focus()
}

const onDialMove = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  samples.push({ p: event.clientX, t: performance.now() })
  if (samples.length > VELOCITY_SAMPLES) samples.shift()
  // Ruler physics: dragging the tape left brings later years to the needle,
  // and past either end the tape rubber-bands instead of walling
  const raw = dragStartYear - (event.clientX - dragStartX) / PX_PER_YEAR
  dialYear.value =
    raw < DIAL_MIN
      ? DIAL_MIN + (raw - DIAL_MIN) * SHEET_RUBBER
      : raw > DIAL_MAX
        ? DIAL_MAX + (raw - DIAL_MAX) * SHEET_RUBBER
        : raw
}

const onDialUp = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  dragPointer = undefined
  // Finger velocity in years/ms (drag left = later years, hence the sign flip)
  const velocity = -releaseVelocity(samples) / PX_PER_YEAR
  samples = []
  const glide = isFlick(velocity) ? velocity * GLIDE_TAU_MS : 0
  settleDial(dialYear.value + glide, { velocity })
}

let wheelSettle: ReturnType<typeof setTimeout> | undefined

const onDialWheel = (event: WheelEvent) => {
  if (committed.value || paused.value) return
  stopGlide()
  const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const px = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? dominant * WHEEL_LINE_PX : dominant
  dialYear.value = clamp(dialYear.value + px / WHEEL_PX_PER_YEAR, DIAL_MIN, DIAL_MAX)
  wheelSettle = setTimeout(() => settleDial(dialYear.value), WHEEL_SETTLE_MS)
}

const DIAL_KEYS: { [key: string]: number } = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -10,
  PageUp: 10,
}

const onDialKeys = (event: KeyboardEvent) => {
  const delta = DIAL_KEYS[event.key]
  if (!delta) return
  event.preventDefault()
  nudge(delta)
}

const ticks = computed(() => {
  const centre = dialYear.value
  const marks: { year: number; offset: number; decade: boolean; century: boolean }[] = []
  for (let tick = Math.ceil(centre - DIAL_SPAN); tick <= centre + DIAL_SPAN; tick++) {
    if (tick < DIAL_MIN || tick > DIAL_MAX) continue
    marks.push({
      year: tick,
      offset: (tick - centre) * PX_PER_YEAR,
      decade: tick % 10 === 0,
      century: tick % 100 === 0,
    })
  }
  return marks
})

const paused = toRef(props, 'paused')

watch(
  paused,
  isPaused => {
    if (!isPaused) start()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  stopGlide()
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Bespoke positioned stage per the challenge-shell contract (the scales
// precedent): the page and its dial stand above the map and opt back in.
.final-yearbook {
  gap: 1rem;
  left: 50%;
  bottom: 2.4rem;
  display: flex;
  position: absolute;
  align-items: stretch;
  pointer-events: auto;
  flex-flow: column nowrap;
  transform: translateX(-50%);
  width: min(58rem, calc(100vw - 2.4rem));
  max-height: calc(100% - 16rem);
  transition: max-height var(--motion-slow) var(--ease-smooth);

  // The stamped page ducks under the verdict card and its lesson line
  &.committed {
    max-height: calc(100% - 37rem);
  }
}

.front-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  padding: 1.6rem 2rem;
  border-radius: 0.6rem;
  color: var(--dark-blue);
  background: milk(0.96);
  border: 0.1rem solid ink(0.25);
  box-shadow: 0 0.4rem 2.4rem ink(0.18);
}

// One grid, two mastheads: desktop stamps the year in the right column,
// the phone restacks it under the subtitle — no absolute corners to collide
.masthead {
  row-gap: 0.3rem;
  display: grid;
  text-align: center;
  align-items: center;
  grid-template-areas:
    '. name stamp'
    '. edition stamp';
  grid-template-columns: 1fr auto 1fr;
  padding-bottom: 0.8rem;
  margin-bottom: 1.2rem;
  border-bottom: 0.4rem double ink(0.7);

  .paper-name {
    grid-area: name;
    font-size: 2.4rem;
    font-weight: bold;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .edition {
    grid-area: edition;
    opacity: 0.65;
    font-size: 1.2rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
}

// The committed year inks the masthead's shoulder like a date received
.year-stamp {
  grid-area: stamp;
  justify-self: end;
  align-self: start;
  padding: 0.2rem 0.9rem;
  font-size: 1.9rem;
  font-weight: bold;
  color: flame(0.95);
  transform: rotate(-7deg);
  border: 0.3rem solid flame(0.75);
  border-radius: 0.5rem;
  animation: stamp-thump 0.4s var(--ease-out-expressive) both;
}

.stories {
  margin: 0;
  padding: 0;
  list-style: none;
}

.story {
  padding: 1rem 0;

  & + .story {
    border-top: $hairline;
  }

  .kicker {
    margin-bottom: 0.2rem;
  }

  .headline {
    margin: 0;
    font-size: 1.9rem;
    line-height: 1.25;
  }

  .date-stamp {
    font-size: 1.2rem;
    font-weight: bold;
    color: flame(0.9);
    margin-left: 0.6rem;
    padding: 0.1rem 0.6rem;
    vertical-align: 0.2rem;
    white-space: nowrap;
    border: 0.15rem solid flame(0.6);
    border-radius: 0.4rem;
    display: inline-block;
    transform: rotate(-4deg);
  }

  .body {
    margin: 0.6rem 0 0;
    font-size: 1.45rem;
    line-height: 1.5;
    opacity: 0.85;
  }
}

.dial-console {
  gap: 1rem;
  display: flex;
  padding: 1.2rem 1.4rem;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  background: milk(0.92);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem hsla(216, 58%, 10%, 0.18);

  --clock-size: 4.6rem;
  --clock-seconds-size: 1.5rem;
}

.dial-row {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  align-items: center;
}

.step {
  cursor: pointer;
  flex-shrink: 0;
  font-size: 1.3rem;
  font-weight: bold;
  padding: 0.5rem 0.8rem;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.tape {
  flex: 1;
  height: 6rem;
  min-width: 0;
  cursor: grab;
  overflow: hidden;
  position: relative;
  touch-action: none;
  user-select: none;
  // Digits hold their column while the tape spins — no shimmering labels
  font-variant-numeric: tabular-nums;
  border-radius: 0.8rem;
  background: ink(0.06);
  border: 0.1rem solid ink(0.2);
  // The ends fade — the tape reads as a window onto a longer ruler
  mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 0.2rem solid var(--soft-blue);
  }
}

.tick {
  left: 50%;
  width: 0.1rem;
  bottom: 0.5rem;
  height: 0.9rem;
  position: absolute;
  background: ink(0.35);

  &.decade {
    height: 1.6rem;
    background: ink(0.6);
  }

  &.century {
    height: 2.2rem;
    background: ink(0.85);
  }

  em {
    left: 50%;
    bottom: 100%;
    position: absolute;
    margin-bottom: 0.3rem;
    transform: translateX(-50%);
    font-size: 1.05rem;
    font-style: normal;
    white-space: nowrap;
    color: ink(0.65);
  }

  &.century em {
    font-weight: bold;
    color: ink(0.9);
  }
}

.needle {
  top: 0;
  left: 50%;
  bottom: 0;
  width: 0.2rem;
  position: absolute;
  background: flame(0.9);
}

.readout {
  top: 0.3rem;
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
  padding: 0 0.6rem;
  font-size: 1.5rem;
  border-radius: 0.4rem;
  color: var(--dark-blue);
  background: milk(0.85);
}

// The commit button owns dead centre; the clock stands offset beside it
.commit-row {
  gap: 1.2rem;
  width: 100%;
  display: grid;
  align-items: center;
  grid-template-columns: 1fr auto 1fr;

  // The label and its hidden widest siblings share one grid cell, so the
  // button holds the width of "Commit <widest bound>" while the year spins
  .filled {
    grid-column: 2;
    display: inline-grid;
    align-items: center;
    justify-items: center;
    font-variant-numeric: tabular-nums;
  }

  .commit-label,
  .commit-sizer {
    grid-area: 1 / 1;
    white-space: nowrap;
  }

  .commit-sizer {
    visibility: hidden;
  }

  .radial-timer {
    grid-column: 3;
    justify-self: start;
  }
}

// New headlines land with the clue-stage settle
.stories .headline-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}

.stories .headline-enter-from {
  opacity: 0;
  transform: translateY(1.2rem) scale(0.97);
}

@keyframes stamp-thump {
  from {
    opacity: 0;
    transform: rotate(-7deg) scale(1.7);
  }
  to {
    opacity: 1;
    transform: rotate(-7deg) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .year-stamp {
    animation: none;
  }
}

@media screen and (max-width: $tablet) {
  .final-yearbook {
    bottom: 1.2rem;
    max-height: calc(100% - 16rem);

    &.committed {
      max-height: calc(100% - 41rem);
    }
  }

  .masthead .paper-name {
    font-size: 1.8rem;
  }

  // The masthead spans the phone, so the stamp row restacks under the subtitle
  .masthead {
    grid-template-areas:
      'name'
      'edition'
      'stamp';
    grid-template-columns: 1fr;
  }

  .year-stamp {
    justify-self: center;
    margin-top: 0.1rem;
    font-size: 1.4rem;
    border-width: 0.2rem;
  }

  .story .headline {
    font-size: 1.6rem;
  }

  // Drag owns the fine moves on a phone, so the ±10 give way — the century
  // jumps stay, because a thumb-drag across 300 years is the real chore
  .step.fine {
    display: none;
  }
}
</style>
