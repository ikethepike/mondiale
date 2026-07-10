<template>
  <div class="harness">
    <nav class="controls">
      <div class="group grow">
        <span class="label">Scenario</span>
        <select v-model="scenarioId" @change="deal()">
          <option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
        <button @click="deal()">Replay</button>
        <button @click="seedGuesses()">Ticker</button>
      </div>
      <p v-if="lastEvent" class="submission">{{ lastEvent }}</p>
    </nav>

    <component :is="activeComponent" v-if="ready" :key="renderKey" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Dev harness that previews any challenge/step view over the real layout map,
 * without a multiplayer session. Mirrors pages/test-recognition.vue: a mock
 * game pinned into the store + a stub socket. Built for the mobile pass —
 * open devtools responsive mode and step through every scenario.
 *
 *   /test-views
 */
import { computed, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import ViewCapitalGuess from '~/components/view/ViewCapitalGuess.vue'
import ViewFlagPalette from '~/components/view/ViewFlagPalette.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewGroupScores from '~/components/view/ViewGroupScores.vue'
import ViewHotCold from '~/components/view/ViewHotCold.vue'
import ViewIndividualChallenge from '~/components/view/ViewIndividualChallenge.vue'
import ViewNoMansLand from '~/components/view/ViewNoMansLand.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewPinLandmark from '~/components/view/ViewPinLandmark.vue'
import ViewSilhouette from '~/components/view/ViewSilhouette.vue'
import ViewSketch from '~/components/view/ViewSketch.vue'
import ViewStatDetective from '~/components/view/ViewStatDetective.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { PLAYER_COLORS } from '~~/data/palette'
import { generateTiles } from '~~/lib/tiles'
import { useGameStore } from '~~/store/game.store'
import type { Game, PlayerColor, Round } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { Component } from 'vue'

const gameStore = useGameStore()

const ME = '00000000-0000-4000-8000-000000000000'
const RIVAL = '00000000-0000-4000-8000-000000000001'
const THIRD = '00000000-0000-4000-8000-000000000002'
const MAXIMUM_POINTS = 21

const scenarioId = ref('ranking')
const ready = ref(false)
const renderKey = ref(0)
const lastEvent = ref('')

const installStubSocket = () => {
  gameStore.playerId = ME
  gameStore.socket = {
    emit: (event: string, eventData: Record<string, unknown>) => {
      lastEvent.value = `${event} ${JSON.stringify(eventData ?? {}).slice(0, 160)}`
    },
  } as never
}

const mockPlayer = (id: string, name: string, color: PlayerColor, phase: PlayerPhase): Player =>
  ({
    id,
    name,
    color,
    ready: true,
    phase,
    moves: [],
    currentPosition: 4,
  }) as unknown as Player

const mockGame = (phase: PlayerPhase, rounds: unknown[]): Game => {
  const game = {
    id: 'view-harness',
    host: ME,
    tiles: generateTiles('medium'),
    started: true,
    length: 'medium',
    difficulty: 'normal',
    variant: 'world',
    liveGuesses: true,
    rounds,
    players: {
      [ME]: mockPlayer(ME, 'Harness', PLAYER_COLORS[0]!, phase),
      [RIVAL]: mockPlayer(RIVAL, 'Rival', PLAYER_COLORS[1]!, phase),
      [THIRD]: mockPlayer(THIRD, 'Wanderer', PLAYER_COLORS[2]!, phase),
    },
  } as unknown as Game
  return game
}

/** A settled ranking round, for score/standings screens. */
const settledRound = (): Round =>
  ({
    groupChallenge: {
      _type: 'group-challenge',
      id: 'economics.gdpPerCapita',
      countriesPerPlayer: {
        [ME]: ['FR', 'BR', 'JP', 'NG', 'SE'],
        [RIVAL]: ['FR', 'BR', 'JP', 'NG', 'SE'],
        [THIRD]: ['FR', 'BR', 'JP', 'NG', 'SE'],
      },
    },
    groupAnswers: {
      [ME]: { submitted: ['SE', 'FR', 'JP', 'BR', 'NG'], correct: ['SE', 'JP', 'FR', 'BR', 'NG'] },
      [RIVAL]: {
        submitted: ['FR', 'SE', 'JP', 'NG', 'BR'],
        correct: ['SE', 'JP', 'FR', 'BR', 'NG'],
      },
      [THIRD]: {
        submitted: ['NG', 'BR', 'JP', 'SE', 'FR'],
        correct: ['SE', 'JP', 'FR', 'BR', 'NG'],
      },
    },
    playerTurns: {
      [ME]: { points: { scored: 3, maximum: 5 } },
      [RIVAL]: { points: { scored: 2, maximum: 5 } },
      [THIRD]: { points: { scored: 1, maximum: 5 } },
    },
  }) as unknown as Round

const groupRound = (groupChallenge: unknown): Round =>
  ({ groupChallenge, groupAnswers: {}, playerTurns: {} }) as unknown as Round

interface Scenario {
  id: string
  label: string
  component: Component
  build: () => Game
}

const landmark = LANDMARKS['eiffel-tower']

const scenarios: Scenario[] = [
  {
    id: 'ranking',
    label: 'Ranking (5 tiles)',
    component: ViewGroupChallenge,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'group-challenge',
          id: 'economics.gdpPerCapita',
          countriesPerPlayer: { [ME]: ['FR', 'BR', 'JP', 'NG', 'SE'] },
        }),
      ]),
  },
  {
    id: 'ranking-long',
    label: 'Ranking (7 tiles, overflow)',
    component: ViewGroupChallenge,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'group-challenge',
          id: 'people.population',
          countriesPerPlayer: { [ME]: ['FR', 'BR', 'JP', 'NG', 'SE', 'MX', 'VN'] },
        }),
      ]),
  },
  {
    id: 'group-scores',
    label: 'Group scores (reveal)',
    component: ViewGroupScores,
    build: () => mockGame('group-scores', [settledRound()]),
  },
  {
    id: 'two-truths',
    label: 'Two truths and a lie',
    component: ViewTwoTruths,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'two-truths-challenge',
          country: 'IS',
          statements: [
            { accessorId: 'people.population', amount: 372000, unit: 'people' },
            { accessorId: 'geography.highestPeak', amount: 2110, unit: 'm' },
            { accessorId: 'people.lifeExpectancy', amount: 71.2, unit: 'years' },
          ],
          lieIndex: 2,
          lieSource: 'EG',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'capital-guess',
    label: 'Capital guess (options)',
    component: ViewCapitalGuess,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'capital-guess-challenge',
          country: 'FR',
          image: '/capitals/FR.webp',
          options: ['FR', 'BE', 'AT', 'CZ'],
          maximumGuesses: 2,
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'capital-guess-hard',
    label: 'Capital guess (typed, keyboard)',
    component: ViewCapitalGuess,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'capital-guess-challenge',
          country: 'JP',
          image: '/capitals/JP.webp',
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'stat-detective',
    label: 'Stat detective (clue cards)',
    component: ViewStatDetective,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'stat-detective-challenge',
          country: 'BR',
          clues: [
            'people.population',
            'geography.area.total',
            'economics.gdpPerCapita',
            'environment.CO2Emissions',
          ],
          secondsPerClue: 4,
          region: 'South America',
          photo: '/capitals/BR.webp',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'pin-landmark',
    label: 'Pin the landmark (photo dock)',
    component: ViewPinLandmark,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'pin-landmark-challenge',
          slug: 'eiffel-tower',
          image: landmark?.image ?? '/landmarks/eiffel-tower.webp',
          perfectDistanceKm: 150,
          zeroDistanceKm: 3000,
          durationSeconds: 60,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'no-mans-land',
    label: "No man's land (magnifier)",
    component: ViewNoMansLand,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'no-mans-land-challenge',
          territoryId: 'hans-island',
          claimants: ['DK', 'CA'],
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'hot-cold',
    label: 'Hot & cold (probe trail)',
    component: ViewHotCold,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'hot-cold-challenge',
          country: 'MN',
          maximumGuesses: 12,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'flag-palette',
    label: 'Flag palette (swatches)',
    component: ViewFlagPalette,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flag-palette-challenge',
          country: 'ZA',
          swatches: COUNTRIES.ZA.identity.colors.slice(0, 6),
          durationSeconds: 45,
          region: 'Africa',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'silhouette',
    label: 'Silhouette (typed)',
    component: ViewSilhouette,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'silhouette-challenge',
          country: 'IT',
          durationSeconds: 45,
          region: 'Europe',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'sketch',
    label: 'Sketch (canvas)',
    component: ViewSketch,
    build: () =>
      mockGame('group-challenge', [
        groupRound({ _type: 'sketch-challenge', country: 'FR', maximumPoints: MAXIMUM_POINTS }),
      ]),
  },
  {
    id: 'individual-flag-pick',
    label: 'Individual: flag pick',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'flag-pick', options: ['NL', 'LU', 'FR', 'RU'] }),
  },
  {
    id: 'individual-zoom-out',
    label: 'Individual: zoom-out (typed)',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'zoom-out', country: 'MY' }),
  },
  {
    id: 'individual-zoom-out-small',
    label: 'Individual: zoom-out (small country)',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'zoom-out', country: 'GM' }),
  },
  {
    id: 'individual-border-detective',
    label: 'Individual: border detective (timed, hint)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'border-detective',
        country: 'HU',
        neighbours: ['AT', 'SK', 'UA', 'RO', 'RS', 'HR', 'SI'],
      }),
  },
  {
    id: 'individual-outline-reveal',
    label: 'Individual: outline reveal (timed)',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'outline-reveal', country: 'ZA' }),
  },
  {
    id: 'individual-higher-lower',
    label: 'Individual: higher/lower duel',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'higher-lower',
        higherLower: {
          accessorId: 'people.population',
          pairs: [
            { a: 'NG', b: 'SE' },
            { a: 'JP', b: 'AU' },
            { a: 'BR', b: 'CA' },
          ],
        },
      }),
  },
  {
    id: 'individual-leader-pick',
    label: 'Individual: leader pick',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'leader-pick', options: ['DE', 'FR', 'IT', 'ES'] }),
  },
  {
    id: 'individual-landmark-quiz',
    label: 'Individual: landmark quiz (photo)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'landmark-quiz',
        options: ['FR', 'IT', 'ES', 'GB'],
        image: landmark?.image ?? '/landmarks/eiffel-tower.webp',
        landmark: { name: 'Eiffel Tower', city: 'Paris' },
      }),
  },
  {
    id: 'lobby',
    label: 'Lobby (waiting room, solo)',
    component: ViewPlayerConfiguration,
    build: () => {
      const game = mockGame('waiting-for-game', [])
      game.started = false
      // The lonely single-player lobby, where the config card is tallest.
      game.players = { [ME]: game.players[ME]! }
      return game
    },
  },
  {
    id: 'tutorial',
    label: 'Tutorial',
    component: ViewTutorial,
    build: () => mockGame('tutorial', [settledRound()]),
  },
  {
    id: 'victory',
    label: 'Victory (report)',
    component: ViewVictory,
    build: () => {
      const game = mockGame('victory', [settledRound(), settledRound(), settledRound()])
      game.players[ME]!.completedAtRound = 3
      return game
    },
  },
]

