<template>
  <section class="chain-reveal pane tr decorator-bottom">
    <h2 class="headline">
      {{ headline }}
    </h2>
    <PlacementList :rows="rows" :players="players" />
    <div v-if="myOuts.length" class="outs">
      <p class="outs-lead">You had {{ myOuts.length === 1 ? 'an open door' : 'open doors' }}:</p>
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
      <SourceInfo drop="up" :attributions="sources" label="Sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import PlacementList from '~/components/challenge/PlacementList.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { getCountry } from '~~/lib/country'
import { standingPlayers } from '~~/lib/chain'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import type { BorderChainState } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const MAX_DOORS_SHOWN = 6

/** The chain's legality comes from two registries: land adjacency and the
 *  named strait crossings. */
const sources = [...datasetAttribution('borders'), ...datasetAttribution('straits')]

const props = defineProps<{
  state: BorderChainState
  players: { [playerId: string]: Player }
  playerId: string
}>()

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
      outcome === 'won'
        ? 'Last one standing'
        : outcome === 'trapped'
          ? trapper
            ? `walked into ${nameOf(trapper)}'s dead end`
            : 'walked into a dead end'
          : outcome === 'timeout'
            ? 'ran out of clock'
            : 'stepped off the map'
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
  pointer-events: none;
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
