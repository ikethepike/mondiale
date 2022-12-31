<template>
  <div class="country-tile">
    <div
      class="flag-pinwheel"
      :style="{ gridTemplateColumns: `repeat(${(pinwheelColors.length || 2) / 2}, 1fr)` }"
    >
      <div
        class="color"
        v-for="(color, index) in pinwheelColors"
        :key="`${country.isoCode}-${color}-${index}`"
        :style="{ backgroundColor: color }"
      />
    </div>
    <article>
      <header>
        <h3>{{ country.name.english }}</h3>
      </header>

      <div class="flag-wrapper">
        <div class="flag" v-html="country.flag" />
      </div>
    </article>
  </div>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { baseEncode } from '~~/lib/strings'
import { Country } from '~~/types/geography.types'

const props = defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
})

const pinwheelColors = computed<string[]>(() => {
  const filtered = props.country.identity.colors.filter(
    color => !['#ffffff', '#fff'].includes(color.toLowerCase())
  )

  if (!filtered.length) return []

  // Odd number of colors... damn
  if (filtered.length % 2 !== 0) {
    filtered.push(filtered[0])
  }

  return [...filtered, ...filtered.reverse()]
})
</script>
<style lang="scss" scoped>
.country-tile {
  cursor: move;
  overflow: hidden;
  position: relative;
  display: inline-block;
  font-family: 'Lusitana', serif;
  padding: 0.5rem 0.5rem 0 0.5rem;
  border-radius: 1.9rem 1.9rem 0 0;
}

article {
  z-index: 2;
  width: 20vw;
  padding: 2rem;
  min-width: 20rem;
  position: relative;
  background: #fffbf5;
  border: 0.1rem solid #000;
  border-radius: 1.9rem 1.9rem 0 0;
  border-bottom: 0.6rem solid #000;
}
header {
  text-align: center;
  margin-bottom: 1rem;
}
.flag-wrapper {
  border: 0.1rem solid #000;
}
.flag svg {
  width: 100%;
  display: block;
}

.flag-pinwheel {
  // opacity: 1;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  // display: none;
  // z-index: 5;
  position: absolute;
  pointer-events: none;
  transition: opacity 1s;
  // background-repeat: no-repeat;
  // background-position: 0 0, 100% 0, 100% 100%, 0 100%;

  display: grid;
  grid-template-rows: repeat(2, 1fr);
  animation: rotate 5s linear infinite;
  grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
}

.country-tile:hover .flag-pinwheel {
  opacity: 0.8;
}

@keyframes rotate {
  100% {
    transform: rotate(1turn);
  }
}
</style>
