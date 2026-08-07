<template>
  <div class="final-change" :class="{ dialing: dialed && !committed }">
    <!-- The subject is the same at both sizes; only where it stands differs.
         Desktop parks it on the side rail beside a clickable map; a phone has
         no rail to spare, so it rides MediaDock — studied over a scrim, then
         docked to a thumb so the map underneath can be tapped at all. -->
    <aside v-if="!isPhone" class="side-stage change-stage">
      <FinalChangeFrames v-bind="frameProps" />
    </aside>
    <MediaDock
      v-else
      v-model:expanded="framesExpanded"
      class="change-dock"
      :src="challenge.frames[1]"
      :alt="LATER_ALT"
    >
      <FinalChangeFrames v-bind="frameProps" />
    </MediaDock>

    <!-- The berth and the bottom clearance ride .shell-footer untouched; the
         card look lives on the console inside it. Re-padding the footer is
         what severs the keyboard lift. -->
    <footer v-if="dialed && !committed" ref="consoleFooter" class="shell-footer">
      <div class="change-console">
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
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import DragDial from '~/components/challenge/DragDial.vue'
import FinalChangeFrames from '~/components/challenge/FinalChangeFrames.vue'
import MediaDock from '~/components/challenge/MediaDock.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { CHANGE_DIAL_BOUNDS } from '~~/lib/challenges/final-challenge'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useIsPhone } from '~~/lib/use-viewport'
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
 *
 * This component is placement and answer flow only; the frames themselves are
 * FinalChangeFrames. The split is what lets the same subject stand on the
 * desktop side rail and inside the phone's dock — it used to be one bespoke
 * column at both sizes, a square frame over the middle of the screen with no
 * way to move it, which on a phone left no map to tap and no way to answer.
 */
const props = defineProps<{ challenge: ChangeChallenge; paused: boolean }>()

const emit = defineEmits<{ finished: [answer: { isoCode: ISOCountryCode; decade: number }] }>()

const LATER_ALT = 'The same place years later, the second of two frames'

const DIAL_MIN = CHANGE_DIAL_BOUNDS.min
const DIAL_MAX = CHANGE_DIAL_BOUNDS.max

/** Whether this round asks for the decade as well as the place. Compared
 *  against undefined: a tolerance of 0 would mean "must be exact", not "no
 *  dial", and truthiness reads those two the same way. */
const dialed = computed(() => props.challenge.decadeTolerance !== undefined)

const isPhone = useIsPhone()
const committed = ref(false)
const tapped = ref<ISOCountryCode>()
const dialDecade = ref(Math.round((DIAL_MIN + DIAL_MAX) / 2 / 10) * 10)
const consoleFooter = ref<HTMLElement>()

/** Open to study, then docked to a thumb — the pin-drop modes' choreography. */
const framesExpanded = ref(true)

const frameProps = computed(() => ({ challenge: props.challenge, paused: props.paused }))

useFooterBerth(consoleFooter)

const formatDecade = (year: number) => `${year}s`
const shownDecade = computed(() => Math.round(dialDecade.value / 10) * 10)

const commit = () => {
  if (committed.value || !tapped.value) return
  committed.value = true
  emit('finished', { isoCode: tapped.value, decade: shownDecade.value })
}

/**
 * Only the dial difficulties hold the tap: elsewhere the view submits it.
 *
 * The dock is closed by then either way — its scrim covers the map — so the
 * collapse here is the belt to that brace, and it keeps the thumb honest if
 * the player reopens the frames between the tap and the commit.
 */
const onMapClick = (event: Event) => {
  if (!dialed.value || committed.value || props.paused) return
  if (!isMapClickEvent(event)) return
  const { isoCode } = event.detail
  if (!isValidISOCode(isoCode)) return
  tapped.value = isoCode
  framesExpanded.value = false
}

onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
onBeforeUnmount(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Placement only. The shell is pointer-events: none for the map's sake, and
// the surfaces inside opt themselves back in, so this wrapper must not — a
// full-bleed `pointer-events: auto` here is what would swallow map taps.
//
// A column that ends at the bottom, never a hand-rolled `bottom:` — the
// footer's berth and its --bottom-clearance are the shell's to give.
.final-change {
  inset: 0;
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: flex-end;
}

// The frames are not the standard photo frame: satellite imagery is square,
// and the side-photo recipe's landscape box would letterbox it. Sized here,
// placed by .side-stage.
.side-stage.change-stage {
  width: clamp(16rem, 20vw, 22rem);
  height: clamp(16rem, 20vw, 22rem);

  @media (hover: hover) and (min-width: #{$tablet-wide + 1}) {
    &:hover {
      width: clamp(26rem, 38vw, 40rem);
      height: clamp(26rem, 38vw, 40rem);
    }
  }
}

// The docked thumb stands bottom-left, clear of the console when there is one
// — the map between them is the answer surface and must stay tappable.
.change-dock {
  --dock-lift: 2rem;

  left: 1.2rem;
  z-index: 2;
  position: absolute;
  bottom: calc(var(--dock-lift) + var(--safe-bottom));
}

// Lifted clear of the console while there is one — and back down once the
// commit takes it away, so the thumb is not left floating at the reveal.
.final-change.dialing .change-dock {
  --dock-lift: 14rem;
}

// The dock's frame is landscape by default; the satellite pair wants its
// square back, within what a phone can spare. One dimension drives both —
// capping height separately would letterbox the imagery it is here to show,
// and leave scrim the player thinks is frame.
.change-dock :deep(.dock-frame) {
  --frame-size: min(92vw, 46dvh, 40rem);

  width: var(--frame-size);
  height: var(--frame-size);
}

.shell-footer {
  display: flex;
  justify-content: center;
}

.change-console {
  gap: 1rem;
  display: flex;
  padding: 1.2rem 1.4rem;
  align-items: center;
  pointer-events: auto;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  background: milk(0.92);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem ink(0.18);
  width: min(46rem, 100%);
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
  .change-console {
    width: min(34rem, 100%);
  }
}
</style>
