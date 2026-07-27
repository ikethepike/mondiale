<template>
  <section class="manhunt-reveal pane tr decorator-bottom">
    <DespotHat class="despot-hat" />
    <h2 class="headline">
      {{ headline }}
    </h2>
    <p class="escape-line">{{ escapeLine }}</p>
    <ol class="trail">
      <template v-for="(isoCode, index) in walk" :key="`${index}-${isoCode}`">
        <li v-if="index > 0" class="hop-mark" :class="{ sea: isSeaHop(index) }">
          {{ isSeaHop(index) ? '〜' : '→' }}
        </li>
        <li class="stop map-caption" :class="{ last: index === walk.length - 1 }">
          <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
          <span>{{ countryName(getCountry(isoCode)) }}</span>
        </li>
      </template>
    </ol>
    <div v-if="capturerNames.length" class="capturers">
      <p>
        Cornered by
        <strong>{{ capturerNames.join(' and ') }}</strong>
        on turn {{ capturedHop }}.
      </p>
    </div>
    <div v-if="clues.length" class="intel-recap">
      <p class="recap-lead">The intel that closed the net:</p>
      <ul class="clues">
        <li v-for="clue in clues" :key="clue.hop" class="clue-row">
          <span class="hop-badge">{{ clue.hop }}</span>
          <span>{{ clue.text }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import DespotHat from '~/components/challenge/DespotHat.vue'
import { isStraitHop } from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import type { ManhuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  challenge: ManhuntChallenge
  players: { [playerId: string]: Player }
  playerId: string
}>()

const nameOf = (playerId: string) =>
  playerId === props.playerId ? 'You' : props.players[playerId]?.name || 'Anonymous'

const outcome = computed(() => props.challenge.state.outcome)
const walk = computed(() => outcome.value?.trail ?? [])
const clues = computed(() => props.challenge.state.clues)

const despotIsMe = computed(() => props.challenge.despotId === props.playerId)
const despotName = computed(() => nameOf(props.challenge.despotId))

const headline = computed(() => {
  if (outcome.value?.kind === 'captured') {
    return despotIsMe.value
      ? `You were captured in ${countryName(getCountry(outcome.value.country))}`
      : `${despotName.value} — captured in ${countryName(getCountry(outcome.value.country))}`
  }
  if (outcome.value?.kind === 'escaped') {
    return despotIsMe.value ? 'You got away with the treasury' : `${despotName.value} escaped`
  }
  return 'The hunt is over'
})

const escapeLine = computed(() => {
  const hops = walk.value.length - 1
  const seaHops = props.challenge.state.moves.filter(move => move.kind === 'sea').length
  const flight = `${hops} ${hops === 1 ? 'border' : 'borders'} crossed`
  return seaHops
    ? `${flight}, ${seaHops} ${seaHops === 1 ? 'sea passage' : 'sea passages'} taken`
    : flight
})

const capturedHop = computed(() =>
  outcome.value?.kind === 'captured' ? outcome.value.hop : undefined
)
const capturerNames = computed(() =>
  outcome.value?.kind === 'captured' ? outcome.value.capturerIds.map(nameOf) : []
)

/** Hop `index` (into the trail) crossed water: an announced sea passage, or a
 *  plain strait hop. */
const seaHopNumbers = computed(
  () =>
    new Set(props.challenge.state.moves.filter(move => move.kind === 'sea').map(move => move.hop))
)
const isSeaHop = (index: number): boolean =>
  seaHopNumbers.value.has(index) || isStraitHop(walk.value[index - 1], walk.value[index])
</script>
<style lang="scss" scoped>
.manhunt-reveal {
  gap: 1rem;
  display: flex;
  padding: 1.6rem;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
}

.despot-hat {
  width: 4.6rem;
  // Worn slightly askew, as the office demands.
  transform: rotate(-9deg);
}

.headline {
  margin: 0;
}

.escape-line {
  margin: 0;
  opacity: 0.75;
}

.trail {
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  align-items: center;
  justify-content: center;
}

.stop {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  padding: 0.3rem 0.9rem;

  &.last {
    font-weight: bold;
    border-width: 0.15rem;
  }
}

.stop-flag {
  width: 2.2rem;
  height: 1.5rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.hop-mark {
  opacity: 0.6;
  font-weight: bold;

  &.sea {
    color: hsl(215.7, 76.4%, 41%);
  }
}

.capturers p {
  margin: 0;
}

.intel-recap {
  width: 100%;

  .recap-lead {
    margin: 0 0 0.5rem;
    opacity: 0.75;
  }
}

.clues {
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  text-align: left;
  flex-flow: column nowrap;
}

.clue-row {
  gap: 0.6rem;
  display: flex;
  align-items: center;
}

.hop-badge {
  width: 1.4rem;
  height: 1.4rem;
  display: grid;
  flex-shrink: 0;
  font-size: 0.8em;
  font-weight: bold;
  place-items: center;
  border-radius: 50%;
  background: hsla(212, 58%, 52%, 0.18);
}
</style>
