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
import { computed, defineComponent, h, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import ViewBorderChain from '~/components/view/ViewBorderChain.vue'
import ViewCapitalGuess from '~/components/view/ViewCapitalGuess.vue'
import ViewFlashpoint from '~/components/view/ViewFlashpoint.vue'
import ViewFinalChallenge from '~/components/view/ViewFinalChallenge.vue'
import ViewHeritageHunt from '~/components/view/ViewHeritageHunt.vue'
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
import ViewTrendRace from '~/components/view/ViewTrendRace.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { TRENDS } from '~~/data/trends.gen'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { PLAYER_COLORS } from '~~/data/palette'
import { GAUNTLET_LIVES, getFinalChallenges } from '~~/lib/challenges/final-challenge'
import { generateTiles } from '~~/lib/tiles'
import { useGameStore } from '~~/store/game.store'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Game, GameDifficulty, PlayerColor, Round } from '~~/types/game.types'
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
  const record = (event: string, eventData: Record<string, unknown>) => {
    lastEvent.value = `${event} ${JSON.stringify(eventData ?? {}).slice(0, 160)}`
  }
  // Critical events go through timeout().emitWithAck() — stub both paths
  const stub = {
    emit: record,
    timeout: () => stub,
    emitWithAck: async (event: string, eventData: Record<string, unknown>) => {
      record(event, eventData)
      return { ok: true }
    },
  }
  gameStore.socket = stub as never
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
const heritageSlugs = Object.keys(HERITAGE)

/** Signature trajectories, one card per shape — scales, delta chips and
 *  endpoint labels in a single screen. Data straight from data/trends.gen. */
const GALLERY = [
  { isoCode: 'RW', metric: 'lifeExpectancy', note: 'Rwanda — life expectancy (the V)' },
  { isoCode: 'EE', metric: 'internetUse', note: 'Estonia — internet ramp (bounded 0–100)' },
  { isoCode: 'SE', metric: 'co2PerCapita', note: 'Sweden — CO₂ slide' },
  { isoCode: 'CN', metric: 'gdp', note: 'China — GDP take-off (4 sig. digits)' },
  { isoCode: 'HU', metric: 'politicalCorruption', note: 'Hungary — corruption (bounded, inverted)' },
  { isoCode: 'SV', metric: 'homicideRate', note: 'El Salvador — homicide collapse' },
  { isoCode: 'US', metric: 'gini', note: 'United States — inequality (0.2–0.6 scale)' },
  { isoCode: 'BD', metric: 'childMortality', note: 'Bangladesh — child mortality' },
] as const

