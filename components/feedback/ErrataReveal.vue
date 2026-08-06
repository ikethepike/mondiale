<template>
  <span class="errata-reveal">
    <strong class="verdict">{{ verdict }}</strong>
    <span class="roster">
      <span
        v-for="entry in roster"
        :key="entry.isoCode"
        class="entry"
        :class="{ guilty: entry.guilty }"
      >
        <CountryChip :country="getCountry(entry.isoCode)" tag="span" compact />
        <span v-if="entry.guilty" class="printed">printed “{{ entry.printed }}”</span>
      </span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { countryName, getCountry } from '~~/lib/country'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const errata = computed(() => props.challenge.errata)

/** The lineup with the truth restored — CountryChip names each country
 *  correctly, and the guilty ones carry what the map claimed instead. */
const roster = computed(() =>
  (errata.value?.lineup ?? []).map(isoCode => ({
    isoCode,
    guilty: !!errata.value?.culprits.includes(isoCode),
    printed: errata.value?.labels[isoCode] ?? '',
  }))
)

const verdict = computed(() => {
  const active = errata.value
  if (!active) return ''
  const [first, second] = active.culprits
  if (active.kind === 'swap' && second) {
    return `${countryName(first)} and ${countryName(second)} were wearing each other's names.`
  }
  return `That was ${countryName(first)} — the map called it ${active.labels[first]}.`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.errata-reveal {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.verdict {
  text-align: center;
}

.roster {
  gap: 0.6rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.entry {
  gap: 0.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  opacity: 0.55;

  &.guilty {
    opacity: 1;
  }
}

.printed {
  font-size: 1.2rem;
  color: var(--hior-ange);
  text-decoration: line-through;
}
</style>
