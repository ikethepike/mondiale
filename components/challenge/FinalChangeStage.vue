<template>
  <div class="final-change">
    <article class="frame-stage" :class="{ dialing: dialed }">
      <!-- Both frames are stacked and identically framed; only the later one
           animates, so the pair never blinks through to the page mid-cross. -->
      <img class="frame" :src="challenge.frames[0]" :alt="EARLIER_ALT" />
      <img
        ref="laterFrame"
        class="frame later"
        :class="{ still: paused || reducedMotion, shown: manualLater }"
        :src="challenge.frames[1]"
        :alt="LATER_ALT"
        :style="{ animationDuration: `${challenge.crossfadeSeconds * 2}s` }"
      />
      <span v-if="challenge.frameYears" class="years" aria-hidden="true">
        <em :class="{ lit: !showingLater }">{{ challenge.frameYears[0] }}</em>
        <i>→</i>
        <em :class="{ lit: showingLater }">{{ challenge.frameYears[1] }}</em>
      </span>
      <!-- Reduced motion swaps the loop for a control the player drives -->
      <button
        v-if="reducedMotion && !paused"
        type="button"
        class="swap map-caption"
        @click="manualLater = !manualLater"
      >
        {{ manualLater ? 'Show the earlier frame' : 'Show the later frame' }}
      </button>
    </article>

    <footer v-if="dialed && !committed" ref="consoleFooter" class="shell-footer">
      <DragDial
        v-model="dialDecade"
        :min="DIAL_MIN"
        :max="DIAL_MAX"
        :step="10"
        :jumps="[10, 50]"
        :format="formatDecade"
        :disabled="paused"
        label="Decade dial"
      />
      <div class="commit-row">
        <ButtonFilled :disabled="paused || !tapped" @click="commit">
          <span class="commit-label">
            {{ tapped ? `Commit ${formatDecade(shownDecade)}` : 'Tap the map first' }}
          </span>
          <!-- Invisible widest labels hold the button's width still -->
          <span
            v-for="bound in [DIAL_MIN, DIAL_MAX]"
            :key="bound"
            class="commit-sizer"
            aria-hidden="true"
            >Commit {{ formatDecade(bound) }}</span
          >
        </ButtonFilled>
        <CountryChip v-if="tapped" :country="COUNTRIES[tapped]" />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import DragDial from '~/components/challenge/DragDial.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { CHANGE_DIAL_BOUNDS } from '~~/lib/challenges/final-challenge'
import { prefersReducedMotion } from '~~/lib/motion'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import type { ChangeChallenge } from '~~/types/challenges/final-challenge.type'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'
import { isMapClickEvent } from '~~/types/events.types'

/**
 * World of Change: two satellite frames of one place, decades apart, crossfade
 * on a loop. The player taps where on earth it is — and where the difficulty
 * asks for it, dials the decade the change began and commits both together.
 *
 * On tap-only difficulties the view's own map handler submits and this stage
 * is pure spectacle. Where the dial is in play the answer needs two halves, so
 * the stage holds the tapped country until commit and emits them as one.
 */
const props = defineProps<{ challenge: ChangeChallenge; paused: boolean }>()

const emit = defineEmits<{ finished: [answer: { isoCode: ISOCountryCode; decade: number }] }>()

const EARLIER_ALT = 'Satellite view of a place, the earlier of two frames'
const LATER_ALT = 'The same place years later, the second of two frames'

const DIAL_MIN = CHANGE_DIAL_BOUNDS.min
const DIAL_MAX = CHANGE_DIAL_BOUNDS.max

/** Whether this round asks for the decade as well as the place. Compared
 *  against undefined: a tolerance of 0 would mean "must be exact", not "no
 *  dial", and truthiness reads those two the same way. */
const dialed = computed(() => props.challenge.decadeTolerance !== undefined)

const reducedMotion = prefersReducedMotion()
const committed = ref(false)
const manualLater = ref(false)
const tapped = ref<ISOCountryCode>()
const laterFrame = ref<HTMLImageElement>()
const dialDecade = ref(Math.round((DIAL_MIN + DIAL_MAX) / 2 / 10) * 10)
const consoleFooter = ref<HTMLElement>()

useFooterBerth(consoleFooter)

const formatDecade = (year: number) => `${year}s`
const shownDecade = computed(() => Math.round(dialDecade.value / 10) * 10)

