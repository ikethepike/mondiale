<template>
  <div>
    <h2>Test component</h2>
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

useClientEvents()
</script>
