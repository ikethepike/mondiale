<template>
  <FlagMeaningReveal v-if="entry" :entry="entry" />
</template>
<script lang="ts" setup>
import FlagMeaningReveal from '~/components/challenge/FlagMeaningReveal.vue'
import { loadFlagMeaning } from '~~/lib/flag-meanings'
import type { FlagMeaning } from '~~/data/flag-meanings.gen'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

/** The flag gate's symbolism arrives from a lazily-loaded chunk, so it can't
 *  be resolved synchronously in the reveal dispatch. This wrapper keeps the
 *  loading with the thing that needs it and renders nothing until (unless) an
 *  entry lands. */
const props = defineProps<{ challenge: IndividualChallenge }>()

const entry = ref<FlagMeaning>()

watch(
  () => props.challenge,
  async active => {
    entry.value = undefined
    const loaded = await loadFlagMeaning(active.country)
    if (props.challenge === active) entry.value = loaded
  },
  { immediate: true }
)
</script>
