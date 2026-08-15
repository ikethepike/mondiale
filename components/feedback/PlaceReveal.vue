<template>
  <span class="place-reveal" :class="{ compact }">
    <span class="head">
      <img class="photo" :src="place.image" :alt="place.name" />
      <span class="copy">
        <strong class="name">{{ place.name }}</strong>
        <span class="where">
          {{ place.curated?.city ? `${place.curated.city}, ` : ''
          }}{{ countryName(getCountry(place.country)) }}
        </span>
        <span v-if="standing" class="standing">{{ standing }}</span>
      </span>
    </span>
    <span v-if="place.description" class="description">{{ capitalize(place.description) }}</span>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" :item-credit="mediaCreditLine(place)" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import { computed } from 'vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, mediaCreditLine } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import type { LandmarkKind, PlaceEntry } from '~~/types/places.types'

const props = defineProps<{ place: PlaceEntry; compact?: boolean }>()

const KIND_COPY: { [kind in LandmarkKind]: string } = {
  natural: 'A natural wonder',
  religious: 'A place of worship',
  ancient: 'An ancient site',
  monument: 'A built monument',
  urban: 'A city landmark',
}

/**
 * What the place is, from whichever facets it holds. A subject on both rosters
 * — Ha Long Bay is a curated landmark AND a World Heritage site — says both,
 * which is the fact the split datasets could never show in one reveal.
 */
const standing = computed(() => {
  const parts: string[] = []
  if (props.place.curated) parts.push(KIND_COPY[props.place.curated.kind])
  const { unesco } = props.place
  if (unesco) {
    parts.push(
      unesco.inscribedYear
        ? `World Heritage since ${unesco.inscribedYear}`
        : 'A World Heritage Site'
    )
  }
  return parts.join(' · ')
})

// The entry's own `imageSource` says whether the photo is Commons or
// Unsplash — mediaCreditLine reads it, so no fallback source is passed.
const sources = datasetAttribution('places')

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
</script>
<style lang="scss" scoped>
// Spans throughout: the reveal also renders inside ChallengeResult's lesson
// body. Blocks would be legal there now; the spans stay because they work.
.place-reveal {
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

.standing {
  color: var(--soft-blue);
}

.description {
  display: block;
  text-align: left;
  text-wrap: pretty;
}

// The per-beat reveal stands in a tighter box than the end-of-round one.
.compact {
  gap: 1rem;

  .head {
    gap: 1rem;
    align-items: flex-start;
  }

  .photo {
    width: 8rem;
    height: 6rem;
  }

  .name {
    font-size: 1.5rem;
  }

  .where {
    opacity: 0.75;
    font-size: 1.15rem;
  }

  .standing,
  .description {
    font-size: 1.15rem;
  }
}
</style>
