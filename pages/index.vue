<template>
  <div>
    <ModalKicked v-if="kicked" @close="kicked = false" />
    <Welcome />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

export default defineComponent({
  setup(_, { root }) {
    const kicked = ref(Boolean(Number(root.$route.query.kicked)))

    return {
      kicked,
    }
  },
})
</script>
