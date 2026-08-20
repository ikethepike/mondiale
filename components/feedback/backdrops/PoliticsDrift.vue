<template>
  <DriftField :tiles="tiles" :seed="seed" :columns="columns" :per-column="perColumn" />
</template>
<script lang="ts" setup>
import DriftField from '~~/components/feedback/DriftField.vue'
import { decorativeLogos } from '~~/lib/parties'
import { useIsPhone } from '~~/lib/use-viewport'

/**
 * The politics card's ground: a wall of party marks, drifting.
 *
 * The pool is `decorativeLogos`, not the roster — two in five logos are
 * fair-use or carry a restriction no backdrop may scatter, and that gate lives
 * in lib/parties.ts so one predicate answers for every decorative surface.
 */
const props = defineProps<{ seed: number }>()

const isPhone = useIsPhone()

// Resolved once per mount, not per frame. ~750 marks; the field samples.
const tiles = computed(() =>
  decorativeLogos().map(party => ({ src: party.logo as string, ratio: party.logoRatio }))
)

// A phone is a third of the width and every tile is a decode: fewer, larger
// marks read better there and cost less.
const columns = computed(() => (isPhone.value ? 4 : 9))
const perColumn = computed(() => (isPhone.value ? 5 : 7))
const seed = computed(() => props.seed)
</script>
