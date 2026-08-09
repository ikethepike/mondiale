<template>
  <!-- Render-loop control only — an inert group, draws nothing. -->
  <TresGroup />
</template>
<script lang="ts" setup>
import { useLoop } from '@tresjs/core'

// Parks the GPU while the stage is hidden: the persistent board keeps its
// WebGL context for the whole game, and this gate is what makes that free —
// no rAF, no draw calls while a challenge is on. It always runs UNTIL the
// first frame lands (that frame is the stage's readiness signal), then
// follows `active`.
const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ ready: [] }>()

const { stop, start, onRender } = useLoop()

const firstFrameDrawn = ref(false)

const sync = () => {
  if (props.active || !firstFrameDrawn.value) start()
  else stop()
}

const hook = onRender(() => {
  if (firstFrameDrawn.value) return
  firstFrameDrawn.value = true
  emit('ready')
  sync()
  hook.off()
})

watch(() => props.active, sync, { immediate: true })
</script>
