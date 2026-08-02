<template>
  <!-- Spans throughout: this also renders inside ChallengeResult's lesson
       paragraph, where block elements would be invalid markup. -->
  <span class="flag-meaning-reveal">
    <span v-if="entry.meaning" class="meaning-line">{{ entry.meaning }}</span>
    <span v-if="entry.history" class="history-line">
      <span class="line-label">The story</span>
      {{ entry.history }}
    </span>
    <span class="source-line">
      {{ sourceLine }}
      <SourceInfo :attributions="attributions" />
    </span>
  </span>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionLine, datasetAttribution } from '~~/lib/attribution'
import type { FlagMeaning } from '~~/data/flag-meanings.gen'

/**
 * What the flag stands for. The entry comes from the lazy flag-meanings table —
 * the PARENT loads it (via loadFlagMeaning, lib/flag-meanings.ts) and gates on
 * the result, because an empty reveal must render nothing at all: hosts like
 * ChallengeResult's lesson pill treat any slotted component as content. Only
 * hand this a country's entry when `meaning` or `history` exists — the visual
 * `description` must never stand in for symbolism.
 */
defineProps<{
  entry: FlagMeaning
}>()

const attributions = computed(() => datasetAttribution('flag-meanings'))
const sourceLine = computed(() => attributionLine(attributions.value[0]))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.flag-meaning-reveal {
  gap: 0.8rem;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;
}

.meaning-line {
  font-size: 1.5rem;
  line-height: 1.5;
  color: var(--dark-blue);
}

.history-line {
  opacity: 0.8;
  font-size: 1.3rem;
  line-height: 1.5;
}

.line-label {
  display: block;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft-blue);
}
</style>
