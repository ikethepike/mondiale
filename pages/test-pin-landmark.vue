<template>
  <div class="harness">
    <nav class="controls">
      <div class="group grow">
        <span class="label">Landmark</span>
        <select v-model="slug" @change="deal()">
          <option v-for="entry in pool" :key="entry.slug" :value="entry.slug">
            {{ entry.name }} — {{ entry.country }} ({{ entry.kind }})
          </option>
        </select>
        <button @click="deal(randomSlug())">Random</button>
        <button @click="deal()">Replay</button>
      </div>

      <div class="group">
        <span class="label">Falloff</span>
        <label>perfect <input v-model.number="perfectKm" type="number" min="0" step="25" /></label>
        <label>zero <input v-model.number="zeroKm" type="number" min="100" step="100" /></label>
      </div>

      <div class="group">
        <button :class="{ active: showTruth }" @click="showTruth = !showTruth">
          {{ showTruth ? 'Hide' : 'Reveal' }} answer
        </button>
      </div>

      <p v-if="truthPoint && showTruth" class="truth">
        {{ truthPoint.name }} is at {{ format(truthPoint.coordinates) }}
      </p>

      <p v-if="lastSubmission" class="submission">
        pinned {{ format(lastSubmission.pin) }} —
        <strong>{{ Math.round(lastSubmission.distanceKm).toLocaleString() }} km</strong>
        off, scored <strong>{{ lastSubmission.scored }}</strong> / {{ lastSubmission.maximum }}
      </p>
      <p v-else-if="ready" class="submission muted">click the map, then lock in your pin</p>
    </nav>

    <component :is="ViewPinLandmark" v-if="ready" :key="renderKey" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Dev harness for the pin-landmark round. Mirrors pages/test-recognition.vue:
 * a mock game and a stub socket, so the View can be driven without a
 * multiplayer session, a server, or Redis.
 *
 * The map itself comes from layouts/default.vue, which binds to gameStore.map
 * — so the dropped pin renders exactly as it does in a real room.
 *
 * The stub runs submissions through the REAL scorePinLandmark, so the distance
 * maths and falloff curve exercised here are the ones the server would use.
 * The falloff inputs let you sanity-check the curve without editing the dealer.
 *
 *   /test-pin-landmark
 */
