<template>
  <aside
    ref="sheetEl"
    class="pane tl membership-sheet"
    :class="{ sheet: isPhone, split: isPhone }"
    role="dialog"
    :aria-label="`Countries lit for ${subject}`"
  >
    <div
      v-if="isPhone"
      class="sheet-handle"
      aria-hidden="true"
      @pointerdown="onSheetDragStart"
      @click="onHandleTap"
    />

    <header ref="headerEl" class="sheet-head" @pointerdown="isPhone && onSheetDragStart($event)">
      <span class="eyebrow">{{ countries.length }} on the board</span>
      <div class="search">
        <input
          ref="searchEl"
          v-model="query"
          class="search-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Filter the list"
          @focus="onSearchFocus"
        />
        <span v-if="!query" class="ghost-placeholder" aria-hidden="true">Filter…</span>
        <button
          v-if="query"
          type="button"
          class="clear-search"
          aria-label="Clear the filter"
          @mousedown.prevent="query = ''"
        >
          ×
        </button>
      </div>
    </header>

    <div class="sheet-body">
      <p v-if="!groups.length" class="empty">Nothing matches.</p>
      <!-- One section per letter: sticky headers hand off to the next section's
           header instead of all pinning at the scroller's top forever. -->
      <section v-for="group in groups" :key="group.letter" class="letter-group">
        <h3 v-if="showLetters" class="letter">{{ group.letter }}</h3>
        <ul class="country-chip-list rows">
          <li v-for="isoCode in group.isoCodes" :key="isoCode">
            <CountryChip
              tag="button"
              type="button"
              compact
              class="row"
              :disabled="settled"
              :country="getCountry(isoCode)"
              @mousedown.prevent="onRowClick(isoCode)"
              @click="onRowClick(isoCode)"
            />
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth } from '~~/lib/map-berth'
import { groupByLetter, MIN_ROWS_FOR_LETTERS } from '~~/lib/odd-one-out'
import { normalizeAnswer } from '~~/lib/strings'
import { useDragSheet } from '~~/lib/use-drag-sheet'
import { keyboardInset, useIsPhone } from '~~/lib/use-viewport'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The lit set, made legible. A membership question highlights every member of
 * an organization plus the one impostor — 54 countries for the African Union —
 * which is an unreadable wall at world zoom. This lists exactly that set and
 * lets a row answer, so the player reads names instead of hunting shapes.
 *
 * It renders what it is GIVEN. Re-deriving membership here would be a second
 * filter that can disagree with the map's, and any disagreement points at the
 * impostor. Grouping is alphabetical for the same reason: region headings leak
 * the answer outright (every AU member is African, so a non-African impostor
 * stands alone under its own heading — measured at 100% of AU deals, 80% EU).
 */
const props = defineProps<{
  /** The bound set ∪ the odd one out, as written to gameStore.map.highlighted. */
  countries: ISOCountryCode[]
  /** What they have in common — an organization or an instrument. Label only. */
  subject: string
  settled: boolean
}>()

const emit = defineEmits<{ pick: [isoCode: ISOCountryCode] }>()

/** Visible height of the grab handle, excluded from the tucked stop. */
const HANDLE_PX = 28

const { gameStore } = useClientEvents()
const isPhone = useIsPhone()
const sheetEl = ref<HTMLElement>()
const headerEl = ref<HTMLElement>()
const searchEl = ref<HTMLInputElement>()
const query = ref('')

const named = computed(() =>
  props.countries.map(isoCode => ({ isoCode, name: countryName(getCountry(isoCode)) }))
)

const filtered = computed(() => {
  const needle = normalizeAnswer(query.value)
  if (!needle) return props.countries
  return named.value
    .filter(row => normalizeAnswer(row.name).includes(needle))
    .map(row => row.isoCode)
})

// A filtered list is already short and already the answer to a question the
// player asked — headings would only get in the way.
const showLetters = computed(() => !query.value && props.countries.length >= MIN_ROWS_FOR_LETTERS)

const groups = computed(() => groupByLetter(filtered.value, showLetters.value))

// [0] full, [1] peek (handle + search), [2] tucked (handle only). Measured
// lazily so 54 rows and 7 rows both get honest stops.
const stops = () => {
  const height = sheetEl.value?.offsetHeight ?? 0
  const head = headerEl.value?.offsetHeight ?? 0
  return [0, Math.max(0, height - head - HANDLE_PX), Math.max(0, height - HANDLE_PX)]
}

