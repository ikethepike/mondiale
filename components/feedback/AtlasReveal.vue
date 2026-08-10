<template>
  <div v-if="challenge.atlas && chain.length" class="atlas-reveal">
    <AtlasChainRail :chain="chain" :overlaps="challenge.atlas.overlaps" finished />

    <p v-if="won" class="tally">
      {{ banked }} links banked{{ banked > chain.length - 1 ? ' — overlaps paid extra' : '' }}
    </p>
    <template v-else>
      <p class="teach">
        {{
          continuations.length
            ? `You needed a country starting with “${letter}” —`
            : `Every country starting with “${letter}” was already spent.`
        }}
      </p>
      <ul v-if="continuations.length" class="country-chip-list">
        <CountryChip
          v-for="isoCode in continuations"
          :key="isoCode"
          compact
          :country="getCountry(isoCode)"
        />
      </ul>
    </template>
  </div>
</template>
<script lang="ts" setup>
import AtlasChainRail from '~/components/challenge/AtlasChainRail.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { atlasChainCredit, atlasContinuations, atlasTailLetter } from '~~/lib/atlas-chain'
import { getCountry } from '~~/lib/country'
import { playableWorldCountries } from '~~/lib/game-rules'
import { useGameStore } from '~~/store/game.store'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The atlas gate's ledger: the chain as it stood, junction letters marked. On
 * a miss the card teaches — the letter that broke the run and a hand of names
 * that would have carried it, straight from the same continuation function
 * the question graded with.
 */
const props = defineProps<{
  challenge: IndividualChallenge
  chain: ISOCountryCode[]
}>()

const gameStore = useGameStore()
const rule = computed(() => ({ overlaps: !!props.challenge.atlas?.overlaps }))
const banked = computed(() => atlasChainCredit(props.chain, rule.value))
const won = computed(() => banked.value >= (props.challenge.atlas?.target ?? Infinity))

const letter = computed(() => {
  const head = props.chain.at(-1)
  return head ? atlasTailLetter(head).toUpperCase() : ''
})

const continuations = computed(() => {
  const head = props.chain.at(-1)
  if (!head || won.value) return []
  const pool = playableWorldCountries(gameStore.game ?? { variant: 'world', difficulty: 'normal' })
  return atlasContinuations(head, props.chain, pool, rule.value).slice(0, 3)
})
</script>
<style lang="scss" scoped>
.atlas-reveal {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.tally {
  margin: 0;
  font-weight: 700;
}

.teach {
  margin: 0;
}
</style>
