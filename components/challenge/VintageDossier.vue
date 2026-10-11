<template>
  <ExpandDock v-model:open="open" fit :label="title" close-title="Close">
    <article v-if="change" class="vintage-dossier">
      <figure v-if="event?.image" class="dossier-photo">
        <img :src="event.image" :alt="event.name" />
      </figure>
      <div class="dossier-body">
        <span class="eyebrow">{{ CHANGE_COPY[change.kind] }}</span>
        <p class="dossier-year">{{ change.year }}</p>
        <h2 class="dossier-title">{{ title }}</h2>
        <p v-if="change.note" class="dossier-note">{{ change.note }}</p>
        <p v-if="etymology" class="dossier-etymology">
          <strong>The name:</strong> {{ sentenceCase(etymology) }}.
        </p>
        <div v-if="event" class="dossier-event">
          <span class="eyebrow">That year</span>
          <strong>{{ event.name }}</strong>
          <p>{{ event.description }}</p>
        </div>
      </div>
      <footer class="dossier-foot">
        <SourceInfo :attributions="sources" label="Sources" />
      </footer>
    </article>
  </ExpandDock>
</template>
<script lang="ts" setup>
import ExpandDock from '~/components/feedback/ExpandDock.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { sentenceCase } from '~~/lib/strings'
import { describeChange, type VintageChange, type VintageChangeKind } from '~~/lib/vintage-story'

/** One change on a Vintage scorecard, opened to read: why it happened, what
 *  the new name means, and the curated event the country lived that year. */
const props = defineProps<{ change?: VintageChange }>()
const open = defineModel<boolean>('open', { default: false })

const CHANGE_COPY: Record<VintageChangeKind, string> = {
  independence: 'Independence',
  renamed: 'Renamed',
  formed: 'New on the map',
  gone: 'Gone from the map',
  ruler: 'New rule',
  moved: 'Border moved',
}

const sources = datasetAttribution('vintage')
const title = computed(() => (props.change ? sentenceCase(describeChange(props.change)) : ''))

const etymology = ref<string>()
const event = ref<{ name: string; description: string; image?: string }>()
watch(
  () => props.change,
  async change => {
    etymology.value = undefined
    event.value = undefined
    if (!change?.iso) return
    const [names, timeline] = await Promise.all([
      ['renamed', 'independence'].includes(change.kind)
        ? import('~~/data/name-facts.gen')
        : undefined,
      import('~~/lib/timeline'),
    ])
    if (props.change !== change) return
    etymology.value = names?.NAME_FACTS[change.iso]?.etymology
    event.value = timeline.eventsIn(change.iso, change.year)[0]
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.vintage-dossier {
  display: grid;
  gap: 1.2rem;
  max-height: min(60rem, 70dvh);
  overflow-y: auto;
  padding: 1.6rem;
}

.dossier-photo {
  margin: 0;

  img {
    width: 100%;
    max-height: 22rem;
    object-fit: cover;
    border-radius: 0.6rem;
  }
}

.dossier-body {
  display: grid;
  gap: 0.6rem;
}

.dossier-year {
  margin: 0;
  font-size: 3.2rem;
  font-variant-numeric: tabular-nums;
}

.dossier-title {
  margin: 0;
  font-size: 2rem;
}

.dossier-note,
.dossier-etymology {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.45;
}

.dossier-event {
  display: grid;
  gap: 0.3rem;
  padding-top: 1rem;
  border-top: 1px solid ink(0.15);

  p {
    margin: 0;
    font-size: 1.4rem;
    color: ink(0.75);
  }
}
</style>