const { stopIndex, onDragStart, settleTo, release, dragMoved } = useDragSheet({
  el: () => sheetEl.value,
  enabled: () => isPhone.value,
  stops,
  // A flick carries exactly one stop (lib/use-drag-sheet.ts), so a hard swipe
  // down from full lands on peek, never tucked. Deliberate: the list can't be
  // flung away mid-question.
  momentumEase: 'power1.in',
  onSettle: reserve,
})

/**
 * Every drag enters here. A press on the search field is typing, not a drag.
 * With the keyboard up, CSS owns the lift and the measured stops are stale —
 * a swipe on the chrome dismisses the keyboard instead of dead-dragging the
 * sheet against it.
 */
const onSheetDragStart = (event: PointerEvent) => {
  // The whole search cluster: the input (typing) and the clear × (which must
  // keep the keyboard up — its own mousedown.prevent guards the focus).
  if (event.target instanceof Element && event.target.closest('.search')) return
  if (keyboardInset.value) return searchEl.value?.blur()
  onDragStart(event)
}

/** Tap (not drag) on the grab handle toggles between full and peek. */
const onHandleTap = () => {
  if (!isPhone.value || dragMoved() || keyboardInset.value) return
  settleTo(stopIndex.value === 0 ? 1 : 0)
}

/**
 * Reserve the PEEK height, not the live one. A full-open sheet is ~70dvh and
 * BERTH_CAP_FRACTION would silently scale that down instead of rejecting it,
 * leaving the camera in a band too tight to read; re-claiming per drag frame
 * would also thrash applyClaims. A player at full open is reading the list,
 * not the map. The claim still rides the shared registry, so the reveal card
 * and any footer keep combining normally.
 */
function reserve() {
  if (!isPhone.value) return claimMapBerth(gameStore, 'membership-sheet', undefined)
  // Tucked (post-answer) frees the band for the reveal card and its camera.
  const head = stopIndex.value === 2 ? 0 : (headerEl.value?.offsetHeight ?? 0)
  claimMapBerth(gameStore, 'membership-sheet', { bottom: head + HANDLE_PX + BERTH_GAP_PX })
}

const onSearchFocus = () => {
  // Open fully BEFORE the keyboard arrives: at stop 0 the composable strips
  // the inline transform, so CSS owns the element while the keyboard lifts it.
  if (isPhone.value) settleTo(0)
}

const onRowClick = (isoCode: ISOCountryCode) => {
  // The pointer travelled past tap slop — this click is a drag's tail.
  if (dragMoved() || props.settled) return
  searchEl.value?.blur()
  emit('pick', isoCode)
}

watch(isPhone, phone => {
  // Hand layout back to CSS when the sheet stops being a sheet.
  if (!phone) release()
  reserve()
})

// The answer is in and the rows are dead — tuck down to the bare handle so
// the reveal card and the lesson own the bottom of the screen. A drag or a
// handle tap can still pull the roster back up for a second look.
watch(
  () => props.settled,
  settled => settled && isPhone.value && settleTo(2)
)

// The stops are transforms measured against the sheet's CURRENT height, and
// that height moves under the parked sheet: filtering shrinks the list
// (measured: typing three letters pushed the whole drawer below the viewport)
// and the keyboard's max-height grant collapses after the settled tuck.
// Re-anchor the held stop whenever the geometry changes; stop 0 has no
// transform to go stale.
let sheetHeight = 0
let sheetObserver: ResizeObserver | undefined

onMounted(() => {
  if (isPhone.value) settleTo(1, { from: stops()[2] })
  reserve()
  sheetObserver = new ResizeObserver(() => {
    const height = sheetEl.value?.offsetHeight ?? 0
    const first = !sheetHeight
    if (height === sheetHeight) return
    sheetHeight = height
    // The observer's initial fire is the entrance, mid-tween — leave it be.
    if (first || !isPhone.value || stopIndex.value === 0) return
    settleTo(stopIndex.value, { immediate: true })
  })
  if (sheetEl.value) sheetObserver.observe(sheetEl.value, { box: 'border-box' })
})

