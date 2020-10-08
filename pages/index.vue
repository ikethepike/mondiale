<template>
  <div>
    <ModalKicked v-if="kicked" @close="kicked = false" />

    <Welcome />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, useContext } from '@nuxtjs/composition-api'

export default defineComponent({
  setup() {
    const context = useContext()
    const kicked = ref(Boolean(Number(context.route.value.query.kicked)))

    const test = () => {
      alert('wow')
    }

    return {
      test,
      kicked,
    }
  },
})
</script>
