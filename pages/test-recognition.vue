<template>
  <div class="harness">
    <nav class="controls">
      <div class="group">
        <span class="label">Mode</span>
        <button :class="{ active: mode === 'ghost-state' }" @click="setMode('ghost-state')">
          Ghost States
        </button>
        <button :class="{ active: mode === 'no-mans-land' }" @click="setMode('no-mans-land')">
          No Man's Land
        </button>
      </div>

      <div class="group grow">
        <span class="label">Territory</span>
        <select v-model="territoryId" @change="deal()">
          <option v-for="t in pool" :key="t.id" :value="t.id">
            {{ t.name }}{{ t.micro ? ' (micro)' : '' }} —
            {{ mode === 'ghost-state' ? recognitionSummary(t) : claimantSummary(t) }}
          </option>
        </select>
        <button @click="deal(randomId())">Random</button>
        <button @click="deal()">Replay</button>
      </div>

      <p v-if="lastSubmission" class="submission">
        submitted [{{ lastSubmission.ranking.join(', ') || '—' }}] → scored
        <strong>{{ lastSubmission.scored }}</strong> / {{ lastSubmission.maximum }}
      </p>
    </nav>

    <component :is="view" v-if="ready" :key="renderKey" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Dev harness for the two recognition round modes. Mirrors pages/test.vue:
 * a mock game and a stub socket, so both Views can be driven without a
 * multiplayer session, a server, or Redis.
 *
 * The map itself comes from layouts/default.vue, which binds to gameStore.map
 * — exactly as it does in a real room.
 *
 *   /test-recognition
 */
import { computed, ref } from 'vue'
import ViewGhostState from '~/components/view/ViewGhostState.vue'
import ViewNoMansLand from '~/components/view/ViewNoMansLand.vue'
import { scoreGhostState, scoreNoMansLand } from '~~/lib/challenges'
import { useGameStore } from '~~/store/game.store'
import { generateTiles } from '~~/lib/tiles'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { RecognitionTerritory } from '~~/data/recognition.gen'

const gameStore = useGameStore()
const territories = ref<Record<string, RecognitionTerritory>>({})
const mode = ref<'ghost-state' | 'no-mans-land'>('ghost-state')
const territoryId = ref('transnistria')
const ready = ref(false)
const renderKey = ref(0)
const lastSubmission = ref<{ ranking: string[]; scored: number; maximum: number }>()

const view = computed(() => (mode.value === 'ghost-state' ? ViewGhostState : ViewNoMansLand))
const pool = computed(() =>
  Object.values(territories.value)
    .filter(t => t.cast === mode.value)
    .sort((a, b) => a.name.localeCompare(b.name))
)

/** Reveal-strip preview, so the dropdown itself teaches the dataset. */
const recognitionSummary = (t: RecognitionTerritory) => {
  const yes = Object.entries(t.povs)
    .filter(([, p]) => p.recognizes)
    .map(([c]) => c)
  const apart = Object.values(t.povs).filter(p => p.assignment === 'SELF').length
  return `recognized by ${yes.length ? yes.join(',') : 'nobody'}, drawn apart by ${apart}`
}
const claimantSummary = (t: RecognitionTerritory) =>
  t.claimants.length ? `claimed by ${t.claimants.join(', ')}` : 'claimed by nobody'

const randomId = () => pool.value[Math.floor(Math.random() * pool.value.length)]?.id

const MAXIMUM_POINTS = 21
/** A uuid: isValidClientEventTarget rejects anything else, and the store's
 *  `player` getter indexes game.players by it. */
const HARNESS_PLAYER_ID = '00000000-0000-4000-8000-000000000000'

/**
 * The Views submit through useClientEvents().update(), which throws without a
 * socket and without a uuid playerId. Stub both, then run the submission
 * through the REAL scoring functions so the harness exercises the true math
 * rather than a mock of it.
 *
 * `update()` calls socket.emit(event, eventData, eventTarget) positionally.
 */
const installStubSocket = () => {
  gameStore.playerId = HARNESS_PLAYER_ID
  gameStore.socket = {
    emit: async (event: string, eventData: Record<string, unknown>) => {
      if (event !== 'submit-group-challenge-answers') return
      const ranking = (eventData.ranking ?? []) as ISOCountryCode[]
      const challenge = gameStore.game?.rounds.at(-1)?.groupChallenge as never

      const scoring =
        mode.value === 'ghost-state'
          ? await scoreGhostState({ challenge, submittedGuesses: ranking })
          : scoreNoMansLand({ challenge, submittedGuesses: ranking })

      lastSubmission.value = { ranking, ...scoring }
    },
  } as never
}

const mockGame = (groupChallenge: unknown): Game =>
  ({
    id: 'recognition-harness',
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

const deal = (id: string = territoryId.value) => {
  territoryId.value = id
  const territory = territories.value[id]
  if (!territory) return

  const challenge =
    mode.value === 'ghost-state'
      ? {
          _type: 'ghost-state-challenge',
          territoryId: territory.id,
          parent: territory.parent,
          durationSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
        }
      : {
          _type: 'no-mans-land-challenge',
          territoryId: territory.id,
          claimants: territory.claimants,
          durationSeconds: 30,
          maximumPoints: MAXIMUM_POINTS,
        }

  lastSubmission.value = undefined
  gameStore.game = mockGame(challenge)
  // Remount the View so its interstitial and countdown restart.
  renderKey.value += 1
  ready.value = true
}

const setMode = (next: 'ghost-state' | 'no-mans-land') => {
  mode.value = next
  deal(next === 'ghost-state' ? 'transnistria' : 'bir-tawil')
}

onMounted(async () => {
  const { RECOGNITION_TERRITORIES } = await import('~~/data/recognition.gen')
  territories.value = RECOGNITION_TERRITORIES
  installStubSocket()
  deal('transnistria')
})
</script>

<style lang="scss" scoped>
/**
 * Mirrors `.main-board` in pages/room/[roomId].vue exactly. The Views position
 * themselves absolutely against this box, and `pointer-events: none` lets map
 * clicks through to the layout's GameMap underneath — without it the wrapper
 * swallows every click.
 */
.harness {
  height: var(--viewport-height);
  overflow: hidden;
  position: relative;
  max-width: 100%;
  pointer-events: none;

  // Clear the fixed control bar so the flag and prompt aren't tucked under it.
  :deep(header) {
    padding-top: 3.5rem;
  }
}

.controls {
  gap: 1rem;
  top: 0.5rem;
  left: 50%;
  z-index: 50;
  display: flex;
  padding: 0.6rem 0.9rem;
  position: fixed;
  transform: translateX(-50%);
  align-items: center;
  border-radius: 10px;
  background: rgb(20 20 24 / 88%);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.group {
  gap: 0.4rem;
  display: flex;
  align-items: center;

  &.grow {
    min-width: 0;
  }
}

.label {
  opacity: 0.55;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

button,
select {
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
  background: rgb(255 255 255 / 12%);
  border-radius: 6px;

  &.active {
    background: rgb(255 255 255 / 30%);
  }
}

select {
  max-width: 42vw;
}

.submission {
  margin: 0;
  opacity: 0.85;
  font-size: 0.8rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
