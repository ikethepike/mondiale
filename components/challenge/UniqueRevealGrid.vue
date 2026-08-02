<template>
  <section class="unique-reveal">
    <!-- The take: who walked away with what, ranked. The grid below is the
         why; this is the outcome at a glance. -->
    <!-- The briefing's sealed '?' pays off here: the letter tile itself
         crowns the masthead, half over the card's top edge. -->
    <header class="take card">
      <UniqueLetterBadge class="banner take-mark" :letter="challenge.letter" />
      <h2 class="take-title">The take</h2>
      <span class="take-sub">Only unshared answers paid</span>
      <ul class="take-row">
        <li
          v-for="seat in standings"
          :key="seat.playerId"
          class="take-seat chip"
          :class="{ mine: seat.playerId === playerId }"
        >
          <PlayerPawn class="take-pawn" :player="players[seat.playerId]" />
          <span class="take-name">{{ seatName(seat.playerId) }}</span>
          <span class="take-points">+{{ seat.banked }}</span>
        </li>
      </ul>
    </header>

    <article
      v-for="(panel, panelIndex) in panels"
      :key="panel.category"
      class="panel card"
      :style="{ '--panel-index': panelIndex }"
    >
      <header class="panel-head">
        <StatTopicIcon class="panel-icon" v-bind="UNIQUE_CATEGORIES[panel.category].icon" />
        <span class="eyebrow">{{ UNIQUE_CATEGORIES[panel.category].prompt }}</span>
        <SourceInfo
          class="panel-source"
          :attributions="datasetAttribution(CATEGORY_DATASETS[panel.category])"
        />
      </header>
      <p v-if="!panel.cells.length" class="panel-empty">Nobody found one.</p>
      <ul v-else class="cell-list">
        <li
          v-for="(cell, cellIndex) in panel.cells"
          :key="cell.key"
          class="cell"
          :class="{ paid: cell.scored, mine: cell.holders.includes(playerId) }"
          :style="{ '--land-delay': `${panelIndex * 0.12 + cellIndex * 0.07}s` }"
        >
          <!-- Country cells are chosen-country labels — CountryChip by law.
               Capital cells label the CITY, so the chip's country name would
               be wrong; they wear the flag as provenance beside their own. -->
          <CountryChip
            v-if="panel.category === 'country' && countryFor(cell)"
            class="cell-country"
            compact
            tag="span"
            :country="countryFor(cell)!"
          />
          <template v-else>
            <CountryFlag
              v-if="panel.category === 'capital' && countryFor(cell)"
              class="cell-flag"
              :country="countryFor(cell)!"
              mode="background"
            />
            <span class="cell-name">{{ cell.name }}</span>
          </template>
          <span class="cell-holders">
            <PlayerPawn
              v-for="holderId in cell.holders"
              :key="holderId"
              class="holder-pawn"
              :player="players[holderId]"
            />
          </span>
          <span class="cell-verdict">
            {{ cell.scored ? `+${cell.scored}` : `×${cell.holders.length}` }}
          </span>
        </li>
      </ul>
    </article>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import UniqueLetterBadge from '~/components/challenge/UniqueLetterBadge.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, type DataSetId } from '~~/lib/attribution'
import { getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import { UNIQUE_CATEGORIES } from '~~/lib/unique-or-bust'
import type {
  UniqueBoardCell,
  UniqueCategoryId,
  UniqueOrBustChallenge,
} from '~~/types/challenges/group-modes.type'
import { isValidISOCode, type Country } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'

/**
 * The collision grid — Unique or Bust's reveal beat. A ranked take strip up
 * top, then one panel per category: every distinct answer is a row with the
 * pawns that picked it. A lone pawn's row pays in mint; a crowded row is
 * struck and cancels for everyone on it. The teaching moment IS the duplicate
 * pile-up, so cancelled rows sort biggest crowd first under the unique payers.
 */
/** Each register reads from exactly one dataset — the panel ⓘ names it. */
const CATEGORY_DATASETS: { [category in UniqueCategoryId]: DataSetId } = {
  country: 'countries',
  capital: 'capitals',
  river: 'water',
  megacity: 'cities',
}

const props = defineProps<{
  challenge: UniqueOrBustChallenge
  players: Record<string, Player>
  playerId: string
}>()

const seatName = (id: string) => seatLabel(props.players, id, props.playerId)

const panels = computed(() =>
  props.challenge.categories.map(category => {
    const cells = [...(props.challenge.state.results?.[category] ?? [])]
    // Paid answers first (alphabetical from the resolve), then the pile-ups.
    cells.sort(
      (a, b) => Number(!!b.scored) - Number(!!a.scored) || b.holders.length - a.holders.length
    )
    return { category, cells }
  })
)

const standings = computed(() => {
  const banked: { [id: string]: number } = {}
  for (const id of props.challenge.state.order) banked[id] = 0
  for (const cells of Object.values(props.challenge.state.results ?? {})) {
    for (const cell of cells) {
      for (const holderId of cell.holders) banked[holderId] = (banked[holderId] ?? 0) + cell.scored
    }
  }
  return Object.entries(banked)
    .map(([id, points]) => ({ playerId: id, banked: points }))
    .sort((a, b) => b.banked - a.banked)
})

/** Country and capital cells carry their ISO code as the cell id. */
const countryFor = (cell: UniqueBoardCell): Country | undefined =>
  isValidISOCode(cell.id) ? getCountry(cell.id) : undefined
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.unique-reveal {
  gap: 1.2rem;
  display: grid;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  // Headroom for the masthead tile that breaks the take card's top edge —
  // the view scrolls this element, and a bare negative margin would clip.
  padding-top: 3.4rem;

  // StatCard's surface, as a cluster: cream wash, ink hairline, soft radius.
  // The small-caps labels wear muted ink here, not the section-label blue —
  // four blue headings in one screen shouted over the verdicts.
  .card {
    border-radius: 1.2rem;
    backdrop-filter: blur(0.5rem);
    background: milk(0.88);
    border: 0.1rem solid ink(0.25);
  }

  .eyebrow {
    opacity: 0.65;
    font-size: 1.25rem;
    letter-spacing: 0.06em;
    color: var(--dark-blue);
  }
}

.take {
  gap: 0.4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  grid-column: 1 / -1;
  padding: 1.2rem 1.4rem 1.6rem;
  animation: fade-in var(--motion-base) var(--ease-out-expressive) both;

  .take-mark {
    margin-top: -4.4rem;
  }
}

.take-title {
  margin: 0.4rem 0 0;
  color: var(--dark-blue);
}

.take-sub {
  opacity: 0.65;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark-blue);
  margin-bottom: 0.6rem;
}

