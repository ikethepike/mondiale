<template>
  <div class="variant-picker">
    <div class="variants-wrapper">
      <a class="variant-button prev" @click="scroll('left')" :class="{ disabled: atStart }">→</a>
      <a class="variant-button next" @click="scroll('right')" :class="{ disabled: atEnd }">←</a>

      <ul ref="slider" @scroll="onScroll">
        <li
          v-for="variant in gameVariants"
          :key="`variant-${variant}`"
          :data-variant="variant"
          :class="{ active: selectedVariant === variant }"
        >
          <component :is="components[variant]"></component>
          <p class="variant-title">{{ variant.replace('-', ' ') }}</p>
        </li>
      </ul>
    </div>

    <nav class="dot-navigation">
      <a
        v-for="variant in gameVariants"
        :key="`dot-${variant}`"
        :class="['dot', { chosen: variant === selectedVariant }]"
        role="navigation"
      />
    </nav>

    <input type="hidden" name="variant" :value="selectedVariant" />
  </div>
</template>
<script lang="ts" setup>
import { GameVariant, gameVariants } from '~~/types/game.types'

const slider = ref<HTMLUListElement>()
const selectedVariant = ref<GameVariant>(gameVariants[0])
const atEnd = ref(false)
const atStart = ref(true)

const components: { [component in GameVariant]: ReturnType<typeof resolveComponent> } = {
  africa: resolveComponent('MapAfrica'),
  world: resolveComponent('MapWorld'),
  asia: resolveComponent('MapAsia'),
  europe: resolveComponent('MapEurope'),
  'south-america': resolveComponent('MapSouthAmerica'),
  'north-america': resolveComponent('MapNorthAmerica'),
}

const scroll = (direction: 'left' | 'right') => {
  if (!slider.value) throw new ReferenceError('Slider is not defined')
  const { scrollWidth } = slider.value

  const multiplier = direction === 'left' ? -1 : 1
  const distance = (scrollWidth / gameVariants.length) * multiplier

  slider.value.scrollBy({
    left: distance,
    behavior: 'smooth',
  })
}

const onScroll = () => {
  if (!slider.value) throw new ReferenceError('Slider is not defined')
  const { scrollLeft, scrollWidth } = slider.value

  const variantIndex = Math.floor(gameVariants.length * (scrollLeft / scrollWidth))
  selectedVariant.value = gameVariants[variantIndex]

  atStart.value = variantIndex === 0
  atEnd.value = variantIndex === gameVariants.length - 1
}
</script>
<style lang="scss" scoped>
.variant-picker {
  gap: 2rem;
  display: grid;
  overflow: hidden;
  position: relative;
  ul {
    display: grid;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    scroll-snap-type: x mandatory;
    grid-template-columns: repeat(6, 100%);
  }
  li {
    gap: 1rem;
    display: flex;
    flex-shrink: 0;
    max-height: 40vh;
    align-items: center;
    flex-flow: column nowrap;
    scroll-snap-align: center;
  }

  li p {
    transition: 0.5s;
    text-transform: capitalize;
    transform: translateY(100%);
  }
  li.active p {
    transform: translateY(0);
  }

  .variant-button {
    top: 0;
    width: 6rem;
    height: 100%;
    border: none;
    margin: auto 0;
    display: block;
    transition: 0.3s;
    cursor: pointer;
    position: absolute;
    background: currentColor;
    mask: url('~/assets/icons/arrow-left.svg') no-repeat center/ 3.5rem;

    &.disabled {
      opacity: 0.3;
      cursor: default;
    }
    &.prev {
      left: 0;
    }
    &.next {
      right: 0;
      transform: scaleX(-1);
    }
  }
  // Hide scrollbar on webkit browsers
  ul::-webkit-scrollbar {
    display: none;
  }
}

.dot-navigation {
  gap: 1em;
  display: flex;
  font-size: 0.75rem;
  justify-content: center;
  .dot {
    width: 1em;
    height: 1em;
    transition: 0.3s;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.2);
  }
  .dot.chosen {
    background-color: rgba(0, 0, 0, 0.5);
  }
}
</style>
