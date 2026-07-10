<template>
  <div v-if="challenge" class="pin-landmark">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Drop a Pin`"
      title="Where in the world is this?"
      stakes="Click the map to place your pin, then lock it in. The closer you land, the more you score — no country names, just the spot."
      @done="begin()"
    />

    <header>
      <div class="prompt">
        <h1 v-if="!result" class="map-caption">Where in the world is this?</h1>
        <h1 v-else class="map-caption">{{ verdict }}</h1>
        <span v-if="result" class="map-caption sub">
          {{ Math.round(result.distanceKm).toLocaleString() }} km from the mark
        </span>
        <span v-else-if="pin" class="map-caption sub pinned">{{ formatLatLng(pin) }}</span>
        <span v-else class="map-caption sub">Click the map to drop your pin</span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <Transition name="dossier">
      <article v-if="landmark && result" class="pane dossier tr">
        <div class="pane-content">
          <div class="dossier-head">
            <img class="dossier-photo" :src="landmark.image" :alt="landmark.name" />
            <div class="dossier-copy">
              <strong>{{ landmark.name }}</strong>
              <span
                >{{ landmark.city ? `${landmark.city}, ` : ''
                }}{{ countryName(landmark.country) }}</span
              >
              <span class="dossier-kind">{{ KIND_COPY[landmark.kind] }}</span>
            </div>
          </div>
          <p v-if="landmark.description" class="dossier-description">
            {{ landmark.description }}
          </p>
        </div>
      </article>
    </Transition>

    <aside v-if="!result && !isPhone" class="photo-stage">
      <ZoomableImage :src="challenge.image" alt="A landmark, somewhere on Earth" />
    </aside>
    <MediaDock
      v-if="!result && isPhone"
      v-model:expanded="photoExpanded"
      class="photo-dock"
      :src="challenge.image"
      alt="A landmark, somewhere on Earth"
    />

    <footer v-if="!result">
      <ChallengeTimer :value="secondsLeft" :total="challenge.durationSeconds" />

      <ButtonFilled :disabled="!pin || submitted || !started" @click="lockIn">
        {{ submitted ? 'Locked in' : 'Lock in my pin' }}
      </ButtonFilled>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import MediaDock from '~/components/challenge/MediaDock.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { LANDMARKS } from '~~/data/landmarks.gen'
import type { LandmarkKind } from '~~/generators/data/landmark-seeds'
import { countryName } from '~~/lib/country'
import { haversineKm, type LatLng } from '~~/lib/geo'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { isMapClickEvent } from '~~/types/events.types'

const KIND_COPY: { [kind in LandmarkKind]: string } = {
  natural: 'A natural wonder',
  religious: 'A place of worship',
  ancient: 'An ancient site',
  monument: 'A built monument',
  urban: 'A city landmark',
}

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  hint,
  announce,
  entries,
  registerCleanup,
  gameStore,
  update,
  clearBoard,
} = useGroupChallenge('pin-landmark-challenge', { solo: false })

const pin = ref<LatLng | undefined>(undefined)
const result = ref<{ distanceKm: number } | undefined>(undefined)

// Phones swap the side-docked photo for the collapsible MediaDock: study the
// photo first, then it docks out of the map's way once the first pin lands.
const isPhone = useIsPhone()
const photoExpanded = ref(true)

const landmark = computed(() => (challenge.value ? LANDMARKS[challenge.value.slug] : undefined))

const verdict = computed(() => {
  const active = challenge.value
  if (!result.value || !active) return ''
  const { distanceKm } = result.value
  if (distanceKm <= active.perfectDistanceKm) return 'Dead on.'
  if (distanceKm <= active.perfectDistanceKm * 4) return 'Close.'
  if (distanceKm >= active.zeroDistanceKm) return 'Wrong part of the world.'
  return 'Not quite.'
})

const formatLatLng = ({ lat, lng }: LatLng) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`

const lockIn = () => {
  const active = challenge.value
  if (!active || !pin.value || submitted.value) return

  update({ event: 'submit-group-challenge-answers', ranking: [], pin: pin.value })

  const answer = LANDMARKS[active.slug]?.coordinates
  if (!answer) return
  gameStore.map.pinAnswer = answer
  result.value = { distanceKm: haversineKm(pin.value, answer) }
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || submitted.value || !started.value) return

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

watch(secondsLeft, seconds => {
  if (seconds > 0 || submitted.value) return
  if (pin.value) lockIn()
})

onBeforeUnmount(() => {
  gameStore.map.pin = undefined
  gameStore.map.pinAnswer = undefined
  clearBoard()
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.pin-landmark {
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
    align-items: center;
    flex-flow: column nowrap;
  }
}

// The map is the answer surface, so the photo lives off to one side.
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
  max-width: 34rem;

  .pane-content {
    gap: 1.2rem;
    display: flex;
    padding: 1.6rem;
    flex-flow: column nowrap;
  }
}

.dossier-head {
  gap: 1.6rem;
  display: flex;
  align-items: center;
}

.dossier-description {
  margin: 0;
  text-align: left;
  text-wrap: pretty;
}

.dossier-photo {
  width: 8rem;
  height: 8rem;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 0.4rem;
}

.dossier-copy {
  gap: 0.3rem;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;

  strong {
    font-size: 1.8rem;
  }
}

.dossier-kind {
  color: var(--soft-blue);
}

.dossier-enter-active {
  transition: all var(--motion-slow) var(--ease-out-expressive);
}
.dossier-enter-from {
  opacity: 0;
  transform: translateY(1.5rem);
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
    left: 50%;
    bottom: 2rem;
    max-width: min(90vw, 34rem);
    transform: translateX(-50%);
  }
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  pointer-events: auto;
}

.pinned {
  font-variant-numeric: tabular-nums;
}

// Phones use the MediaDock (study-then-dock) instead of the pinned photo
// stage; the collapsed thumbnail parks bottom-left, clear of the footer.
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

  .dossier {
    .pane-content {
      max-height: min(46rem, 55dvh);
      overflow-y: auto;
    }
  }
}
</style>
