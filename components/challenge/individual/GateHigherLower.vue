<template>
  <template v-if="currentDuel">
    <h1 class="map-caption">Which ranks higher — {{ topic }}?</h1>
    <span class="map-caption sub">Duel {{ index + 1 }} of {{ total }} — win them all</span>
    <div class="gate-options card-options">
      <button
        v-for="option in [currentDuel.a, currentDuel.b]"
        :key="option"
        class="card-option"
        type="button"
        @click="answerDuel(option)"
      >
        <CountryTileFlag class="option-flag" :country="getCountry(option)" />
        <span>{{ countryName(option) }}</span>
      </button>
    </div>
  </template>
</template>
<script lang="ts" setup>
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import { accessorTopicLabel } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import { getValueByAccessorID } from '~~/lib/values'
import { PAIR_COLORS } from './pair-colors'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, missNote, duelOutcomes, submitAnswer } = useGateChallenge()

const index = ref(0)
const total = computed(() => props.challenge.higherLower?.pairs.length ?? 0)
const currentDuel = computed(() => props.challenge.higherLower?.pairs[index.value])
const topic = computed(() => {
  const accessorId = props.challenge.higherLower?.accessorId
  return accessorId ? accessorTopicLabel(accessorId) : ''
})

// Paint the faced pairs onto the map in matching colours (win or loss).
const revealDuelsOnMap = () => {
  gameStore.map.countryGroupings = duelOutcomes.value.map((outcome, position) => ({
    color: PAIR_COLORS[position % PAIR_COLORS.length],
    countries: [outcome.higher, outcome.lower],
  }))
  gameStore.map.focus = duelOutcomes.value.flatMap(outcome => [outcome.higher, outcome.lower])
}

const answerDuel = (picked: ISOCountryCode) => {
  const higherLower = props.challenge.higherLower
  const duel = currentDuel.value
  if (!higherLower || !duel || status.value) return

  const other = picked === duel.a ? duel.b : duel.a
  const pickedValue = getValueByAccessorID(picked, higherLower.accessorId)?.amount ?? 0
  const otherValue = getValueByAccessorID(other, higherLower.accessorId)?.amount ?? 0
  const won = pickedValue > otherValue

  duelOutcomes.value.push({
    picked,
    higher: won ? picked : other,
    lower: won ? other : picked,
    correct: won,
  })

  if (won) {
    if (index.value >= total.value - 1) {
      // Swept the whole streak — submit the winning token
      revealDuelsOnMap()
      return submitAnswer(props.challenge.country, { reveal: false })
    }
    index.value++
    return
  }

  // Any lost duel fails the challenge: submit a token that can't match
  missNote.value = `${countryName(other)} ranks higher`
  const wrongToken = props.challenge.country === picked ? other : picked
  revealDuelsOnMap()
  submitAnswer(wrongToken, { reveal: false })
}
</script>
