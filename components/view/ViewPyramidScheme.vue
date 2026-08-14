<template>
  <div v-if="challenge" class="pyramid-scheme challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Pyramid Scheme`"
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

      <ul class="cards">
        <li
          v-for="(isoCode, slot) in challenge.countries"
          :key="isoCode"
          class="card"
          :class="slotClass(slot)"
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
          <template v-else>
            <Sortable
              :key="`plate-${slot}-${revision}`"
              :list="placedIn(slot)"
              :item-key="(iso: ISOCountryCode) => iso"
              :options="dropOptions"
              class="plate"
              :data-slot="slot"
              :class="{ filled: !!placedIn(slot).length, empty: !placedIn(slot).length }"
              @add="event => onDrop(event, slot)"
            >
              <template #item="{ element }">
                <div class="draggable">
                  <CountryChip tag="span" :country="getCountry(element)" class="plate-chip" />
                </div>
              </template>
            </Sortable>
            <span v-if="!placedIn(slot).length" class="plate-hint">drop a country here</span>
          </template>
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
  currentRound,
  showInterstitial,
  secondsLeft,
  begin,
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
}

const onDrop = (event: DragMoveEvent, slot: number) => place(event, slot)
const onReturn = (event: DragMoveEvent) => place(event, undefined)

const dropOptions = computed(() => ({ ...DROP_TARGET_OPTIONS, disabled: locked.value }))
const sourceOptions = computed(() => ({ ...DRAG_SOURCE_OPTIONS, disabled: locked.value }))

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

.stage {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  // The pyramids ARE the round, so the stage takes the width it can get: four
  // 21-row charts huddled in a narrow column read as decoration.
  width: min(96rem, 100%);
  margin: 0 auto;
}

.yearbar {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.9rem;
}

.odometer {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.span-label {
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #{ink(0.55)};
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.9rem;
  list-style: none;
  margin: 0;
  padding: 0;
  // Tall enough for 21 cohorts to read, capped so the row never outgrows the
  // shell and pushes the tray off the bottom.
  align-content: start;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem 0.9rem 0.7rem;
  border-radius: 1.4rem;
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
  &.correct {
    border-color: hsl(150, 46%, 34%);
    background: hsla(150, 46%, 34%, 0.14);
  }
  &.missed {
    border-color: var(--hior-ange);
    background: #{flame(0.13)};
  }
}

.slot-letter {
  font-weight: 700;
  font-size: 1.1rem;
}

.axis {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #{ink(0.55)};
}

.plate {
  min-height: 3.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  border: 0.12rem dashed #{ink(0.2)};
  transition:
    border-color 140ms ease,
    background 140ms ease;

  &.filled {
    border-style: solid;
    border-color: transparent;
    background: #{ink(0.06)};
  }
}

.plate.truth {
  flex-direction: column;
  gap: 0.15rem;
}

.you-said {
  font-size: 0.78rem;
  color: var(--hior-ange);
}

.plate-hint {
  margin-top: -2.6rem;
  text-align: center;
  font-size: 0.85rem;
  color: #{ink(0.3)};
  pointer-events: none;
}

.plate-chip {
  font-size: 1.15rem;
}

.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: center;
  padding: 0.9rem;
  border-radius: 1.4rem;
  background: #{ink(0.06)};
  border: 0.1rem solid #{ink(0.12)};
  min-height: 4rem;
}

.tray-chip {
  font-size: 1.2rem;
}

.draggable {
  touch-action: none;
  cursor: grab;
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
    gap: 0.6rem;
  }
  .card {
    padding: 0.6rem 0.6rem 0.5rem;
  }
}
</style>
