<template>
  <div class="layout" :class="[`phase-${player?.phase}`]">
    <header v-if="diagnostics" id="diagnostic-bar">
      <div>
        <h3>Player</h3>
        <p>{{ player?.phase }}</p>
      </div>
      <div class="round">
        <h3>Round</h3>
        <p>{{ currentRound?.round }}</p>
      </div>
    </header>

    <!-- Mounted once here, above the view swap: the WebGL draw-in takes ~1s, and
         remounting it per view would restart the sweep mid-transition. -->
    <ContourBackdropGl v-if="showContours" class="contour-backdrop" />

    <LazyGameMap
      class="game-map"
      :highlighted="highlighted"
      :highlight-country="reveal"
      :status="status"
      :solo="gameStore.map.solo"
      :labels="gameStore.map.labels"
      :focus-countries="gameStore.map.focus"
      :focus-context="gameStore.map.focusContext"
      :tints="gameStore.map.tints"
      :feature="gameStore.map.feature"
      :inset="gameStore.map.inset"
      :country-groupings="
        currentFinalChallenge?._type === 'region-challenge' && !reveal
          ? Object.values(COLOR_CODED_REGIONS)
          : gameStore.map.countryGroupings
      "
    />
    <slot />

    <PlayerStatusPanel
      v-if="showStatusPanel"
      :players="allPlayers"
      :current-player-id="gameStore.playerId"
    />

    <div v-if="revealCountry && !gameStore.map.atlasMode" class="reveal-wrapper">
      <CountryPinwheel :country="revealCountry" class="flag-pinwheel" />
      <article class="pane tr decorator-bottom" :class="[gameStore.map.status]">
        <div class="pane-content">
          <CountryFlag class="flag" :country="revealCountry" />
          <small>{{ primaryCoordinates(revealCountry) }}</small>
          <h3>{{ countryName(revealCountry) }}</h3>
          <p>{{ revealCountry.geography.capital.name }}</p>
          <small class="reveal-facts">
            {{ REGION_LABELS[revealCountry.region] }}
            <template v-if="revealPopulation"> · {{ revealPopulation }}</template>
          </small>
          <!-- The stat the question was actually about — the number is the lesson -->
          <p v-if="gameStore.map.revealStat" class="reveal-stat">
            <span class="stat-label">{{ gameStore.map.revealStat.label }}</span>
            <strong>{{ gameStore.map.revealStat.value }}</strong>
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
<script lang="ts" setup>
import ContourBackdropGl from '~/components/map/ContourBackdropGl.client.vue'
import { COLOR_CODED_REGIONS } from '~~/lib/challenges/final-challenge'
import { countryName, getCountry, primaryCoordinates } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatNumber } from '~~/lib/number'
import { REGION_LABELS } from '~~/lib/variant'
import type { ISOCountryCode } from '~~/types/geography.types'
const { player, game, currentRound, gameStore, currentFinalChallenge } = useClientEvents()

const reveal = toRef(gameStore.map, 'reveal')
const status = toRef(gameStore.map, 'status')

const revealCountry = computed(() => (reveal.value ? getCountry(reveal.value) : undefined))

const revealPopulation = computed(() => {
  const population = revealCountry.value?.people?.population
  if (!population) return undefined
  return `${formatNumber(population.amount)} people`
})

const highlighted = computed<ISOCountryCode[]>(() => {
  const output = [...gameStore.map.highlighted]

  if (!game.value) return output
  if (!player.value) return output
  if (game.value.difficulty !== 'easy') return output
  if (player.value.phase !== 'group-challenge') return output

  const countries = gameStore.currentGroupChallengeForPlayer
  if (!countries) return output
  return [...countries, ...output]
})

const allPlayers = computed(() => Object.values(game.value?.players ?? {}))

// The contour backdrop covers the pre-join wait and the lobby; the world map
// takes over once the game starts. One instance spans both so the draw-in
// sweep plays exactly once.
const CONTOUR_PHASES = ['naming', 'waiting-for-game']
const showContours = computed(
  () => !player.value?.phase || CONTOUR_PHASES.includes(player.value.phase)
)