/**
 * Which frame the year chips light. Read from the fading element itself rather
 * than a timer beside it: a `setInterval` at half the period drifts against
 * the compositor, and even in phase it disagreed with the picture for the
 * tail of every cycle, since the frame starts fading back at 88% while a
 * half-period tick only flips at 100%.
 */
const showingLater = ref(false)
let raf: number | undefined

const trackFrame = () => {
  const el = laterFrame.value
  if (el) {
    const [animation] = el.getAnimations()
    const period = props.challenge.crossfadeSeconds * 2 * 1000
    const t = Number(animation?.currentTime ?? 0) % period
    // The later frame is opaque across the keyframe's 50%–88% hold
    showingLater.value = t / period >= 0.5 && t / period < 0.88
  }
  raf = requestAnimationFrame(trackFrame)
}

watch(
  [() => props.paused, () => props.challenge.slug],
  () => {
    if (raf) cancelAnimationFrame(raf)
    raf = undefined
    showingLater.value = false
    if (props.paused || reducedMotion) return
    raf = requestAnimationFrame(trackFrame)
  },
  { immediate: true }
)

watch(manualLater, value => {
  if (reducedMotion) showingLater.value = value
})

const commit = () => {
  if (committed.value || !tapped.value) return
  committed.value = true
  emit('finished', { isoCode: tapped.value, decade: shownDecade.value })
}

/** Only the dial difficulties listen: elsewhere the view submits the tap. */
const onMapClick = (event: Event) => {
  if (!dialed.value || committed.value || props.paused) return
  if (!isMapClickEvent(event)) return
  const { isoCode } = event.detail
  if (isValidISOCode(isoCode)) tapped.value = isoCode
}

onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
onBeforeUnmount(() => {
  document.removeEventListener('mapClick', onMapClick)
  if (raf) cancelAnimationFrame(raf)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Bespoke positioned stage per the challenge-shell contract (the yearbook
// precedent): the frames stand above the map and opt back in.
.final-change {
  gap: 1rem;
  left: 50%;
  bottom: 2.4rem;
  display: flex;
  position: absolute;
  align-items: stretch;
  pointer-events: auto;
  flex-flow: column nowrap;
  transform: translateX(-50%);
  width: min(46rem, calc(100vw - 2.4rem));
}

.frame-stage {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 0.6rem;
  background: ink(0.08);
  border: 0.1rem solid ink(0.25);
  box-shadow: 0 0.4rem 2.4rem ink(0.18);
}

.frame {
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  position: absolute;
}

// Only the later frame moves; `frame-cross` lives in rules/_animations.scss.
// The period is the round's own crossfadeSeconds, bound inline.
.frame.later {
  opacity: 0;
  animation: frame-cross 5s var(--ease-smooth) infinite;

  &.still {
    animation: none;
  }

  &.shown {
    opacity: 1;
  }
}

.years {
  gap: 0.6rem;
  left: 50%;
  bottom: 0.8rem;
  display: flex;
  position: absolute;
  padding: 0.3rem 1rem;
  align-items: center;
  border-radius: 0.6rem;
  background: milk(0.88);
  color: var(--dark-blue);
  transform: translateX(-50%);
  font-variant-numeric: tabular-nums;

  em {
    opacity: 0.4;
    font-style: normal;
    font-size: 1.4rem;
    transition: opacity var(--motion-base) var(--ease-smooth);

    &.lit {
      opacity: 1;
      font-weight: bold;
    }
  }

  i {
    opacity: 0.5;
    font-style: normal;
  }
}

.swap {
  top: 0.8rem;
  right: 0.8rem;
  cursor: pointer;
  position: absolute;
  padding: 0.4rem 0.9rem;
  border-radius: 0.6rem;
  background: milk(0.9);
  color: var(--dark-blue);
  border: 0.1rem solid ink(0.2);
}

.shell-footer {
  gap: 1rem;
  display: flex;
  padding: 1.2rem 1.4rem;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  background: milk(0.92);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem ink(0.18);
}

// The commit button owns dead centre; the tapped chip stands beside it
.commit-row {
  gap: 1.2rem;
  width: 100%;
  display: grid;
  align-items: center;
  grid-template-columns: 1fr auto 1fr;

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

  .country-chip {
    grid-column: 3;
    justify-self: start;
  }
}

@media screen and (max-width: $tablet) {
  .final-change {
    bottom: 1.2rem;
    width: min(34rem, calc(100vw - 2.4rem));
  }
}
</style>
