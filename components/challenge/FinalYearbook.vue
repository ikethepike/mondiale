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
      <DragDial
        v-model="dialYear"
        :min="DIAL_MIN"
        :max="DIAL_MAX"
        :format="formatEventYear"
        :disabled="paused"
        label="Year dial"
      />
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
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import DragDial from '~/components/challenge/DragDial.vue'
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

const committed = ref(false)
const shownCount = ref(1)
const secondsLeft = ref(0)
const dialYear = ref(Math.round((DIAL_MIN + DIAL_MAX) / 2 / 10) * 10)

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
  // The dial unmounts with the console and kills its own tweens on the way out
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
}
</style>