.take-row {
  margin: 0;
  padding: 0;
  gap: 1.6rem;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.take-seat {
  gap: 0.5rem;
  display: flex;
  align-items: center;

  &.mine .take-name {
    font-weight: 700;
  }

  .take-pawn {
    width: 1.6rem;
    height: 2rem;
  }

  .take-name {
    font-size: 1.35rem;
    color: var(--dark-blue);
  }

  .take-points {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--dark-blue);
  }
}

.panel {
  padding: 1.2rem 1.4rem;
  animation: fade-in var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: calc((var(--panel-index) + 1) * 0.1s);
}

// The category masthead: subtle emblem + small-caps label over the hairline.
.panel-head {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding-bottom: 0.7rem;
  margin-bottom: 0.9rem;
  border-bottom: 0.1rem solid $hairline;

  .panel-source {
    margin-left: auto;
  }

  .eyebrow {
    margin-bottom: 0;
  }

  .panel-icon {
    width: 1.9rem;
    height: 1.9rem;
    opacity: 0.55;
    color: var(--dark-blue);
  }
}

.panel-empty {
  margin: 0;
  opacity: 0.6;
  font-size: 1.3rem;
}

.cell-list {
  margin: 0;
  padding: 0;
  gap: 0.45rem;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
}

// The verdict is the row: firm ink and a mint pill for a paid answer, a
// struck name over a faint ember wash for a collision. No other chrome.
.cell {
  gap: 0.7rem;
  display: flex;
  min-width: 0;
  align-items: center;
  font-size: 1.35rem;
  padding: 0.45rem 0.8rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  background: flame(0.06);
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: var(--land-delay);

  .cell-name,
  :deep(.chip-name) {
    opacity: 0.55;
    font-weight: 600;
    text-decoration: line-through;
  }

  // The chip brings its own padding for floating over the map — inside a
  // row it sits flush like its text siblings.
  .cell-country {
    padding: 0;
  }

  &.paid {
    background: milk(0.7);

    .cell-name,
    :deep(.chip-name) {
      opacity: 1;
      text-decoration: none;
    }
  }

  &.mine {
    .cell-name,
    :deep(.chip-name) {
      font-weight: 700;
    }
  }
}

.cell-flag {
  flex: none;
  width: 2rem;
  height: 1.4rem;
  border-radius: 0.25rem;
}

.cell-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cell-holders {
  gap: 0.15rem;
  display: flex;
  flex: none;
  margin-left: auto;

  .holder-pawn {
    width: 1.3rem;
    height: 1.7rem;
  }
}

// The verdict pill: the row's one loud element — mint for a payout, ember
// wash for the crowd that cancelled each other.
.cell-verdict {
  flex: none;
  font-size: 1.15rem;
  font-weight: 700;
  white-space: nowrap;
  padding: 0.15rem 0.7rem;
  border-radius: 1rem;
  color: var(--hior-ange);
  background: flame(0.14);

  .paid & {
    color: var(--dark-blue);
    background: var(--soft-mint);
  }
}

@media screen and (max-width: $tablet) {
  .unique-reveal {
    gap: 0.8rem;
    grid-template-columns: minmax(0, 1fr);
  }

  .take-row {
    gap: 1rem;
  }
}
</style>
