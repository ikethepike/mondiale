<template>
  <div v-if="challenge" class="pyramid-scheme challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="pyramid-scheme"
      title="Whose country is this?"
      :stakes="`Every country has an age structure like a fingerprint. Match all ${challenge.countries.length} — you are paid for each one you get right.`"
      @done="begin({ onTimeout: () => lockIn() })"
    />

    <ChallengeTimerRadial
      v-if="!locked && !showInterstitial"
      class="round-clock"
      :value="secondsLeft"
      :total="challenge.durationSeconds"
    />

    <ChallengePrompt :attributions="datasetAttribution('wpp')">
      <h1 v-if="!locked" class="map-caption">Drag each country onto its own age pyramid</h1>
      <ChallengeResult
        v-if="locked"
        :status="correctCount === challenge.countries.length ? 'correct' : 'incorrect'"
        :correct-message="`All ${challenge.countries.length}`"
        :incorrect-message="
          correctCount ? `${correctCount} of ${challenge.countries.length}` : 'Not this time'
        "
      >
        {{ verdictLine }}
      </ChallengeResult>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <section class="stage">
      <!-- The clock of the round: sixty years sweeping past, ticking. -->
      <div class="yearbar">
        <span class="odometer">{{ shownYear }}</span>
        <span class="span-label">{{ PYRAMID_YEARS[0] }} → {{ PYRAMID_YEARS.at(-1) }}</span>
      </div>

      <ul class="cards" :style="{ '--subject-count': challenge.countries.length }">
        <li
          v-for="(isoCode, slot) in challenge.countries"
          :key="isoCode"
          class="card"
          :class="slotClass(slot)"
          :style="{ '--settle-index': slot }"
        >
          <header>
            <span class="slot-letter">{{ SLOT_LETTERS[slot] }}</span>
          </header>

          <PopulationPyramid
            :iso-code="isoCode"
            :frame="frame"
            :peak="peak"
            :scar="locked ? pyramidScar(isoCode) : undefined"
          />

          <p class="axis">
            <span>← men</span>
            <span>women →</span>
          </p>

          <!-- The nameplate: where a country lives once it has been placed. A
               drop target rather than a list, so the same pill can be dragged
               back out to the tray on a change of mind.

               Once the answers are locked the plate stops being a Sortable and
               states the TRUTH instead: leaving the live list mounted would keep
               Sortable's own node beside the one Vue re-renders, and the plate
               would name the country twice. -->
          <div v-if="locked" class="plate filled truth">
            <CountryChip tag="span" :country="getCountry(isoCode)" class="plate-chip" />
            <span v-if="assignment[slot] && assignment[slot] !== isoCode" class="you-said">
              you said {{ countryName(assignment[slot]!) }}
            </span>
          </div>
          <!-- The hint sits INSIDE the well, not after it: as a sibling it had
               to be dragged back over an empty plate with a negative margin,
               and every card's stack shifted by whatever that overlap missed. -->
          <div v-else class="well" :class="{ filled: !!placedIn(slot).length }">
            <Sortable
              :key="`plate-${slot}-${revision}`"
              :list="placedIn(slot)"
              :item-key="(iso: ISOCountryCode) => iso"
              :options="dropOptions"
              class="plate"
              :data-slot="slot"
              @add="event => onDrop(event, slot)"
            >
              <template #item="{ element }">
                <div class="draggable">
                  <CountryChip tag="span" :country="getCountry(element)" class="plate-chip" />
                </div>
              </template>
            </Sortable>
            <span v-if="!placedIn(slot).length" class="plate-hint">drop a country here</span>
          </div>
        </li>
      </ul>

      <!-- The tray. Countries stay large and legible here: they are half the
           puzzle, not a legend. -->
      <Sortable
        v-if="!locked"
        :key="`tray-${revision}`"
        :list="unplaced"
        :item-key="(iso: ISOCountryCode) => iso"
        :options="sourceOptions"
        class="tray"
        :class="{ spent: !unplaced.length }"
        @add="onReturn"
      >
        <template #item="{ element }">
          <div class="draggable">
            <CountryChip tag="span" :country="getCountry(element)" class="tray-chip" />
          </div>
        </template>
      </Sortable>
    </section>

    <footer v-if="!locked" ref="footerEl" class="shell-footer">
      <ButtonFilled :disabled="unplaced.length > 0" @click="lockIn()">
        {{ unplaced.length ? `${unplaced.length} still to place` : 'Lock in answers' }}
      </ButtonFilled>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { Sortable } from 'sortablejs-vue3'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import PopulationPyramid from '~/components/challenge/PopulationPyramid.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { placedTotalFor } from '~~/lib/live-guess-policy'
