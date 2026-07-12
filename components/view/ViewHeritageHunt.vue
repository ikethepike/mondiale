<template>
  <div v-if="challenge && site" class="heritage-hunt">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Heritage Hunt`"
      title="Pin the World Heritage Sites"
      :stakes="`${challenge.slugs.length} sites, one pin each. The closer you land, the more you score — and the sharpest pin of each photo takes a bonus off the table.`"
      @done="begin()"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">
          {{ headline }}
        </h1>
        <span class="map-caption sub beat-line">
          <span>Photo {{ state!.beat + 1 }} of {{ challenge.slugs.length }}</span>
          <span
            v-if="!state!.revealing && !state!.finished"
            class="clock"
            :class="{ urgent: secondsOnClock <= 5 }"
          >
            {{ secondsOnClock }}s
          </span>
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <Transition name="dossier">
      <article v-if="state!.revealing || state!.finished" class="pane dossier tr decorator-bottom">
        <div class="pane-content">
          <HeritageReveal :site="site" />
          <ol class="standings">
            <li
              v-for="(row, index) in beatStandings"
              :key="row.playerId"
              :class="{ best: index === 0 && beatStandings.length > 1 }"
            >
              <PlayerPawn class="pawn" :player="gameStore.game?.players[row.playerId]" />
              <span class="name">{{ row.name }}</span>
              <span v-if="index === 0 && beatStandings.length > 1" class="crown">nails it</span>
              <span class="distance">{{ row.distance }}</span>
            </li>
          </ol>
        </div>
      </article>
    </Transition>

    <aside v-if="showPhoto && !isPhone" class="photo-stage">
      <ZoomableImage :src="site.image" alt="A World Heritage Site, somewhere on Earth" />
    </aside>
    <MediaDock
      v-if="showPhoto && isPhone"
      v-model:expanded="photoExpanded"
      class="photo-dock"
      :src="site.image"
      alt="A World Heritage Site, somewhere on Earth"
    />

    <footer v-if="canPin">
      <ButtonFilled :disabled="!pin || locked || !started" @click="lockIn">
        {{ locked ? 'Locked in' : 'Lock in my pin' }}
      </ButtonFilled>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import MediaDock from '~/components/challenge/MediaDock.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import HeritageReveal from '~/components/feedback/HeritageReveal.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { HERITAGE } from '~~/data/heritage.gen'
import type { LatLng } from '~~/lib/geo'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { isMapClickEvent } from '~~/types/events.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  begin,
  hint,
  announce,
  entries,
  registerCleanup,
  gameStore,
  update,
} = useGroupChallenge('heritage-hunt-challenge', { solo: false })

const state = computed(() => challenge.value?.state)
const site = computed(() =>
  challenge.value ? HERITAGE[challenge.value.slugs[state.value?.beat ?? 0]] : undefined
)
const canPin = computed(() => !!state.value && !state.value.revealing && !state.value.finished)
const showPhoto = computed(() => canPin.value)

const isPhone = useIsPhone()
const photoExpanded = ref(true)

const pin = ref<LatLng | undefined>(undefined)
const locked = computed(
  () => !!state.value && !!state.value.pins[gameStore.playerId]?.[state.value.beat]
)

const headline = computed(() => {
  if (state.value?.finished) return 'All pins are down'
  if (state.value?.revealing) return 'The pins are in'
  return 'Where in the world is this?'
})

/** This beat's pins ranked best-first, for the reveal card. */
const beatStandings = computed(() => {
  const current = state.value
  if (!current) return []
  return current.order
    .map(playerId => {
      const entry = current.pins[playerId]?.[current.beat]
      return {
        playerId,
        name:
          playerId === gameStore.playerId
            ? 'You'
            : gameStore.game?.players[playerId]?.name || 'Anonymous',
        distanceKm: entry?.distanceKm,
        distance:
          entry?.distanceKm !== undefined
            ? `${Math.round(entry.distanceKm).toLocaleString()} km`
            : 'no pin',
      }
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
})

// --- Beat clock (server-owned deadline) --------------------------------------
const secondsOnClock = ref(0)
const clock = setInterval(() => {
  const deadline = state.value?.deadline ?? 0
  secondsOnClock.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}, 200)
onBeforeUnmount(() => clearInterval(clock))

// --- Pinning ------------------------------------------------------------------
const lockIn = () => {
  const current = state.value
  if (!current || !pin.value || locked.value || !canPin.value) return
  update({ event: 'submit-heritage-pin', beat: current.beat, pin: pin.value })
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || !started.value || locked.value || !canPin.value) return
  const latLng = event.detail.latLng
  if (!latLng) return

  const first = !pin.value
  pin.value = latLng
  gameStore.map.pin = latLng
  if (first) {
    announce({ kind: 'presence' })
    photoExpanded.value = false
  }
}
onMounted(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))

// A new beat: fresh pin, fresh photo, clean map.
watch(
  () => state.value?.beat,
  () => {
    pin.value = undefined
    photoExpanded.value = true
    gameStore.map.pin = undefined
    gameStore.map.pinAnswer = undefined
  }
)

// The reveal: the truth appears, the dashed line measures the local miss.
// Immediate, so arriving mid-reveal (reconnect, harness) still shows it.
watch(
  () => state.value?.revealing || state.value?.finished,
  revealed => {
    if (revealed && site.value) gameStore.map.pinAnswer = site.value.coordinates
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  gameStore.map.pin = undefined
  gameStore.map.pinAnswer = undefined
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.heritage-hunt {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
  justify-content: space-between;
  pointer-events: none;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
  }
  .sub,
  .hint {
    padding: 0.4rem 1.4rem;
  }
  .hint {
    color: var(--hior-ange);
  }
  .prompt {
    gap: 1rem;
    display: flex;
    position: relative;
    align-items: center;
    flex-flow: column nowrap;
  }
  .prompt .hint {
    top: 100%;
    left: 0;
    right: 0;
    z-index: 3;
    width: max-content;
    max-width: 100%;
    position: absolute;
    margin: 0.4rem auto 0;
  }
}

.beat-line {
  gap: 0.8rem;
  display: inline-flex;
  align-items: center;

  .clock {
    font-weight: bold;
    font-variant-numeric: tabular-nums;

    &.urgent {
      color: var(--hior-ange);
    }
  }
}

.photo-stage {
  top: 50%;
  left: 3rem;
  z-index: 2;
  position: absolute;
  transform: translateY(-50%);
  pointer-events: auto;
  overflow: hidden;
  border-radius: 0.6rem;
  width: clamp(18rem, 24vw, 24rem);
  height: clamp(13rem, 22vh, 18rem);
}

.dossier {
  left: 3rem;
  bottom: 3rem;
  z-index: 3;
  position: absolute;
  width: min(42rem, 92vw);

  .pane-content {
    gap: 1.2rem;
    display: flex;
    padding: 1.6rem;
    flex-flow: column nowrap;
  }
}

.dossier-enter-active {
  transition: all var(--motion-slow) var(--ease-out-expressive);
}
.dossier-enter-from {
  opacity: 0;
  transform: translateY(1.5rem);
}

.standings {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;

  li {
    gap: 0.8rem;
    display: flex;
    align-items: center;
    font-size: 1.25rem;

    &.best .name {
      font-weight: bold;
    }
  }

  .pawn {
    width: 1.2rem;
    height: 1.85rem;
    flex: none;
  }

  .crown {
    color: var(--hior-ange);
    font-weight: bold;
  }

  .distance {
    opacity: 0.75;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  align-items: center;
  flex-direction: column;
  pointer-events: auto;
}

@media (max-width: 900px) {
  .photo-stage {
    top: auto;
    left: 50%;
    bottom: 12rem;
    transform: translateX(-50%);
    width: min(80vw, 24rem);
    height: min(22vh, 18rem);
  }

  .dossier {
    left: 0;
    right: 0;
    bottom: 2rem;
    margin: 0 auto;
    width: min(92vw, 42rem);
    max-width: none;
    transform: none;
  }
}

@media (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }

  .photo-dock {
    left: 1.2rem;
    z-index: 2;
    position: absolute;
    bottom: calc(12rem + var(--safe-bottom));
  }

  footer {
    width: 100%;
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));

    :deep(.button) {
      width: 100%;
    }
  }

  .dossier .pane-content {
    max-height: min(46rem, 55dvh);
    overflow-y: auto;
  }
}
</style>