const TrendGallery = defineComponent({
  name: 'TrendGallery',
  setup: () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;overflow:auto;pointer-events:auto;padding:6rem 2rem 2rem;' +
          'display:grid;gap:1.6rem;grid-template-columns:repeat(auto-fill,minmax(24rem,1fr));' +
          'align-content:start;background:hsl(36,100%,97%)',
      },
      GALLERY.map(({ isoCode, metric, note }) => {
        const series = TRENDS[isoCode]?.[metric]
        return h(
          'figure',
          {
            key: `${isoCode}-${metric}`,
            style:
              'margin:0;padding:1.4rem;border-radius:1.2rem;background:hsla(36,100%,99%,0.9);' +
              'border:1px solid hsla(215.7,76.4%,21.6%,0.2)',
          },
          [
            series
              ? h(TrendSparkline, { series: [...series], metric })
              : h('em', 'no series in data/trends.gen'),
            h('figcaption', { style: 'margin-top:0.6rem;font-size:1.3rem' }, note),
          ]
        )
      })
    ),
})

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
    id: 'two-truths-scaled',
    label: 'Two truths and a lie (bounded indices)',
    component: ViewTwoTruths,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'two-truths-challenge',
          country: 'DK',
          statements: [
            { accessorId: 'people.population', amount: 5900000, unit: 'people' },
            { accessorId: 'government.democracyIndex', amount: 0.31, unit: 'index' },
            { accessorId: 'government.happiness', amount: 7.6, unit: 'score' },
          ],
          lieIndex: 1,
          lieSource: 'RU',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'trend-sparkline-gallery',
    label: 'Trend sparklines (shape gallery)',
    component: TrendGallery,
    build: () => mockGame('group-scores', []),
  },
  {
    id: 'trend-race',
    label: 'Trend race (pick → reveal on click)',
    component: ViewTrendRace,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'trend-race-challenge',
          metric: 'childMortality',
          direction: 'fallen',
          options: ['KR', 'PT', 'TR', 'BD', 'PL'],
          standings: ['BD', 'KR', 'TR', 'PT', 'PL'],
          windowStartYear: 1983,
          durationSeconds: 30,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'trend-race-scaled',
    label: 'Trend race (bounded index, inverted)',
    component: ViewTrendRace,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'trend-race-challenge',
          metric: 'politicalCorruption',
          direction: 'risen',
          options: ['HU', 'RS', 'TR', 'PL', 'GR'],
          standings: ['TR', 'HU', 'RS', 'PL', 'GR'],
          windowStartYear: 1990,
          durationSeconds: 30,
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
    id: 'flashpoint',
    label: 'Flashpoint (options)',
    component: ViewFlashpoint,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flashpoint-challenge',
          country: 'CO',
          eras: [0, 1, 2, 3],
          secondsPerEra: 4,
          options: ['CO', 'PE', 'MX', 'SV'],
          maximumGuesses: 2,
          hint: 'Its defining conflict began in 1964 — an internal conflict over who governs.',
          durationSeconds: 28,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'flashpoint-hard',
    label: 'Flashpoint (typed, keyboard)',
    component: ViewFlashpoint,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flashpoint-challenge',
          country: 'UA',
          eras: [2, 3],
          secondsPerEra: 4,
          durationSeconds: 20,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'flashpoint-russia',
    label: 'Flashpoint (Russia, all four eras)',
    component: ViewFlashpoint,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flashpoint-challenge',
          country: 'RU',
          eras: [0, 1, 2, 3],
          secondsPerEra: 4,
          options: ['RU', 'UA', 'GE', 'TJ'],
          maximumGuesses: 2,
          hint: 'Its defining conflict began in 1994 — an internal conflict over territory.',
          durationSeconds: 28,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    // Where the US's wars actually land: Afghanistan's field carries the
    // dots that a "US at war" mental model expects to see.
    id: 'flashpoint-afghanistan',
    label: 'Flashpoint (Afghanistan — where US wars land)',
    component: ViewFlashpoint,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flashpoint-challenge',
          country: 'AF',
          eras: [0, 1, 2, 3],
          secondsPerEra: 4,
          options: ['AF', 'PK', 'TJ', 'IR'],
          maximumGuesses: 2,
          hint: 'Its defining conflict began in 1978 — an internal conflict over who governs.',
          durationSeconds: 28,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    // The US has 9 recorded events on home soil, ALL post-1989 (GED's whole
    // window) — GED locates fighting where it happens, so US conflicts cloud
    // OTHER countries' maps (see the Afghanistan scenario). Kept here to
    // show why the dealer's 40-point floor excludes it in real games.
    id: 'flashpoint-us',
    label: 'Flashpoint (US, below dealer floor)',
    component: ViewFlashpoint,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flashpoint-challenge',
          country: 'US',
          eras: [0, 1, 2, 3],
          secondsPerEra: 4,
          options: ['US', 'MX', 'CO', 'SV'],
          maximumGuesses: 2,
          hint: 'Its defining conflict began in 2001 — an internal conflict (internationalized) over who governs.',
          durationSeconds: 24,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'flashpoint-scores',
    label: 'Flashpoint (scorecard + conflict card)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'flashpoint-challenge',
            country: 'CO',
            eras: [0, 1, 2, 3],
            secondsPerEra: 4,
            options: ['CO', 'PE', 'MX', 'SV'],
            maximumGuesses: 2,
            durationSeconds: 28,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['CO'], correct: ['CO'] },
            [RIVAL]: { submitted: ['PE'], correct: ['CO'] },
            [THIRD]: { submitted: [], correct: ['CO'] },
          },
          playerTurns: {
            [ME]: { points: { scored: MAXIMUM_POINTS, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
      ]),
  },
  {
    id: 'ranking-years-at-war',
    label: 'Ranking (years at war, scale bar)',
    component: ViewGroupChallenge,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'group-challenge',
          id: 'government.yearsAtWar',
          countriesPerPlayer: { [ME]: ['MM', 'CO', 'SE', 'US', 'AF'] },
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
            'government.corruptionIndex',
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
          // BT: the Druk dragon — the sketch effect's hardest render test.
          // Swap the country (and swatches source) to audition other flags;
          // DK is the minimal-flag extreme.
          country: 'BT',
          swatches: COUNTRIES.BT.identity.colors.slice(0, 6),
          durationSeconds: 45,
          region: 'Asia',
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
    id: 'border-chain',
    label: 'Border chain (your turn, strait hops)',
    component: ViewBorderChain,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            // Øresund and Bering hops on one chain — the dashed-arc test.
            chains: [['DK', 'SE', 'FI', 'RU', 'US']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 4,
            deadline: Date.now() + 12000,
            named: { [RIVAL]: ['SE', 'RU'], [ME]: ['FI'], [THIRD]: ['US'] },
            strikesLeft: {},
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ]),
  },
  {
    id: 'border-chain-europe',
    label: 'Border chain (Europe board, world dimmed)',
    component: ViewBorderChain,
    build: () => {
      const game = mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            chains: [['ES', 'FR', 'DE']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 2,
            deadline: Date.now() + 12000,
            named: { [RIVAL]: ['FR'], [ME]: ['DE'] },
            strikesLeft: {},
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ])
      game.variant = 'europe'
      return game
    },
  },
  {
    id: 'border-chain-spectate',
    label: 'Border chain (eliminated, spectating)',
    component: ViewBorderChain,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            chains: [['NO', 'SE', 'FI', 'RU', 'CN', 'MN']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 2,
            turn: 6,
            deadline: Date.now() + 9000,
            named: { [RIVAL]: ['SE', 'RU'], [ME]: ['FI'], [THIRD]: ['CN', 'MN'] },
            strikesLeft: {},
            eliminated: [ME],
            outcomes: { [ME]: 'wrong' },
            missedOuts: { [ME]: ['KZ', 'KP', 'KG'] },
          },
        }),
      ]),
  },
  {
    id: 'border-chain-reveal',
    label: 'Border chain (finished, replay + reveal)',
    component: ViewBorderChain,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            chains: [
              ['DK', 'SE', 'FI', 'RU', 'US'],
              ['TR', 'GR', 'BG'],
            ],
            order: [RIVAL, ME, THIRD],
            activeIndex: 0,
            turn: 9,
            deadline: 0,
            named: { [RIVAL]: ['SE', 'RU', 'GR'], [ME]: ['FI', 'BG'], [THIRD]: ['US'] },
            strikesLeft: {},
            eliminated: [THIRD, ME],
            outcomes: { [THIRD]: 'timeout', [ME]: 'wrong', [RIVAL]: 'won' },
            missedOuts: { [THIRD]: ['NO'], [ME]: ['MK', 'RO', 'RS'] },
            trappedBy: {},
            finished: true,
          },
        }),
      ]),
  },
  {
    id: 'heritage-hunt',
    label: 'Heritage hunt (live beat)',
    component: ViewHeritageHunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'heritage-hunt-challenge',
          slugs: heritageSlugs.slice(0, 3),
          beatSeconds: 35,
          perfectDistanceKm: 150,
          zeroDistanceKm: 3000,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            beat: 0,
            deadline: Date.now() + 35000,
            order: [ME, RIVAL, THIRD],
            pins: {},
          },
        }),
      ]),
  },
  {
    id: 'heritage-hunt-reveal',
    label: 'Heritage hunt (beat reveal)',
    component: ViewHeritageHunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'heritage-hunt-challenge',
          slugs: heritageSlugs.slice(0, 3),
          beatSeconds: 35,
          perfectDistanceKm: 150,
          zeroDistanceKm: 3000,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            beat: 0,
            deadline: 0,
            order: [ME, RIVAL, THIRD],
            pins: {
              [ME]: { 0: { pin: { lat: 48.8, lng: 2.3 }, distanceKm: 320, scored: 7 } },
              [RIVAL]: { 0: { pin: { lat: 41, lng: 12 }, distanceKm: 980, scored: 4 } },
              [THIRD]: { 0: { pin: { lat: -12, lng: 18 }, distanceKm: 5200, scored: 0 } },
            },
            revealing: true,
          },
        }),
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
    id: 'individual-higher-lower-scaled',
    label: 'Individual: higher/lower duel (bounded index)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'higher-lower',
        higherLower: {
          accessorId: 'government.happiness',
          pairs: [
            { a: 'FI', b: 'AF' },
            { a: 'DK', b: 'IN' },
            { a: 'SE', b: 'JP' },
          ],
        },
      }),
  },
  {
    id: 'individual-trend-duel',
    label: 'Individual: trend duel (pow reveal on pick)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'trend-duel',
        trendDuels: [
          { metric: 'co2PerCapita', seek: 'rising', a: 'SE', b: 'IN' },
          { metric: 'homicideRate', seek: 'falling', a: 'SV', b: 'US' },
          { metric: 'politicalCorruption', seek: 'rising', a: 'HU', b: 'EE' },
          { metric: 'gini', seek: 'rising', a: 'US', b: 'FR' },
        ],
      }),
  },
  {
    id: 'individual-trajectory-match',
    label: 'Individual: trajectory match (timed, strike hint)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'trajectory-match',
        country: 'RW',
        trajectory: {
          metric: 'lifeExpectancy',
          options: ['RW', 'UG', 'TZ', 'KE', 'BI', 'ET'],
          valuesHint: false,
        },
      }),
  },
  {
    id: 'individual-trajectory-match-values',
    label: 'Individual: trajectory match (free values reveal)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'trajectory-match',
        country: 'SV',
        trajectory: {
          metric: 'homicideRate',
          options: ['SV', 'GT', 'HN', 'MX'],
          valuesHint: true,
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
        landmarkSlug: 'eiffel-tower',
      }),
  },
  {
    id: 'final-gauntlet-easy',
    label: 'Final gauntlet (easy, dealt)',
    component: ViewFinalChallenge,
    build: () => gauntletGame('easy'),
  },
  {
    id: 'final-gauntlet-normal',
    label: 'Final gauntlet (normal, dealt)',
    component: ViewFinalChallenge,
    build: () => gauntletGame('normal'),
  },
  {
    id: 'final-gauntlet-hard',
    label: 'Final gauntlet (hard, dealt)',
    component: ViewFinalChallenge,
    build: () => gauntletGame('hard'),
  },
  {
    id: 'final-membership',
    label: 'Final: membership (odd one out)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([{ _type: 'membership-challenge', organization: 'eu', exception: 'NO' }]),
  },
  {
    id: 'final-scales',
    label: 'Final: tip the scales',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'scales-challenge',
          accessorId: 'people.population',
          target: 'BR',
          maxPicks: 3,
          tolerance: 0.2,
        },
      ]),
  },
  {
    id: 'final-sunset',
    label: 'Final: sunset blitz (typed)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'sunset-blitz-challenge',
          countries: ['UA', 'RO', 'PL', 'HU', 'SK', 'AT', 'CZ', 'DE', 'CH', 'NL', 'BE', 'FR'],
          quotaRatio: 0.35,
          durationSeconds: 60,
        },
      ]),
  },
  {
    id: 'final-city-nocturne',
    label: 'Final: city nocturne (typed)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'city-nocturne-challenge',
          country: 'PL',
          cityCount: 10,
          quota: 3,
          durationSeconds: 60,
        },
      ]),
  },
  {
    id: 'final-born',
    label: 'Final: born in (independence)',
    component: ViewFinalChallenge,
    build: () => finalGame([{ _type: 'born-challenge', year: 1990, quota: 3 }]),
  },
  {
    id: 'final-made',
    label: 'Final: made in (exports)',
    component: ViewFinalChallenge,
    build: () => finalGame([{ _type: 'made-challenge', commodity: 'cocoa beans' }]),
  },
  {
    id: 'final-min-max',
    label: 'Final: min/max (stat pick)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'max-challenge',
          accessorId: 'people.population',
          country: 'CN',
          hints: ['CN', 'IN', 'US', 'ID', 'PK'],
        },
      ]),
  },
  {
    id: 'final-language',
    label: 'Final: language',
    component: ViewFinalChallenge,
    build: () => finalGame([{ _type: 'language-challenge', language: 'Portuguese' }]),
  },
  {
    id: 'final-leadership',
    label: 'Final: leadership',
    component: ViewFinalChallenge,
    build: () => finalGame([{ _type: 'leadership-challenge', country: 'FR' }]),
  },
  {
    id: 'final-region',
    label: 'Final: region',
    component: ViewFinalChallenge,
    build: () => finalGame([{ _type: 'region-challenge', country: 'KZ' }]),
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

/** The gauntlet reads its payload off the player's pending move. */
const finalGame = (
  challenges: FinalChallengeItem[],
  difficulty: GameDifficulty = 'hard'
): Game => {
  const game = mockGame('final-challenge', [settledRound()])
  game.difficulty = difficulty
  game.players[ME]!.moves = [
    {
      endTile: game.tiles[game.tiles.length - 1]!,
      challenge: {
        _type: 'final-challenge',
        difficulty,
        challenges,
        lives: GAUNTLET_LIVES[difficulty],
        totalCount: challenges.length,
        answeredCorrect: 0,
      },
    },
  ] as never
  return game
}

/** A real dealer run — same randomness as production. */
const gauntletGame = (difficulty: GameDifficulty): Game => {
  const game = finalGame([], difficulty)
  game.players[ME]!.moves[0]!.challenge = getFinalChallenges({ game })
  return game
}

/** Individual gates read the challenge off the player's pending move. */
const individualGame = (challenge: Partial<IndividualChallenge>): Game => {
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