import { DRAG_SOURCE_OPTIONS, DROP_TARGET_OPTIONS } from '~~/lib/drag-list'
import { prefersReducedMotion } from '~~/lib/motion'
import { PYRAMID_YEARS, pyramidPeakShare, pyramidScar, pyramidYearAt } from '~~/lib/pyramids'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/** How long one sweep of the sixty years takes, and the pause at each end. */
const SWEEP_MS = 11000
const HOLD_MS = 1100

const SLOT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const {
  challenge,
  showInterstitial,
  secondsLeft,
  begin,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('pyramid-scheme-challenge')

const footerEl = ref<HTMLElement>()
useFooterBerth(footerEl)

/** slot index → the country dropped on it. */
const assignment = ref<(ISOCountryCode | undefined)[]>([])
const locked = ref(false)

const subjects = computed<ISOCountryCode[]>(() => challenge.value?.countries ?? [])

/** ONE domain across every card, so a bar's length means the same thing on all
 *  of them and the sweep never rescales under the player. */
const peak = computed(() => pyramidPeakShare(subjects.value))

const unplaced = computed(() =>
  subjects.value.filter(isoCode => !assignment.value.includes(isoCode))
)

const placedIn = (slot: number): ISOCountryCode[] => {
  const placed = assignment.value[slot]
  return placed ? [placed] : []
}

const correctCount = computed(
  () => subjects.value.filter((isoCode, slot) => assignment.value[slot] === isoCode).length
)

const verdictLine = computed(() => {
  const total = subjects.value.length
  if (correctCount.value === total) return 'Every shape read right'
  if (!correctCount.value) return 'Every one of them went to the wrong country'
  return 'The rest went to the wrong country'
})

const slotClass = (slot: number) => {
  if (!locked.value) return { filled: !!assignment.value[slot] }
  return {
    correct: assignment.value[slot] === subjects.value[slot],
    missed: assignment.value[slot] !== subjects.value[slot],
  }
}

// --- placing ----------------------------------------------------------------

/**
 * Which country was dragged. Sortable's `#item` slot owns the element it
 * renders, so a `data-` binding inside the template does not survive onto the
 * node Sortable hands back — read the ISO off the source LIST by the index
 * Sortable reports instead. `from` tells us which list it left: a plate (one
 * country) or the tray (whatever was still unplaced at drag start).
 */
const isoFromEvent = (event: {
  oldIndex?: number
  from?: HTMLElement
}): ISOCountryCode | undefined => {
  const index = event.oldIndex ?? -1
  if (index < 0) return undefined
  const fromSlot = event.from?.dataset.slot
  if (fromSlot !== undefined) return assignment.value[Number(fromSlot)]
  return unplaced.value[index]
}

/**
 * Sortable MOVES the dragged node into the receiving list, but every list here
 * is rendered from `assignment`. Left alone the two disagree: Sortable's node
 * survives beside the one Vue renders, and a country appears two, three, four
 * times over (drag Qatar around the board and it multiplies).
 *
 * So Sortable is only ever an input device. Put the node back where it came
 * from, then let the state change re-render both lists — the DOM Sortable
 * produced is always thrown away.
 */
const undoDomMove = (event: DragMoveEvent) => {
  const { item, from, oldIndex } = event
  if (!item || !from) return
  const sibling = from.children[oldIndex ?? from.children.length] ?? null
  from.insertBefore(item, sibling)
}

/** Bumped on every accepted drop so both Sortables re-key and rebuild. */
const revision = ref(0)

type DragMoveEvent = { item?: HTMLElement; from?: HTMLElement; oldIndex?: number }

const place = (event: DragMoveEvent, slot: number | undefined) => {
  const iso = isoFromEvent(event)
  undoDomMove(event)
  if (!iso || locked.value) return
  const next = [...assignment.value]
  // A country stands in one place and a slot holds one country: taking either
  // seat evicts whoever was in it back to the tray.
  const previous = next.indexOf(iso)
  if (previous !== -1) next[previous] = undefined
  if (slot !== undefined) next[slot] = iso
  assignment.value = next
  revision.value++

  // The race, not the answer: the room learns how far along someone is, never
  // which country they seated — with four subjects there are only 24
  // arrangements, so one named placement would hand over most of the puzzle.
  // A tile coming back OFF a pyramid rides as `taken`, a second-thoughts tell.
  // Never `correct`/`wrong`: a placement is a decision, not a verdict, and
  // nobody knows yet whether it was right — it must not wear a tick or a cross.
  const seated = next.filter(Boolean).length
  announce({
    kind: slot === undefined ? 'taken' : 'presence',
    placed: { seated, total: placedTotalFor(challenge.value) ?? subjects.value.length },
  })
}

const onDrop = (event: DragMoveEvent, slot: number) => place(event, slot)
const onReturn = (event: DragMoveEvent) => place(event, undefined)

/** The shared 150ms is for list REORDERING, which this mode never does
 *  (`sort: false` on both ends) — a carried tile should be instant. */
const NO_CARRY_LAG = { animation: 0 } as const

const dropOptions = computed(() => ({
  ...DROP_TARGET_OPTIONS,
  ...NO_CARRY_LAG,
  disabled: locked.value,
}))
const sourceOptions = computed(() => ({
  ...DRAG_SOURCE_OPTIONS,
  ...NO_CARRY_LAG,
  disabled: locked.value,
}))

// --- the carry tilt ---------------------------------------------------------

/**
 * A carried tile banks away from the middle of the screen, like something held
 * out to one side: upright at centre, tilting further the nearer it gets to an
 * edge. Written to a CSS variable on the root so the `.drag` rule can use it
 * without re-rendering anything mid-drag.
 */
const MAX_TILT_DEG = 4

const tiltToPointer = (event: PointerEvent) => {
  if (prefersReducedMotion()) return
  const centre = window.innerWidth / 2
  if (!centre) return
  const offset = (event.clientX - centre) / centre
  const tilt = Math.max(-1, Math.min(1, offset)) * MAX_TILT_DEG
  document.documentElement.style.setProperty('--carry-tilt', `${tilt.toFixed(2)}deg`)
}

onMounted(() => window.addEventListener('pointermove', tiltToPointer, { passive: true }))
registerCleanup(() => {
  window.removeEventListener('pointermove', tiltToPointer)
  document.documentElement.style.removeProperty('--carry-tilt')
})

// --- the sweep --------------------------------------------------------------

const frame = ref(0)
const shownYear = computed(() => pyramidYearAt(frame.value))

let raf: number | undefined
let started: number | undefined

const tick = (now: number) => {
  if (started === undefined) started = now
  const span = SWEEP_MS + HOLD_MS * 2
  const elapsed = (now - started) % span
  let progress: number
  if (elapsed < HOLD_MS) progress = 0
  else if (elapsed < HOLD_MS + SWEEP_MS) {
    const ratio = (elapsed - HOLD_MS) / SWEEP_MS
    // easeInOutQuad: the decades slow at both ends, so the shape settles
    // before it moves on rather than snapping between snapshots.
    progress = ratio < 0.5 ? 2 * ratio * ratio : 1 - Math.pow(-2 * ratio + 2, 2) / 2
  } else progress = 1
  frame.value = progress * (PYRAMID_YEARS.length - 1)
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  // Reduced motion holds on today's shape: the round is readable without the
  // sweep, and the sweep is the part that moves.
  if (prefersReducedMotion()) {
    frame.value = PYRAMID_YEARS.length - 1
    return
  }
  raf = requestAnimationFrame(tick)
})
registerCleanup(() => raf !== undefined && cancelAnimationFrame(raf))

