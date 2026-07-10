<template>
  <span class="landmark-reveal">
    <span class="head">
      <img class="photo" :src="landmark.image" :alt="landmark.name" />
      <span class="copy">
        <strong class="name">{{ landmark.name }}</strong>
        <span
          >{{ landmark.city ? `${landmark.city}, ` : ''
          }}{{ countryName(landmark.country) }}</span
        >
        <span class="kind">{{ KIND_COPY[landmark.kind] }}</span>
      </span>
    </span>
    <span v-if="landmark.description" class="description">{{ landmark.description }}</span>
  </span>
</template>
<script lang="ts" setup>
import type { LandmarkEntry } from '~~/generators/create-landmarks-file'
import type { LandmarkKind } from '~~/generators/data/landmark-seeds'
import { countryName } from '~~/lib/country'

const KIND_COPY: { [kind in LandmarkKind]: string } = {
  natural: 'A natural wonder',
  religious: 'A place of worship',
  ancient: 'An ancient site',
  monument: 'A built monument',
  urban: 'A city landmark',
}

defineProps<{ landmark: LandmarkEntry }>()
</script>
<style lang="scss" scoped>
// Spans throughout: the reveal also renders inside ChallengeResult's lesson
// <p>, where block elements would be invalid markup.
.landmark-reveal {
  gap: 1.2rem;
  display: flex;
  flex-flow: column nowrap;
}

.head {
  gap: 1.6rem;
  display: flex;
  align-items: center;
}

.photo {
  width: 10rem;
  height: 10rem;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 0.4rem;
}

.copy {
  gap: 0.3rem;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;

  .name {
    font-size: 1.8rem;
  }
}

.kind {
  color: var(--soft-blue);
}

.description {
  display: block;
  text-align: left;
  text-wrap: pretty;
}
</style>