// Show the "what's everyone doing" panel only while parked on the board
// (walking / turn done), where a player would otherwise wonder if the game
// froze while others are still busy. The scores and victory screens carry
// their own player lists, so the panel stays out of their way. Only with
// company (2+ players).
const BOARD_PHASES = ['moving', 'movement-summary']
const showStatusPanel = computed(
  () => allPlayers.value.length > 1 && !!player.value && BOARD_PHASES.includes(player.value.phase)
)

const router = useRouter()

const diagnostics = ref(false)

onMounted(() => {
  diagnostics.value = !!router.currentRoute.value.query.diagnostics
})
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

#diagnostic-bar {
  position: fixed;
  top: 0;
  left: 0;
  padding: 1rem;
  border-bottom: 1px solid #000;
  background: #fff;
  width: 100%;
  z-index: 2000;
}

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
  // The 0.25s delay matches the phase-transition leave duration, so the map
  // rescales while the incoming view enters instead of fighting the outgoing one.
  transition:
    transform var(--motion-base) var(--ease-smooth) 0.25s,
    opacity var(--motion-slow) var(--ease-smooth);

  position: absolute;
  transform: scale(0.8);
  scrollbar-width: none;
  transform-origin: center;

  &::-webkit-scrollbar {
    display: none;
  }
}

// The WebGL contour canvas is a full-cover backdrop behind the views. Its
// draw-in sweep and dim-to-ambient fade are driven inside the component
// (a shader uniform), so there's no per-frame DOM cost here.
.contour-backdrop {
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  pointer-events: none;
}

// Pre-join + lobby own the contour backdrop (see showContours). The world map
// still mounts and resolves its geometry so it's ready the instant the game
// starts — but it stays hidden until then so the two backdrops don't fight.
.phase-undefined .game-map,
.phase-naming .game-map,
.phase-waiting-for-game .game-map {
  opacity: 0;
}

.phase-group-scores .game-map,
.phase-group-challenge .game-map,
.phase-individual-challenge .game-map,
.phase-final-challenge .game-map,
.phase-victory .game-map {
  transform: scale(1);
}

.phase-group-scores .game-map {
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
}

.reveal-wrapper {
  left: 0;
  bottom: 0;
  width: 100%;
  z-index: 10;
  max-width: 34rem;
  overflow: hidden;
  position: absolute;
  padding: 0.3rem 0.3rem 0 0;
  animation: slide-up-full var(--motion-slow) var(--ease-out-expressive) 1;
  border-top: 0.1rem solid #ccc;
  border-left: 0.1rem solid #ccc;
  border-top-right-radius: 1.9rem;
  small {
    opacity: 0.7;
    display: block;
    text-align: center;
  }
  .reveal-facts {
    margin-top: 0.4rem;
  }
  .reveal-stat {
    gap: 1rem;
    display: flex;
    margin: 1.2rem 0 0;
    padding-top: 0.8rem;
    align-items: baseline;
    justify-content: space-between;
    border-top: 0.1rem dashed var(--text-color);
    .stat-label {
      opacity: 0.7;
      font-size: 1.3rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
  }
  .flag {
    margin-bottom: 2rem;
    border: 0.1rem solid var(--text-color);
  }
  .flag:deep(svg) {
    display: block;
  }
}

// Compact reveal card on phones: bottom-left like desktop, slimmed down, no
// hairline frame around the pane's own border, clear of the home indicator.
@media screen and (max-width: $tablet) {
  .reveal-wrapper {
    border: none;
    max-width: min(26rem, calc(100% - 6rem));
    font-size: 0.95em;
    padding: 0 0 var(--safe-bottom);
    .flag {
      margin-bottom: 1rem;
    }
  }

  .flag-pinwheel {
    display: none;
  }
}

@media screen and (min-width: $tablet) {
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
}
</style>
