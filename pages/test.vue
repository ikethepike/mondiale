<template>
  <div>
    <h1>Welcome to the test page</h1>
    <TestComponent />
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

useClientEvents()

onMounted(() => {
  setTimeout(() => {
    useClientEvents()
  }, 1000)
})
</script>