onBeforeUnmount(() => {
  sheetObserver?.disconnect()
  claimMapBerth(gameStore, 'membership-sheet', undefined)
})
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.membership-sheet {
  position: fixed;
  z-index: 4; // above the footer strip (2) and guess-box (3), below the clock (5)
  top: auto;
  right: 0;
  bottom: 0;
  width: min(32rem, 90vw);
  max-height: min(60dvh, 48rem);
  display: flex;
  flex-direction: column;
  padding: 1.6rem;
  border-bottom-left-radius: 0;
}

.sheet-head {
  flex-shrink: 0;
  display: grid;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}

.search {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 0.7rem 3.6rem 0.7rem 1.4rem;
  border: 0.1rem solid ink(0.2);
  border-radius: 999px;
  background: glass(0.6);
  color: var(--dark-blue);
  font: inherit;
  // 16px is the floor: any smaller and iOS zooms the page to the caret on
  // focus — a scaled viewport reads as a pinch, the keyboard engine stands
  // down (lib/use-viewport.ts), and the sheet strands under the keyboard.
  font-size: 1.6rem;
  transition:
    border-color var(--motion-quick) var(--ease-out-expressive),
    box-shadow var(--motion-quick) var(--ease-out-expressive);

  // Text inputs match :focus-visible on touch too, so the old 0.2rem outline
  // rode the pill for the whole typing session — a hairline turn and a soft
  // ink ring say "live" without shouting.
  &:focus {
    outline: none;
    border-color: var(--dark-blue);
    box-shadow: 0 0 0 0.3rem ink(0.1);
  }
}

// The twin sits over a left-aligned input, so override the template's centring.
.ghost-placeholder {
  padding-left: 1.4rem;
  justify-content: flex-start;
  font-size: 1.6rem;
  opacity: 0.5;
}

// mousedown.prevent wipes the query without stealing the input's focus — the
// keyboard stays up and the full list is back under the caret.
.clear-search {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  transform: translateY(-50%);
  border: none;
  border-radius: 999px;
  background: ink(0.08);
  color: var(--dark-blue);
  font-size: 1.6rem;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover {
      background: ink(0.15);
    }
  }

  &:active {
    background: ink(0.15);
  }
}

.letter-group + .letter-group {
  margin-top: 0.8rem;
}

.letter {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  padding: 0.2rem 0 0.3rem;
  // An opaque surface with the fade on the TEXT: element opacity here let the
  // stuck header show the previous one through itself.
  background: var(--background-color);
  color: ink(0.55);
  font-size: 1.2rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

// One name per line: the task is finding a name in a list of up to 55, and a
// wrapping chip row makes ragged edges the eye has to re-scan.
.rows {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  justify-content: flex-start;
  gap: 0.3rem;

  // The sheet body owns the scroll; the shared list must not add its own.
  @media screen and (max-width: $tablet) {
    max-height: none;
    overflow: visible;
  }
}

// The quiet-list row, same register as the typed consoles' suggestion lists:
// CountryChip brings only flag + name (hosts own the surface), and without
// this dressing the button renders in the browser's own grey-pill chrome —
// which is exactly what shipped.
.row {
  width: 100%;
  cursor: pointer;
  border: none;
  border-radius: 0.8rem;
  background: none;
  color: var(--dark-blue);
  font: inherit;
  text-align: left;
  transition: background-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: ink(0.08);
    }
  }

  &:active:not(:disabled) {
    background: ink(0.12);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 0.2rem solid var(--dark-blue);
    outline-offset: -0.2rem;
  }

  // Toward the 44px tap-target floor — 3.2rem read a smidge too short.
  @media (pointer: coarse) {
    min-height: 4.2rem;
  }
}

.empty {
  opacity: 0.7;
  font-size: 1.4rem;
}

.eyebrow {
  opacity: 0.6;
}

// Phone: geometry comes from templates/_sheet.scss; only overrides here.
@media screen and (max-width: $tablet) {
  .membership-sheet {
    width: 100%;
    max-height: 70dvh;
    border-bottom-left-radius: 1.9rem;
  }

  // While typing, the keyboard eats the bottom of the box (the clearance
  // padding keeps content above it) — trade map for list so the matches stay
  // a readable column instead of a two-row slit. dvh ignores the keyboard on
  // iOS, so the inset has to be granted back explicitly.
  :root.keyboard-up .membership-sheet {
    max-height: calc(100dvh - 8rem);
  }
}
</style>
