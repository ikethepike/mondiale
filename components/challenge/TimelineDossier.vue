<template>
  <ExpandDock v-model:open="open" fit :label="event?.name" close-title="Close the story">
    <article v-if="event" class="timeline-dossier">
      <figure v-if="event.image" class="dossier-photo">
        <img :src="event.image" :alt="event.name" />
        <figcaption v-if="credit" class="credit">{{ credit }}</figcaption>
      </figure>
      <div class="dossier-body">
        <span class="eyebrow">
          {{ EVENT_KIND_COPY[event.kind] }} · {{ countryName(getCountry(event.country)) }}
        </span>
        <p class="dossier-year">{{ formatEventYear(event.year) }}</p>
        <h2 class="dossier-title">{{ event.name }}</h2>
        <p class="dossier-description">{{ event.description }}</p>
        <span v-if="placerLine" class="dossier-placer" :class="{ missed }">{{ placerLine }}</span>
        <span class="credit-row">
          <SourceInfo :attributions="sources" label="Sources" :item-credit="credit" />
        </span>
      </div>
    </article>
  </ExpandDock>
</template>
<script lang="ts" setup>
/**
 * One placed event, blown up to read: photo, year, name and the STORY — the
 * description that plays for seconds mid-round and then vanishes. Both ends
 * of the timeline experience open it (the live line's stops while waiting,
 * the finished report's chronicle), so the reading surface cannot drift.
 * Only PLACED slugs ever reach it — a placed event's year is already public
 * on the line, so there is nothing to leak.
 */
import ExpandDock from '~/components/feedback/ExpandDock.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, mediaCreditLine } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { EVENT_KIND_COPY, formatEventYear, timelineEvent } from '~~/lib/timeline'

const props = defineProps<{
  slug?: string
  /** "Placed by Ada" / "Ada filed it late" — the reveal passes placement
   *  context; the live line leaves it off. */
  placerLine?: string
  missed?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const sources = datasetAttribution('events')
const event = computed(() => (props.slug ? timelineEvent(props.slug) : undefined))
const credit = computed(() => (event.value ? mediaCreditLine(event.value, 'commons-media') : ''))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.timeline-dossier {
  gap: 1.6rem;
  display: flex;
  max-width: 52rem;
  flex-flow: column nowrap;
  // The dossier owns its height inside the fit frame: a long story scrolls
  // here, never past the frame (and the close button keeps its corner).
  max-height: min(74dvh, 58rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dossier-photo {
  margin: 0;
  position: relative;

  img {
    width: 100%;
    max-height: 26rem;
    object-fit: cover;
    border-radius: 0.6rem;
  }

  .credit {
    right: 0.6rem;
    bottom: 0.6rem;
    position: absolute;
    font-size: 1rem;
    padding: 0.1rem 0.5rem;
    border-radius: 0.3rem;
    color: var(--dark-blue);
    background: milk(0.85);
  }
}

.dossier-body {
  gap: 0.4rem;
  display: flex;
  flex-flow: column nowrap;
}

.dossier-year {
  margin: 0;
  line-height: 1;
  font-size: 1.6rem;
  font-weight: bold;
  color: var(--dark-blue);
}

.dossier-title {
  margin: 0;
  font-size: 2rem;
}

.dossier-description {
  margin: 0.4rem 0 0;
  opacity: 0.85;
  font-size: 1.4rem;
  line-height: 1.55;
}

.dossier-placer {
  opacity: 0.7;
  margin-top: 0.4rem;
  font-size: 1.2rem;

  &.missed {
    color: flame(0.9);
  }
}

.credit-row {
  margin-top: 0.6rem;
}
</style>
