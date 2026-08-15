<template>
  <!-- The photo gates — a leader's face, a capital skyline, a landmark — are
       one question with three subjects: an image above, four flags below.
       PhotoOptionChallenge owns the frame and its credit line. -->
  <PhotoOptionChallenge
    v-if="photo && challenge.options"
    :image="photo.image"
    :caption="photo.caption"
    :options="challenge.options"
    :alt="photo.alt"
    :attributions="datasetAttribution(photo.dataset)"
    @pick="submitAnswer"
  />
</template>
<script lang="ts" setup>
import PhotoOptionChallenge from '~/components/challenge/PhotoOptionChallenge.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { variant, submitAnswer } = useGateChallenge()

const photo = computed(() => {
  const active = props.challenge
  switch (variant.value) {
    case 'leader-portrait':
      return active.portrait
        ? {
            image: active.portrait.image,
            caption: 'Which country does this leader govern?',
            alt: 'A national leader',
            dataset: 'leaders' as const,
          }
        : undefined
    case 'capital-match':
      return active.image
        ? {
            image: active.image,
            caption: "Which country's capital is this?",
            alt: 'A capital city',
            dataset: 'capitals' as const,
          }
        : undefined
    default:
      return active.image
        ? {
            image: active.image,
            caption: 'Which country is this landmark in?',
            alt: 'A famous landmark',
            dataset: 'places' as const,
          }
        : undefined
  }
})
</script>
