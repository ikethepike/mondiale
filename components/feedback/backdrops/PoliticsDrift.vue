<template>
  <DriftField :tiles="tiles" :seed="seed" :columns="columns" :per-column="perColumn" />
</template>
<script lang="ts" setup>
import DriftField from '~~/components/feedback/DriftField.vue'
import { decorativeLogos } from '~~/lib/parties'
import { useIsPhone } from '~~/lib/use-viewport'

/** A wall of party marks, filtered to what may be used decoratively. */
const props = defineProps<{ seed: number }>()

const isPhone = useIsPhone()

const tiles = computed(() =>
  decorativeLogos().map(party => ({ src: party.logo as string, ratio: party.logoRatio }))
)

const columns = computed(() => (isPhone.value ? 5 : 12))
const perColumn = computed(() => (isPhone.value ? 7 : 10))
const seed = computed(() => props.seed)
</script>
