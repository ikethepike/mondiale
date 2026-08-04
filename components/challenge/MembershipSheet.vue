<template>
  <aside
    ref="sheetEl"
    class="pane tl membership-sheet"
    :class="{ sheet: isPhone, split: isPhone }"
    role="dialog"
    :aria-label="`Countries lit for ${subject}`"
  >
    <div v-if="isPhone" class="sheet-handle" aria-hidden="true" @pointerdown="onDragStart" />

    <header ref="headerEl" class="sheet-head" @pointerdown="isPhone && onDragStart($event)">
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
      </div>
    </header>

    <div class="sheet-body">
      <p v-if="!groups.length" class="empty">Nothing matches.</p>
      <template v-for="group in groups" :key="group.letter">
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
              @click="onRowClick(isoCode)"
            />
          </li>
        </ul>
      </template>
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

const { onDragStart, settleTo, release, dragMoved } = useDragSheet({
  el: () => sheetEl.value,
  enabled: () => isPhone.value && !props.settled && !keyboardInset.value,
  stops,
  // A flick carries exactly one stop (lib/use-drag-sheet.ts), so a hard swipe
  // down from full lands on peek, never tucked. Deliberate: the list can't be
  // flung away mid-question.
  momentumEase: 'power1.in',
  onSettle: reserve,
})

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
  const head = headerEl.value?.offsetHeight ?? 0
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

watch(
  () => props.settled,
  settled => settled && isPhone.value && settleTo(1)
)

onMounted(() => {
  if (isPhone.value) settleTo(1, { from: stops()[2] })
  reserve()
})

onBeforeUnmount(() => claimMapBerth(gameStore, 'membership-sheet', undefined))
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
  padding: 0.5rem 0.9rem;
  border: 0.1rem solid ink(0.15);
  border-radius: 999px;
  background: glass(0.5);
  color: inherit;
  font: inherit;
  font-size: 1.4rem;

  &:focus-visible {
    outline: 0.2rem solid var(--dark-blue);
    outline-offset: 0.1rem;
  }
}

// The twin sits over a left-aligned input, so override the template's centring.
.ghost-placeholder {
  padding-left: 0.9rem;
  justify-content: flex-start;
  font-size: 1.4rem;
  opacity: 0.5;
}

.letter {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0.6rem 0 0.3rem;
  padding: 0.1rem 0;
  background: var(--background-color);
  font-size: 1.2rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.55;
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

.row {
  width: 100%;
  cursor: pointer;
  border-radius: 999px;
  text-align: left;

  &:disabled {
    cursor: default;
  }

  @media (pointer: coarse) {
    min-height: 3.2rem;
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
}
</style>