import { computed, ref } from 'vue'
import ViewPinLandmark from '~/components/view/ViewPinLandmark.vue'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { scorePinLandmark } from '~~/lib/challenges'
import { generateTiles } from '~~/lib/tiles'
import type { LatLng } from '~~/lib/geo'
import { useGameStore } from '~~/store/game.store'
import type { PinLandmarkChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'

const gameStore = useGameStore()

const slug = ref('eiffel-tower')
const perfectKm = ref(150)
const zeroKm = ref(3000)
const showTruth = ref(false)
const ready = ref(false)
const renderKey = ref(0)
const lastSubmission = ref<{
  pin: LatLng
  distanceKm: number
  scored: number
  maximum: number
}>()

/** Only landmarks the dealer would actually pick: coordinates or nothing. */
const pool = computed(() =>
  Object.entries(LANDMARKS)
    .filter(([, landmark]) => landmark.coordinates)
    .map(([entrySlug, landmark]) => ({ slug: entrySlug, ...landmark }))
    .sort((a, b) => a.name.localeCompare(b.name))
)

/** Narrowed so the template can read `.coordinates` without a guard. */
const truthPoint = computed(() => {
  const landmark = LANDMARKS[slug.value]
  if (!landmark?.coordinates) return undefined
  return { name: landmark.name, coordinates: landmark.coordinates }
})

const format = ({ lat, lng }: LatLng) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`

const randomSlug = () => pool.value[Math.floor(Math.random() * pool.value.length)]?.slug

const MAXIMUM_POINTS = 21
/** A uuid: isValidClientEventTarget rejects anything else, and the store's
 *  `player` getter indexes game.players by it. */
const HARNESS_PLAYER_ID = '00000000-0000-4000-8000-000000000000'

/**
 * The View submits through useClientEvents().update(), which throws without a
 * socket and without a uuid playerId. Stub both, then run the submission
 * through the real scorer so the harness exercises the true maths.
 *
 * `update()` calls socket.emit(event, eventData, eventTarget) positionally.
 */
const installStubSocket = () => {
  gameStore.playerId = HARNESS_PLAYER_ID
  gameStore.socket = {
    emit: (event: string, eventData: Record<string, unknown>) => {
      if (event !== 'submit-group-challenge-answers') return
      const pin = eventData.pin as LatLng | undefined
      if (!pin) return

      const challenge = gameStore.game?.rounds.at(-1)?.groupChallenge as PinLandmarkChallenge
      const scoring = scorePinLandmark({ challenge, pin })

      lastSubmission.value = {
        pin,
        distanceKm: scoring.distanceKm ?? Number.NaN,
        scored: scoring.scored,
        maximum: scoring.maximum,
      }
      // Reveal on submit — the point of the harness is seeing the miss.
      showTruth.value = true
    },
  } as never
}

const mockGame = (groupChallenge: unknown): Game =>
  ({
    id: 'pin-landmark-harness',
    host: HARNESS_PLAYER_ID,
    tiles: generateTiles('medium'),
    started: true,
    length: 'medium',
    difficulty: 'hard',
    variant: 'world',
    rounds: [{ groupChallenge, playerTurns: {} }],
    players: {
      // Keyed by playerId: the store's `player` getter looks it up here, and
      // the layout reads player.moves on every render.
      [HARNESS_PLAYER_ID]: {
        id: HARNESS_PLAYER_ID,
        name: 'Harness',
        color: 'red',
        ready: true,
        phase: 'group-challenge',
        moves: [],
        currentPosition: 0,
      },
    },
  }) as unknown as Game

const deal = (next: string = slug.value) => {
  slug.value = next
  const landmark = LANDMARKS[next]
  if (!landmark?.coordinates) return

  const challenge: PinLandmarkChallenge = {
    _type: 'pin-landmark-challenge',
    slug: next,
    image: landmark.image,
    perfectDistanceKm: perfectKm.value,
    zeroDistanceKm: zeroKm.value,
    durationSeconds: 40,
    maximumPoints: MAXIMUM_POINTS,
  }

  lastSubmission.value = undefined
  showTruth.value = false
  gameStore.map.pin = undefined
  gameStore.game = mockGame(challenge)
  // Remount the View so its interstitial and countdown restart.
  renderKey.value += 1
  ready.value = true
}

onMounted(() => {
  installStubSocket()
  deal('eiffel-tower')
})
</script>

<style lang="scss" scoped>
/**
 * Mirrors `.main-board` in pages/room/[roomId].vue exactly. The View positions
 * itself absolutely against this box, and `pointer-events: none` lets map
 * clicks through to the layout's GameMap underneath — without it the wrapper
 * swallows every click, and no pin can ever be dropped.
 */
.harness {
  height: var(--viewport-height);
  overflow: hidden;
  position: relative;
  max-width: 100%;
  pointer-events: none;

  // Clear the fixed control bar so the photo and prompt aren't tucked under it.
  :deep(header) {
    padding-top: 3.5rem;
  }
}

.controls {
  position: fixed;
  inset: 0 0 auto;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0.75rem;
  background: hsl(0deg 0% 8% / 92%);
  color: hsl(0deg 0% 92%);
  font-size: 0.78rem;
  pointer-events: auto;
  flex-wrap: wrap;
}

.group {
  display: flex;
  align-items: center;
  gap: 0.4rem;

  &.grow {
    flex: 1;
    min-width: 18rem;
  }
}

.label {
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.66rem;
}

select {
  flex: 1;
  min-width: 0;
}

input[type='number'] {
  width: 5rem;
}

label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  opacity: 0.8;
}

button {
  cursor: pointer;
  border-radius: 0.25rem;
  border: 1px solid hsl(0deg 0% 100% / 25%);
  background: transparent;
  color: inherit;
  padding: 0.2rem 0.55rem;

  &.active {
    background: hsl(0deg 0% 100% / 18%);
  }
}

.truth {
  margin: 0;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.submission {
  margin: 0;
  font-variant-numeric: tabular-nums;

  &.muted {
    opacity: 0.5;
  }
}
</style>
