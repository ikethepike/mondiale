<template>
  <section class="chain-reveal pane tr decorator-bottom">
    <h2 class="headline">
      {{ headline }}
    </h2>
    <dl v-if="stats?.length" class="stat-row">
      <div v-for="stat in stats" :key="stat.label" class="stat">
        <dt class="eyebrow stat-label">{{ stat.label }}</dt>
        <dd class="stat-value">{{ stat.value }}</dd>
      </div>
    </dl>
    <!-- The round's story: whatever rails the mode wants to lay out — every
         chain walked, ties and all. -->
    <slot />
    <PlacementList :rows="rows" :players="players" />
    <div v-if="myOuts.length" class="outs">
      <p class="outs-lead">{{ outsLine }}</p>
      <ul class="doors country-chip-list">
        <CountryChip
          v-for="isoCode in shownOuts"
          :key="isoCode"
          compact
          class="door"
          :country="getCountry(isoCode)"
        />
        <li v-if="overflowCount" class="door more">+ {{ overflowCount }} others</li>
      </ul>
    </div>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import PlacementList from '~/components/challenge/PlacementList.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, dedupeAttributions, type Attribution } from '~~/lib/attribution'
import { getCountry } from '~~/lib/country'
import { standingPlayers } from '~~/lib/chain'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import type { ChainTurnState } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const MAX_DOORS_SHOWN = 6

/** Border Chain's legality registries — the default; Atlas hands in its own. */
const BORDER_SOURCES = dedupeAttributions([
  ...datasetAttribution('borders'),
  ...datasetAttribution('straits'),
])

const props = defineProps<{
  /** Either turn-chain mode's settled state — the reveal reads only the
   *  shared fields (placements, outcomes, links, missed outs). */
  state: ChainTurnState<unknown>
  players: { [playerId: string]: Player }
  playerId: string
  /** The mode's provenance line; defaults to Border Chain's registries. */
  attributions?: Attribution[]
  /** The 'wrong answer' fate line; defaults to Border Chain's map idiom. */
  wrongFate?: string
  /** Lead-in for the missed-outs teach; defaults to Border Chain's doors. */
  outsLead?: string
  /** Per-player fate lines that outrank the generic copy — the atlas card
   *  names the fatal letter ("broke the chain on “N”"). */
  fates?: { [playerId: string]: string }
  /** Small facts strip under the headline — links walked, longest run… */
  stats?: { label: string; value: string }[]
}>()

const outsLine = computed(
  () =>
    props.outsLead ??
    `You had ${(props.state.missedOuts[props.playerId]?.length ?? 0) === 1 ? 'an open door' : 'open doors'}:`
)

const sources = computed(() => props.attributions ?? BORDER_SOURCES)

const nameOf = (playerId: string) => playerDisplayName(props.players[playerId])

const headline = computed(() => {
  const winnerId = standingPlayers(props.state)[0]
  if (!winnerId) return 'Nobody survived the chain'
  return winnerId === props.playerId
    ? 'You outlasted the whole table!'
    : `${nameOf(winnerId)} outlasts the table`
})

/** Winner first, then the eliminated in reverse falling order. */
const rows = computed(() => {
  const order = [...standingPlayers(props.state), ...[...props.state.eliminated].reverse()]
  return order.map(playerId => {
    const outcome = props.state.outcomes[playerId]
    const trapper = props.state.trappedBy?.[playerId]
    const fate =
      props.fates?.[playerId] ??
      (outcome === 'won'
        ? 'Last one standing'
        : outcome === 'trapped'
          ? trapper
            ? `walked into ${nameOf(trapper)}'s dead end`
            : 'walked into a dead end'
          : outcome === 'timeout'
            ? 'ran out of clock'
            : (props.wrongFate ?? 'stepped off the map'))
    const links = props.state.named[playerId]?.length ?? 0
    return {
      playerId,
      name: seatLabel(props.players, playerId, props.playerId),
      fate,
      tail: `${links} ${links === 1 ? 'link' : 'links'}`,
    }
  })
})

/** The teaching beat: the doors that were open at your fatal miss. */
const myOuts = computed(() => props.state.missedOuts[props.playerId] ?? [])
const shownOuts = computed(() => myOuts.value.slice(0, MAX_DOORS_SHOWN))
const overflowCount = computed(() => Math.max(0, myOuts.value.length - MAX_DOORS_SHOWN))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.chain-reveal {
  gap: 0.9rem;
  display: flex;
  padding: 1.8rem 2.2rem 1.6rem;
  flex-flow: column nowrap;
  // The round is resolved: the card takes its own scrolls and taps.
  pointer-events: auto;
  overscroll-behavior: contain;
}

// The shell stretches bare sections to fill the stage (`> section` gets
// flex: 1 1 auto) — this card must hug its content instead, sit centered in
// whatever room the round left, and scroll INSIDE itself on short screens
// rather than run under the fold.
.challenge-shell > section.chain-reveal {
  flex: 0 1 auto;
  margin: auto;
  overflow-y: auto;
  max-height: 100%;
}

.stat-row {
  margin: 0;
  gap: 0.4rem 1.6rem;
  display: flex;
  flex-flow: row wrap;

  .stat {
    gap: 0.8rem;
    display: flex;
    align-items: baseline;
  }

  // The shared .eyebrow recipe carries the small caps; a dt in a facts row
  // only trims the block margins and steps down a size.
  .stat-label {
    margin: 0;
    font-size: 1.05rem;
  }

  .stat-value {
    margin: 0;
    font-weight: 700;
    font-size: 1.25rem;
  }
}

.headline {
  margin: 0;
  font-size: 1.8rem;
}

.outs {
  gap: 0.5rem;
  display: flex;
  flex-flow: column nowrap;

  .outs-lead {
    margin: 0;
    font-size: 1.3rem;
    color: var(--hior-ange);
  }
}

// Chip and list recipes come from templates/_country-chip.scss;
// doors only add their hairline pill.
.doors {
  gap: 0.45rem;
  justify-content: flex-start;
}

.door {
  font-size: 1.15rem;
  border: 0.1rem solid ink(0.3);
  border-radius: 1.2rem;

  &.more {
    opacity: 0.65;
    display: flex;
    align-items: center;
    padding: 0.3rem 0.9rem;
    border-style: dashed;
  }
}
</style>