// --- submit -----------------------------------------------------------------

const lockIn = () => {
  if (locked.value) return
  locked.value = true
  // Position is the claim: index i is whoever the player put on pyramid i.
  // Absent picks ride as an empty string so the array stays positional.
  submitOnce(subjects.value.map((_, slot) => assignment.value[slot] ?? '') as ISOCountryCode[])
}

watch(
  () => challenge.value?.countries,
  countries => {
    assignment.value = new Array(countries?.length ?? 0).fill(undefined)
    locked.value = false
  },
  { immediate: true }
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

/** The nameplate's height, shared by the empty well, the filled one and the
 *  settled truth — a card must not change height as a country lands on it. */
$plateHeight: 5.4rem;

.stage {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  // The pyramids ARE the round, so the stage takes the width it can get: four
  // 21-row charts huddled in a narrow column read as decoration.
  width: min(96rem, 100%);
  // Centred in the shell's spare height rather than pinned to the top, where
  // the round sat above a screen's worth of nothing.
  margin: auto;
}

// The year ticks every frame, so NOTHING here may be laid out from its width:
// a centred flex row let the whole bar swim as the digits changed. The odometer
// is a fixed 4-character box and the span label is absolutely placed beside it,
// so the only thing that moves on screen is the digits themselves.
.yearbar {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: center;
  min-height: 4.6rem;
}

.odometer {
  font-size: clamp(3.2rem, 5vw, 4.6rem);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  // 4 tabular digits, never re-measured.
  width: 4ch;
  text-align: center;
}

// Clear of the odometer's fixed 4ch box (half of it, plus a gap) — anchored to
// the CENTRE rather than to the digits, so it cannot be nudged as they tick.
.span-label {
  position: absolute;
  left: 50%;
  bottom: 0.6rem;
  transform: translateX(6.4rem);
  white-space: nowrap;
  font-size: 1.2rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #{ink(0.55)};
}

@media screen and (max-width: $tablet) {
  // No room to sit the span beside the odometer on a phone.
  .span-label {
    display: none;
  }
}

// One equal column per subject, driven by the deal rather than by `auto-fit`:
// auto-fit re-packs the row at arbitrary widths, so four cards could come out
// three-and-one, and a five-subject hard round wrapped differently again.
.cards {
  display: grid;
  grid-template-columns: repeat(var(--subject-count, 4), minmax(0, 1fr));
  gap: 1.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
  align-items: stretch;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.3rem 1.4rem 1.1rem;
  border-radius: 2.2rem;
  background: #{milk(0.85)};
  border: 0.1rem solid #{ink(0.2)};
  transition:
    border-color 140ms ease,
    background 140ms ease;

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  &.filled {
    border-color: #{ink(0.35)};
  }
  // The verdict arrives as a beat: the cards settle one after another rather
  // than the whole row flipping colour at once. Ordered by the deal, so the
  // eye is walked across the board left to right.
  &.correct,
  &.missed {
    animation: verdict-settle var(--motion-slow) var(--ease-out-expressive) both;
    animation-delay: calc(var(--settle-index, 0) * 90ms);
  }
  &.correct {
    border-color: hsl(150, 46%, 34%);
    background: hsla(150, 46%, 34%, 0.14);
  }
  &.missed {
    border-color: var(--hior-ange);
    background: #{flame(0.13)};
  }
}

// A card taking its verdict: a short rise, not a flash of colour.
@keyframes verdict-settle {
  from {
    transform: translateY(0.8rem);
    opacity: 0.55;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.slot-letter {
  font-weight: 700;
  font-size: 1.7rem;
}

.axis {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #{ink(0.55)};
}

// The drop well: ONE fixed-height box per card, so a card is exactly as tall
// empty as it is filled and the row never re-flows as countries are placed.
.well {
  position: relative;
  height: $plateHeight;
  border-radius: 1rem;
  border: 0.18rem dashed #{ink(0.2)};
  transition:
    border-color var(--motion-quick) var(--ease-smooth),
    background var(--motion-quick) var(--ease-smooth),
    box-shadow var(--motion-quick) var(--ease-smooth);

  // Filled, the well is just the socket the tile sits in — the tile carries
  // the surface, so the well stops drawing one of its own.
  &.filled {
    border-color: transparent;
    background: transparent;
  }

  // A country is hovering over this well: the target lights in the clock's
  // ember so the drop reads as aimed rather than dropped-and-hoped.
  //
  // `.ghost` is the placeholder Sortable parks in the list it would drop into
  // (DRAG_LIST_OPTIONS names it, so it is NOT `.sortable-ghost`); the node
  // under the finger is `.sortable-fallback`, which lives on the body.
  &:has(.ghost) {
    border-style: solid;
    border-color: var(--hior-ange);
    background: #{flame(0.1)};
    box-shadow: 0 0 0 0.35rem #{flame(0.16)};
  }
}

// The Sortable itself fills the well and is the drop target; the hint sits
// behind it, so an empty well is still a full-size target to drop onto.
.plate {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  // The chip settles into the plate rather than appearing in it. `row-land`
  // is the shared landing beat and carries no -move rule, so a chip arriving
  // never shoves its neighbours (the whole point of the fixed-height well).
  .draggable {
    animation: row-land var(--motion-base) var(--ease-out-expressive) both;
    // Seated: it fills the well it was dropped into rather than floating as a
    // smaller pill inside a larger one. It keeps its border and lift, because
    // a placed country is still something you can pick back up.
    width: 100%;
    height: 100%;
    border-radius: 0.6rem;
  }
}

// The settled nameplate: the same tile the player was dragging, stated rather
// than droppable — so the answer lands where their hand left it.
.plate.truth {
  position: relative;
  inset: auto;
  height: $plateHeight;
  flex-direction: column;
  gap: 0.2rem;
  border-radius: 0.8rem;
  background: #{milk(1)};
  border: 0.18rem solid #{ink(0.2)};
}

.you-said {
  font-size: 1.2rem;
  color: var(--hior-ange);
}

.plate-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  color: #{ink(0.3)};
  pointer-events: none;
}

// The chip brings its own padding and flag size; inside a tile the TILE is the
// surface, so the chip drops its own box and just sets the type and flag scale.
.plate-chip,
.tray-chip {
  padding: 0;
  font-size: 1.8rem;

  :deep(.chip-flag) {
    height: 2.6rem;
  }
}

.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  padding: 1.4rem;
  border-radius: 2.2rem;
  background: #{ink(0.06)};
  border: 0.1rem solid #{ink(0.12)};
  min-height: 6.8rem;
  transition:
    background 160ms ease,
    border-color 160ms ease;

  // Emptied, it is still the place a country comes back TO, so it keeps its
  // box — but it stops reading as a slab of furniture.
  &.spent {
    background: transparent;
    border-style: dashed;
    border-color: #{ink(0.12)};
  }

  &::after {
    content: 'drag a country back here to change your mind';
    font-size: 1.25rem;
    color: #{ink(0.3)};
    display: none;
  }
  &.spent::after {
    display: block;
  }
}

// A country is a THING to pick up, not a label: a real tile with a face, a
// border and a shadow, sized past the 44px touch minimum so a finger can take
// it without aiming.
.draggable {
  touch-action: none;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 4.6rem;
  padding: 0.7rem 1.6rem;
  // A card corner, not a lozenge — 999px read as a pill floating over the
  // board rather than a tile that belongs in a slot.
  border-radius: 0.8rem;
  background: #{milk(1)};
  border: 0.18rem solid #{ink(0.3)};
  box-shadow: 0 0.25rem 0 #{ink(0.14)};
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    box-shadow var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-smooth);

  @media (hover: hover) {
    &:hover {
      transform: translateY(-0.25rem);
      border-color: #{ink(0.5)};
      box-shadow: 0 0.6rem 1.4rem #{ink(0.2)};
    }
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 0.12rem 0 #{ink(0.14)};
  }

  // The placeholder Sortable parks in the list it would drop into. It reads as
  // a preview of the landing, not as a second copy of the chip — so it fades
  // hard and stops taking the eye while the real one is under the finger.
  &.ghost {
    opacity: 0.28;
    filter: grayscale(0.5);
  }

  // The chip actually under the finger: lifted off the page and canted, so it
  // reads as picked up rather than sliding.
  // The tile actually under the finger. Sortable positions this node itself,
  // every frame — so it must NOT inherit the hover transition above, or CSS
  // eases toward each new position and the tile visibly trails the cursor
  // (measured: 58px behind at the start of a drag, 89px and still growing by
  // the end). It never catches up, because every frame restarts the ease.
  &.drag {
    cursor: grabbing;
    transition: none;
    box-shadow: 0 1.2rem 3rem #{ink(0.28)};
    // Banks away from the middle of the screen — upright at centre, leaning
    // further the closer it is carried to an edge. Set by `tiltToPointer`.
    rotate: var(--carry-tilt, 1.5deg);
  }
}

.shell-footer {
  display: flex;
  justify-content: center;
  // The shell passes pointer events through to the map; anything interactive
  // has to claim them back or the map's SVG eats the click.
  pointer-events: auto;
}

@media screen and (max-width: $tablet) {
  .cards {
    grid-template-columns: 1fr 1fr;
    gap: 0.9rem;
  }
  .card {
    padding: 0.9rem 0.9rem 0.8rem;
  }
}
</style>
