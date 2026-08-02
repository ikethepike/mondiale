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
          :aria-valuenow="Math.round(dialYear)"
          :aria-valuetext="formatEventYear(Math.round(dialYear))"
          @pointerdown="onDialDown"
          @pointermove="onDialMove"
          @pointerup="onDialUp"
          @pointercancel="onDialUp"
          @keydown="onDialKeys"
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
          <strong class="readout">{{ formatEventYear(Math.round(dialYear)) }}</strong>
        </div>
        <button
          v-for="jump in [10, 100]"
          :key="jump"
          type="button"
          class="step map-caption"
          :disabled="paused"
          @click="nudge(jump)"
        >
          +{{ jump }}
        </button>
      </div>
      <div class="commit-row">
        <ButtonFilled :disabled="paused" @click="commit"
          >Commit {{ formatEventYear(Math.round(dialYear)) }}</ButtonFilled
        >
        <ChallengeTimerRadial :value="secondsLeft" :total="totalSeconds" />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { EVENTS } from '~~/data/events.gen'
import { YEARBOOK_DIAL_BOUNDS, yearbookYear } from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { clamp } from '~~/lib/number'
import { EVENT_KIND_COPY, formatEventYear } from '~~/lib/timeline'
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

const committed = ref(false)
const shownCount = ref(1)
const secondsLeft = ref(0)
const dialYear = ref(Math.round((DIAL_MIN + DIAL_MAX) / 2 / 10) * 10)
const tape = ref<HTMLElement>()

const year = computed(() => yearbookYear(props.challenge))
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
  dialYear.value = Math.round(dialYear.value)
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

const nudge = (delta: number) => {
  if (committed.value) return
  dialYear.value = clamp(Math.round(dialYear.value) + delta, DIAL_MIN, DIAL_MAX)
}

let dragPointer: number | undefined
let dragStartX = 0
let dragStartYear = 0

const onDialDown = (event: PointerEvent) => {
  if (committed.value || paused.value) return
  dragPointer = event.pointerId
  dragStartX = event.clientX
  dragStartYear = dialYear.value
  tape.value?.setPointerCapture(event.pointerId)
  tape.value?.focus()
}

const onDialMove = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  // Ruler physics: dragging the tape left brings later years to the needle
  dialYear.value = clamp(
    dragStartYear - (event.clientX - dragStartX) / PX_PER_YEAR,
    DIAL_MIN,
    DIAL_MAX
  )
}

const onDialUp = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  dragPointer = undefined
  dialYear.value = Math.round(dialYear.value)
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

.masthead {
  gap: 0.3rem;
  display: flex;
  position: relative;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
  padding-bottom: 0.8rem;
  margin-bottom: 1.2rem;
  border-bottom: 0.4rem double ink(0.7);

  .paper-name {
    font-size: 2.4rem;
    font-weight: bold;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .edition {
    opacity: 0.65;
    font-size: 1.2rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
}

// The committed year inks the masthead corner like a date received
.year-stamp {
  top: -0.4rem;
  right: -0.6rem;
  position: absolute;
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

.commit-row {
  gap: 1.2rem;
  display: flex;
  align-items: center;
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

  .year-stamp {
    top: -0.2rem;
    right: -0.4rem;
    font-size: 1.4rem;
    border-width: 0.2rem;
  }

  .story .headline {
    font-size: 1.6rem;
  }

  // The century jumps give way — drag and ±10 still cover the board
  .step:first-child,
  .step:last-child {
    display: none;
  }
}
</style>
