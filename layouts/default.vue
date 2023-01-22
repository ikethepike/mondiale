<template>
  <div class="layout" :class="[`phase-${player?.phase}`]">
    <pre class="phase-indicator">{{ player?.phase }}</pre>
    <LazyGameMap
      class="game-map"
      :highlighted="highlighted"
      :highlight-country="reveal"
      :status="status"
      :country-groupings="
        currentFinalChallenge?._type === 'region-challenge' && !reveal
          ? Object.values(COLOR_CODED_REGIONS)
          : undefined
      "
    />
    <slot />

    <div class="reveal-wrapper" v-if="revealCountry">
      <CountryPinwheel :country="revealCountry" class="flag-pinwheel" />
      <article class="pane tr decorator-bottom" :class="[gameStore.map.status]">
        <div class="pane-content">
          <div class="flag" v-html="revealCountry.flag" />
          <small>{{ revealCountry.coordinates }}</small>
          <h3>{{ revealCountry.name.english }}</h3>
          <p>{{ revealCountry.geography.capital.name }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { COUNTRIES } from '~~/data/countries.gen'
import { COLOR_CODED_REGIONS } from '~~/lib/challenges/final-challenge'
import { useClientEvents } from '~~/lib/events/client-side'
import { ISOCountryCode } from '~~/types/geography.types'
const { player, game, currentRound, gameStore, currentFinalChallenge } = useClientEvents()

const reveal = toRef(gameStore.map, 'reveal')
const status = toRef(gameStore.map, 'status')

const revealCountry = computed(() => reveal.value && COUNTRIES[reveal.value])

const highlighted = computed<ISOCountryCode[]>(() => {
  const output = [...gameStore.map.highlighted]

  if (!game.value) return output
  if (!player.value) return output
  if (game.value.difficulty !== 'easy') return output
  if (player.value.phase !== 'group-challenge') return output

  const countries = currentRound.value?.round.groupChallenge.countriesPerPlayer[player.value.id]
  if (!countries) return output
  return [...countries, ...output]
})
</script>

<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';
.layout {
  max-width: 100%;
  overflow: hidden;
  position: relative;
}
// temp!
.phase-indicator {
  top: 0;
  color: #fff;
  z-index: 3000;
  position: absolute;
  mix-blend-mode: difference;
}

.game-map {
  top: 0;
  left: 0;
  width: 100%;
  transition: 0.3s;

  position: absolute;
  transform: scale(0.8);
  scrollbar-width: none;
  transform-origin: center;

  &::-webkit-scrollbar {
    display: none;
  }
}

.phase-undefined .game-map,
.phase-naming .game-map {
  animation: scale 10s;
  &:deep(svg path) {
    fill: none;
    stroke-width: 0.01rem;
    color: rgb(91, 91, 91);
  }
}

.phase-group-scores .game-map,
.phase-group-challenge .game-map,
.phase-individual-challenge .game-map,
.phase-final-challenge .game-map {
  transform: scale(1);
}

.phase-group-scores .game-map {
  overflow: hidden;
}

@keyframes scale {
  0% {
    transform: scale(10) translate(50%, 50%);
  }
}

@media (prefers-color-scheme: dark) {
}

.reveal-wrapper {
  overflow: hidden;
  position: relative;
  small {
    opacity: 0.7;
    display: block;
    text-align: center;
  }
  .flag {
    margin-bottom: 2rem;
    border: 0.1rem solid var(--text-color);
  }
  .flag:deep(svg) {
    display: block;
  }
}

@media screen and (min-width: $tablet) {
  .reveal-wrapper {
    left: 0;
    bottom: 0;
    width: 100%;
    max-width: 34rem;
    position: absolute;
    padding: 0.3rem 0.3rem 0 0;
    animation: slide-up 0.6s 1;
    border-top: 0.1rem solid #ccc;
    border-left: 0.1rem solid #ccc;
    border-top-right-radius: 1.9rem;
  }

  .flag-pinwheel {
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    position: absolute;
    pointer-events: none;
    transition: opacity 0.6s;
    animation: rotate 3s linear infinite;
  }

  @keyframes rotate {
    100% {
      transform: rotate(1turn);
    }
  }
}

@keyframes slide-up {
  0% {
    transform: translateY(100%);
  }
}
</style>
