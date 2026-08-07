<template>
  <div v-if="challenge" class="pin-landmark challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Drop a Pin`"
      title="Where in the world is this?"
      stakes="Click the map to place your pin, then lock it in. The closer you land, the more you score — no country names, just the spot."
      @done="begin()"
    />

    <ChallengePrompt
      :hint="hint"
      :attributions="result ? undefined : photoSources"
      attribution-label="Photo"
    >
      <h1 v-if="!result" class="map-caption">Where in the world is this?</h1>
      <!-- The graded line stays the head, all four shades of it — the stamp only
           splits it into a hit or a miss. The landmark dossier keeps its own
           corner pane: it is a docked panel with its own transition, not a
           caption-sized fact, so only the distance rides the card's body. -->
      <ChallengeResult
        v-else
        :status="resolvedCorrectly ? 'correct' : 'incorrect'"
        :correct-message="verdict"
        :incorrect-message="verdict"
      >
        {{ formatKm(result.distanceKm) }} from the mark
      </ChallengeResult>
      <span v-if="!result && pin" class="map-caption sub pinned">{{ formatLatLng(pin) }}</span>
      <span v-else-if="!result" class="map-caption sub">Click the map to drop your pin</span>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <Transition name="dossier">
      <article v-if="landmark && result" class="pane dossier tr">
        <div class="pane-content">
          <LandmarkReveal :landmark="landmark" />
        </div>
      </article>
    </Transition>

    <aside v-if="!result && !isPhone" class="side-stage side-photo">
      <ZoomableImage :src="challenge.image" alt="A landmark, somewhere on Earth" />
    </aside>
    <MediaDock
      v-if="!result && isPhone"
      v-model:expanded="photoExpanded"
      class="photo-dock"
      :src="challenge.image"
      alt="A landmark, somewhere on Earth"
      :attributions="photoSources"
    />

    <footer v-if="!result">
      <div class="lock-row">
        <ButtonFilled :disabled="!pin || submitted || !started" @click="lockIn">
          {{ submitted ? 'Locked in' : 'Lock in my pin' }}
        </ButtonFilled>
        <ChallengeTimerRadial
          class="lock-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import MediaDock from '~/components/challenge/MediaDock.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import LandmarkReveal from '~/components/feedback/LandmarkReveal.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { formatLatLng, haversineKm } from '~~/lib/geo'
import { formatKm } from '~~/lib/number'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { usePinDrop } from '~~/lib/use-pin-drop'
import { useIsPhone } from '~~/lib/use-viewport'

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
  stopCountdown,
  gameStore,
  update,
  clearBoard,
} = useGroupChallenge('pin-landmark-challenge', { solo: false })

const result = ref<{ distanceKm: number } | undefined>(undefined)

// Phones swap the side-docked photo for the collapsible MediaDock: study the
// photo first, then it docks out of the map's way once the first pin lands
// (the pin/photo choreography is usePinDrop's).
const isPhone = useIsPhone()
const { pin, photoExpanded } = usePinDrop({
  canDrop: () => !showInterstitial.value && !submitted.value && started.value,
  announce,
  registerCleanup,
})

const landmark = computed(() => (challenge.value ? LANDMARKS[challenge.value.slug] : undefined))

const photoSources = datasetAttribution('landmarks')

const verdict = computed(() => {
  const active = challenge.value
  if (!result.value || !active) return ''
  const { distanceKm } = result.value
  if (distanceKm <= active.perfectDistanceKm) return 'Dead on.'
  if (distanceKm <= active.perfectDistanceKm * 4) return 'Close.'
  if (distanceKm >= active.zeroDistanceKm) return 'Wrong part of the world.'
  return 'Not quite.'
})

/**
 * A pin drop is graded on a curve, but a stamp is binary — so the win band is
 * the two verdicts that read as one ("Dead on." and "Close."), which is the same
 * `perfectDistanceKm * 4` boundary the copy above already turns on. The head
 * keeps all four shades; only the stamp collapses them.
 */
const resolvedCorrectly = computed(() => {
  const active = challenge.value
  if (!result.value || !active) return false
  return result.value.distanceKm <= active.perfectDistanceKm * 4
})

/**
 * Resolution beat, as in the silhouette view: the true point lands on the map
 * and the dossier opens, then the scorecard follows after the hold — enough
 * time to read the miss distance and where the landmark actually is.
 */
const REVEAL_HOLD_MS = 6000
let submitTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => submitTimer && clearTimeout(submitTimer))

const lockIn = () => {
  const active = challenge.value
  if (!active || !pin.value || submitted.value) return
  submitted.value = true
  stopCountdown()

  const answer = LANDMARKS[active.slug]?.coordinates
  if (answer) {
    gameStore.map.pinAnswer = answer
    result.value = { distanceKm: haversineKm(pin.value, answer) }
  }

  const pinned = pin.value
  submitTimer = setTimeout(
    () => update({ event: 'submit-group-challenge-answers', ranking: [], pin: pinned }),
    REVEAL_HOLD_MS
  )
}

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

// The map is the answer surface, so the photo lives off to one side —
// placement, frame and hover swell all come from templates/_side-stage.scss.

.dossier {
  left: 3rem;
  bottom: 3rem;
  z-index: 3;
  position: absolute;
  width: min(40rem, 92vw);

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

@media (max-width: $tablet-wide) {
  // Inset centring, not translateX(-50%): the dossier's enter transition
  // animates `transform`, and the two fought — the card ended up half a width
  // off-screen. Explicit width also stops absolute shrink-to-fit narrowing it.
  .dossier {
    left: 0;
    right: 0;
    bottom: 2rem;
    margin: 0 auto;
    width: min(92vw, 40rem);
    max-width: none;
    transform: none;
  }
}

footer {
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
  .photo-dock {
    left: 1.2rem;
    z-index: 2;
    position: absolute;
    bottom: calc(12rem + var(--safe-bottom));
  }

  .lock-row {
    width: 100%;

    :deep(.button) {
      flex: 1;
      min-width: 0;
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
