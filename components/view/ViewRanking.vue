<template>
  <ul
    :style="{
      gridTemplateColumns: `repeat(${isoCodes.length}, minmax(${minWidth}, 1fr)) 1fr`,
    }"
  >
    <li v-for="isoCode in isoCodes" class="tile">
      <ModalScoreTile :iso-code="isoCode" />
    </li>
  </ul>
</template>
<script lang="ts" setup>
import type { ISOCountryCode } from '~~/types/geography.types'

defineProps({
  isoCodes: {
    type: Array as PropType<ISOCountryCode[]>,
    required: true,
  },
  minWidth: {
    type: String,
    default: '14rem',
  },
})
</script>
<style lang="scss" scoped>
ul {
  gap: 1rem;
  display: grid;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  &::-webkit-scrollbar {
    display: none;
  }
  &::after {
    content: '';
    width: 7rem;
    display: block;
  }
}
.tile {
  scroll-snap-align: center;
}
</style>