/** Individual gates read the challenge off the player's pending move. */
const individualGame = (challenge: Record<string, unknown>): Game => {
  const game = mockGame('individual-challenge', [settledRound()])
  const me = game.players[ME]!
  me.moves = [
    {
      endTile: game.tiles[6]!,
      challenge: {
        _type: 'individual-challenge',
        id: 'flag',
        country: 'FR',
        ...challenge,
      },
    },
  ] as never
  return game
}

const activeComponent = computed(
  () => scenarios.find(s => s.id === scenarioId.value)?.component ?? ViewGroupChallenge
)

const deal = () => {
  const scenario = scenarios.find(s => s.id === scenarioId.value)
  if (!scenario) return
  lastEvent.value = ''
  gameStore.game = scenario.build()
  renderKey.value += 1
  ready.value = true
}

/** Push a few opponent guesses so ticker chrome can be previewed. */
const seedGuesses = () => {
  const now = Date.now()
  gameStore.map.liveGuesses.push(
    { entryId: uuidv4(), playerId: RIVAL, kind: 'wrong', isoCode: 'DE', at: now },
    { entryId: uuidv4(), playerId: THIRD, kind: 'correct', isoCode: 'PT', at: now },
    { entryId: uuidv4(), playerId: RIVAL, kind: 'presence', at: now }
  )
}

onMounted(() => {
  installStubSocket()
  deal()
})
</script>

<style lang="scss" scoped>
/** Mirrors `.main-board` in pages/room/[roomId].vue — see test-recognition. */
.harness {
  height: var(--viewport-height);
  overflow: hidden;
  position: relative;
  max-width: 100%;
  pointer-events: none;
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
  color: #fff;
  max-width: calc(100vw - 1rem);
}

.group {
  gap: 0.4rem;
  display: flex;
  align-items: center;
  min-width: 0;
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
  min-width: 0;
}

select {
  max-width: 46vw;
}

.submission {
  margin: 0;
  opacity: 0.85;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 30vw;
}
</style>
