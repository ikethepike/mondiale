<template>
  <DriftField :tiles="tiles" :seed="seed" :columns="columns" :per-column="perColumn" />
</template>
<script lang="ts" setup>
import DriftField from '~~/components/feedback/DriftField.vue'
import { glyphDataUri, STAT_GLYPHS } from '~~/lib/stat-glyphs'
import { useIsPhone } from '~~/lib/use-viewport'

/** Every stat the ranking round can ask about, at once. */
const props = defineProps<{ seed: number }>()

const isPhone = useIsPhone()

const tiles = Object.values(STAT_GLYPHS).map(glyph => ({ src: glyphDataUri(glyph) }))
// Denser than the logo walls: a stat glyph is one thin drawing, and at the
// logo wall's tile size it reads as an icon rather than a ground.
const columns = computed(() => (isPhone.value ? 8 : 15))
const perColumn = computed(() => (isPhone.value ? 9 : 12))
const seed = computed(() => props.seed)
</script>
