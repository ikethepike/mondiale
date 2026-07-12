<template>
  <section class="chain-reveal pane tr decorator-bottom">
    <h2 class="headline">
      {{ headline }}
    </h2>
    <ol class="placements">
      <li v-for="row in rows" :key="row.playerId" class="placement">
        <PlayerPawn class="pawn" :player="players[row.playerId]" />
        <span class="name">{{ row.name }}</span>
        <span class="fate">{{ row.fate }}</span>
        <span class="links">{{ row.links }} {{ row.links === 1 ? 'link' : 'links' }}</span>
      </li>
    </ol>
    <div v-if="myOuts.length" class="outs">
      <p class="outs-lead">You had {{ myOuts.length === 1 ? 'an open door' : 'open doors' }}:</p>
      <ul class="doors">
        <li v-for="isoCode in shownOuts" :key="isoCode" class="door">
          <CountryFlag class="door-flag" :country="getCountry(isoCode)" mode="background" />
          <span>{{ countryName(getCountry(isoCode)) }}</span>
        </li>
        <li v-if="overflowCount" class="door more">+ {{ overflowCount }} others</li>
      </ul>
    </div>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { countryName, getCountry } from '~~/lib/country'
import { standingPlayers } from '~~/lib/chain'
import type { BorderChainState } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const MAX_DOORS_SHOWN = 6

const props = defineProps<{
  state: BorderChainState
  players: { [playerId: string]: Player }
  playerId: string
}>()

const nameOf = (playerId: string) => props.players[playerId]?.name || 'Anonymous'

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
    return {
      playerId,
      name: playerId === props.playerId ? 'You' : nameOf(playerId),
      fate,
      links: props.state.named[playerId]?.length ?? 0,
    }
  })
})

/** The teaching beat: the doors that were open at your fatal miss. */
const myOuts = computed(() => props.state.missedOuts[props.playerId] ?? [])
const shownOuts = computed(() => myOuts.value.slice(0, MAX_DOORS_SHOWN))
const overflowCount = computed(() => Math.max(0, myOuts.value.length - MAX_DOORS_SHOWN))
</script>
<style lang="scss" scoped>
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

.placements {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
}

.placement {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  font-size: 1.3rem;

  .pawn {
    width: 1.2rem;
    height: 1.85rem;
    flex: none;
  }

  .name {
    font-weight: bold;
  }

  .fate {
    opacity: 0.75;
  }

  .links {
    opacity: 0.6;
    margin-left: auto;
    white-space: nowrap;
  }
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

.doors {
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
}

.door {
  gap: 0.55rem;
  display: flex;
  padding: 0.3rem 0.9rem;
  font-size: 1.15rem;
  align-items: center;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.3);
  border-radius: 1.2rem;

  &.more {
    opacity: 0.65;
    border-style: dashed;
  }
}

.door-flag {
  width: 1.8rem;
  height: 1.25rem;
  border: 0.05rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}
</style>
