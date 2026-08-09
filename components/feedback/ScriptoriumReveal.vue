<template>
  <span v-if="entry" class="scriptorium-reveal">
    <strong class="lesson">
      That was {{ entry.language }}, written in {{ entry.script
      }}<template v-if="speakers"> — {{ formatCompact(speakers) }} speakers</template>.
    </strong>
    <span class="answers-lead">Any of these countries counted:</span>
    <ul class="country-chip-list">
      <li v-for="isoCode in answers" :key="isoCode">
        <CountryChip
          :country="getCountry(isoCode)"
          tag="span"
          compact
          :class="{ picked: isoCode === submitted }"
        />
      </li>
    </ul>
  </span>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { TONGUE_FACTS } from '~~/data/tongue-facts.gen'
import { getCountry } from '~~/lib/country'
import { formatCompact } from '~~/lib/number'
import { scriptoriumAnswers, scriptoriumEntry } from '~~/lib/scriptorium'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{
  challenge: IndividualChallenge
  submitted?: ISOCountryCode
}>()

const entry = computed(() => {
  const language = props.challenge.scriptorium?.language
  return language ? scriptoriumEntry(language) : undefined
})
// The same set the verdict used — the chip list and the score cannot disagree.
const answers = computed(() =>
  entry.value ? scriptoriumAnswers(entry.value.language) : []
)
const speakers = computed(() =>
  entry.value ? TONGUE_FACTS[entry.value.language]?.speakers : undefined
)
</script>
<style lang="scss" scoped>
.scriptorium-reveal {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.lesson {
  font-size: 1.5rem;
  text-align: center;
  color: var(--dark-blue);
}

.answers-lead {
  font-size: 1.3rem;
  color: var(--soft-blue);
}

// The country the player actually named, inside the accepted set.
.picked {
  outline: 0.2rem solid var(--soft-blue);
  outline-offset: 0.1rem;
  border-radius: 0.6rem;
}
</style>
