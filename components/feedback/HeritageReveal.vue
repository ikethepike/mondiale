<template>
  <span class="heritage-reveal">
    <img class="photo" :src="site.image" :alt="site.name" />
    <span class="facts">
      <strong class="name">{{ site.name }}</strong>
      <span class="place">
        {{ countryName(getCountry(site.country)) }}
        <template v-if="site.kind"> · {{ KIND_LABELS[site.kind] }}</template>
        <template v-if="site.inscribedYear"> · World Heritage since {{ site.inscribedYear }}</template>
      </span>
      <span v-if="site.description" class="description">{{ capitalize(site.description) }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import type { HeritageEntry } from '~~/generators/create-heritage-file'
import { countryName, getCountry } from '~~/lib/country'

defineProps<{ site: HeritageEntry }>()

const KIND_LABELS: { [kind in NonNullable<HeritageEntry['kind']>]: string } = {
  cultural: 'Cultural site',
  natural: 'Natural site',
  mixed: 'Mixed cultural & natural site',
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
</script>
<style lang="scss" scoped>
// Span-based like LandmarkReveal, so it can live inside prose containers.
.heritage-reveal {
  gap: 1rem;
  display: flex;
  align-items: flex-start;
}

.photo {
  width: 8rem;
  height: 6rem;
  flex: none;
  object-fit: cover;
  border-radius: 0.4rem;
}

.facts {
  gap: 0.3rem;
  display: flex;
  flex-flow: column nowrap;
}

.name {
  font-size: 1.5rem;
}

.place {
  opacity: 0.75;
  font-size: 1.15rem;
}

.description {
  font-size: 1.15rem;
}
</style>
