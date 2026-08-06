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

    <!-- ?diagnostics: the keyboard engine's live vitals for on-device runs -->
    <KeyboardLab v-if="diagnostics" />
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
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import ViewBorderChain from '~/components/view/ViewBorderChain.vue'
import ViewCapitalGuess from '~/components/view/ViewCapitalGuess.vue'
import ViewComposition from '~/components/view/ViewComposition.vue'
import ViewEmpire from '~/components/view/ViewEmpire.vue'
import ViewFlashpoint from '~/components/view/ViewFlashpoint.vue'
import ViewFinalChallenge from '~/components/view/ViewFinalChallenge.vue'
import ViewHeritageHunt from '~/components/view/ViewHeritageHunt.vue'
import ViewFlagPalette from '~/components/view/ViewFlagPalette.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewGroupScores from '~/components/view/ViewGroupScores.vue'
import ViewHotCold from '~/components/view/ViewHotCold.vue'
import ViewManhunt from '~/components/view/ViewManhunt.vue'
import ViewIndividualChallenge from '~/components/view/ViewIndividualChallenge.vue'
import ViewMotherTongue from '~/components/view/ViewMotherTongue.vue'
import ViewNameThatWater from '~/components/view/ViewNameThatWater.vue'
import ViewNeighbourBlitz from '~/components/view/ViewNeighbourBlitz.vue'
import ViewNoMansLand from '~/components/view/ViewNoMansLand.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewPinLandmark from '~/components/view/ViewPinLandmark.vue'
import ViewSilhouette from '~/components/view/ViewSilhouette.vue'
import ViewAnthemBuzz from '~/components/view/ViewAnthemBuzz.vue'
import ViewTongueBuzz from '~/components/view/ViewTongueBuzz.vue'
import ViewSketch from '~/components/view/ViewSketch.vue'
import ViewStatDetective from '~/components/view/ViewStatDetective.vue'
import ViewTimeline from '~/components/view/ViewTimeline.vue'
import ViewTraversalChallenge from '~/components/view/ViewTraversalChallenge.vue'
import ViewTrendRace from '~/components/view/ViewTrendRace.vue'
import ViewWaterBlitz from '~/components/view/ViewWaterBlitz.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewUniqueOrBust from '~/components/view/ViewUniqueOrBust.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { TREATIES } from '~~/data/treaties.gen'
import { buildLineup } from '~~/lib/odd-one-out'
import type { OrganizationVector } from '~~/types/organization.type'
import { EMPIRES } from '~~/data/empires.gen'
import { TRENDS } from '~~/lib/trends-data'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { PLAYER_COLORS } from '~~/data/palette'
import { getCorrectRanking, scoreChallengeSubmission } from '~~/lib/challenges'
import { latestChallengeOfType } from '~~/lib/rounds'
import {
  drawnCard,
  activeTimelinePlayerId,
  perCardPoints,
  placedYears,
  resolveSlot,
  slotDensityFraction,
  timelineEvent,
} from '~~/lib/timeline'
import { flagSwatches } from '~~/lib/audio-palette'
import { seededTongueSample } from '~~/lib/tongue-samples'
import {
  BOUNDARY_TOLERANCE,
  GAUNTLET_LIVES,
  getFinalChallenges,
} from '~~/lib/challenges/final-challenge'
import { generateTiles } from '~~/lib/tiles'
import { useGameStore } from '~~/store/game.store'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Game, GameDifficulty, PlayerColor, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { Component } from 'vue'

const gameStore = useGameStore()

/** Long enough for a scenario's interstitial to finish and stop clearing the
 *  board, so `?reveal=` lands on a settled scene. */
const REVEAL_PREVIEW_DELAY_MS = 6000

const ME = '00000000-0000-4000-8000-000000000000'
const RIVAL = '00000000-0000-4000-8000-000000000001'
const THIRD = '00000000-0000-4000-8000-000000000002'
const MAXIMUM_POINTS = 21

const route = useRoute()
const router = useRouter()
const scenarioId = ref('ranking')
const ready = ref(false)
const renderKey = ref(0)
const lastEvent = ref('')
const diagnostics = ref(false)

/**
 * Mirror of the server's resolveTimelinePlacement/advanceTimelineTurn
 * (timeline-turns.ts) on the pinned game, through the same lib/timeline math —
 * so the timeline scenario plays its full turn rhythm (story beat, line
 * landing, scorecard) without a server. The deal never rotates: it is always
 * your call, every card to the end of the deck.
 */
const SIM_LATENCY_MS = 300
const simulateTimelinePlacement = (eventData: Record<string, unknown>) => {
  const game = gameStore.game
  const challenge = game ? latestChallengeOfType(game, 'timeline-challenge') : undefined
  if (!challenge || challenge.state.finished || challenge.state.revealing) return
  const { state } = challenge
  if (eventData.turn !== state.turn) return
  const playerId = activeTimelinePlayerId(state)
  const slug = drawnCard(state)
  const event = slug ? timelineEvent(slug) : undefined
  if (!slug || !event) return

  window.setTimeout(() => {
    const chosen = typeof eventData.slot === 'number' ? eventData.slot : -1
    const { correct, slot } = resolveSlot(placedYears(state.placed), event.year, chosen)
    const scored = correct
      ? Math.round(
          perCardPoints(challenge) * slotDensityFraction(state.placed.length + 1, state.deck.length)
        )
      : 0
    state.placements.push({
      playerId,
      slug,
      chosenSlot: chosen,
      correctSlot: slot,
      correct,
      scored,
      kind: 'placed',
    })
    if (scored) state.banked[playerId] = (state.banked[playerId] ?? 0) + scored
    state.placed.splice(slot, 0, slug)
    state.revealing = true
    state.deadline = Date.now() + challenge.revealSeconds * 1000

    window.setTimeout(() => {
      if (state.card >= state.deck.length - 1) {
        state.finished = true
        state.revealing = false
        return
      }
      state.revealing = false
      state.card++
      state.turn++
      state.deadline = Date.now() + challenge.turnSeconds * 1000
    }, challenge.revealSeconds * 1000)
  }, SIM_LATENCY_MS)
}

const installStubSocket = () => {
  gameStore.playerId = ME
  const record = (event: string, eventData: Record<string, unknown>) => {
    lastEvent.value = `${event} ${JSON.stringify(eventData ?? {}).slice(0, 160)}`
    if (event === 'submit-timeline-placement') simulateTimelinePlacement(eventData ?? {})
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
    tiles: generateTiles('medium', 'view-harness'),
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

/** A settled ranking round, for score/standings screens. Answers and points
 *  come from the real scorer, so the reveal breakdown always adds up. */
const settledRound = (): Round => {
  const accessorId = 'economics.gdpPerCapita'
  const dealt: ISOCountryCode[] = ['FR', 'BR', 'JP', 'NG', 'SE']
  const correct = getCorrectRanking({ groupChallengeAccessorId: accessorId, isoCodes: dealt })
  const submissions: { [playerId: string]: ISOCountryCode[] } = {
    [ME]: ['SE', 'BR', 'JP', 'FR', 'NG'],
    [RIVAL]: [correct[1]!, correct[0]!, ...correct.slice(2)],
    [THIRD]: [...correct].reverse(),
  }

  return {
    groupChallenge: {
      _type: 'group-challenge',
      id: accessorId,
      countriesPerPlayer: { [ME]: dealt, [RIVAL]: dealt, [THIRD]: dealt },
    },
    groupAnswers: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [playerId, { submitted, correct }])
    ),
    playerTurns: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        {
          points: scoreChallengeSubmission({
            groupChallengeAccessorId: accessorId,
            submittedRanking: submitted,
            dealtCountries: dealt,
          }),
        },
      ])
    ),
  } as unknown as Round
}

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
  {
    isoCode: 'HU',
    metric: 'politicalCorruption',
    note: 'Hungary — corruption (bounded, inverted)',
  },
  { isoCode: 'SV', metric: 'homicideRate', note: 'El Salvador — homicide collapse' },
  { isoCode: 'US', metric: 'gini', note: 'United States — inequality (0.2–0.6 scale)' },
  { isoCode: 'BD', metric: 'childMortality', note: 'Bangladesh — child mortality' },
  { isoCode: 'SY', metric: 'netMigration', note: 'Syria — net migration (crosses zero)' },
] as const

/** One gallery, both voices: 'spark' is the plain sparkline, 'chart' the
 *  post-reveal treatment (axes, scrub readout, expand dock). */
const trendGallery = (detail: 'spark' | 'chart') =>
  defineComponent({
    name: detail === 'chart' ? 'TrendChartGallery' : 'TrendGallery',
    setup: () => () =>
      h(
        'div',
        {
          style:
            'position:absolute;inset:0;overflow:auto;pointer-events:auto;padding:6rem 2rem 2rem;' +
            'display:grid;gap:1.6rem;align-content:start;background:hsl(36,100%,97%);' +
            `grid-template-columns:repeat(auto-fill,minmax(${detail === 'chart' ? 34 : 24}rem,1fr))`,
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
                ? h(TrendSparkline, { series: [...series], metric, detail })
                : h('em', 'no series in data/trends.gen'),
              h('figcaption', { style: 'margin-top:0.6rem;font-size:1.3rem' }, note),
            ]
          )
        })
      ),
  })

const TrendGallery = trendGallery('spark')
const TrendChartGallery = trendGallery('chart')

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
    id: 'anthem-scores',
    label: 'Opening Ceremony scores (buzz race)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'anthem-buzz-challenge',
            // Sweden rather than Japan: it carries a curated lyric wall, so the
            // scorecard's couplet and its language toggle are reachable here.
            country: 'SE',
            clip: { webm: '/anthems/SE.webm', m4a: '/anthems/SE.m4a' },
            lyricsUrl: '/anthems/lyrics/SE-anthem.json',
            durationSeconds: 30,
            maximumPoints: MAXIMUM_POINTS,
          },
          // An early buzz, a late one, and a player who never found it.
          groupAnswers: {
            [ME]: { submitted: ['JP'], correct: ['JP'], buzzAt: 0.82 },
            [RIVAL]: { submitted: ['JP'], correct: ['JP'], buzzAt: 0.31 },
            [THIRD]: { submitted: [], correct: ['JP'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 28, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 17, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        },
      ]),
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
    id: 'trend-sparkline-chart',
    label: 'Trend charts (axes + scrub)',
    component: TrendChartGallery,
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
    id: 'timeline',
    label: 'Timeline (your turn, mid-line)',
    component: ViewTimeline,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'timeline-challenge',
          turnSeconds: 22,
          revealSeconds: 7,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            deck: [
              'battle-of-hastings',
              'storming-of-the-bastille',
              'suez-canal',
              'sputnik-1',
              'fall-of-the-berlin-wall',
              'apollo-11',
              'chernobyl-disaster',
              'september-11-attacks',
            ],
            placed: [
              'battle-of-hastings',
              'storming-of-the-bastille',
              'suez-canal',
              'sputnik-1',
              'fall-of-the-berlin-wall',
            ],
            card: 5,
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 4,
            deadline: Date.now() + 22000,
            banked: { [RIVAL]: 9, [ME]: 5, [THIRD]: 0 },
            placements: [
              {
                playerId: RIVAL,
                slug: 'storming-of-the-bastille',
                chosenSlot: 1,
                correctSlot: 1,
                correct: true,
                scored: 3,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'suez-canal',
                chosenSlot: 2,
                correctSlot: 2,
                correct: true,
                scored: 5,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'sputnik-1',
                chosenSlot: 0,
                correctSlot: 3,
                correct: false,
                scored: 0,
                kind: 'timeout',
              },
              {
                playerId: RIVAL,
                slug: 'fall-of-the-berlin-wall',
                chosenSlot: 4,
                correctSlot: 4,
                correct: true,
                scored: 6,
                kind: 'placed',
              },
            ],
          },
        }),
      ]),
  },
  {
    id: 'timeline-story',
    label: 'Timeline (story beat after a miss)',
    component: ViewTimeline,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'timeline-challenge',
          turnSeconds: 22,
          revealSeconds: 7,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            deck: [
              'battle-of-hastings',
              'suez-canal',
              'chernobyl-disaster',
              'magna-carta',
              'apollo-11',
            ],
            placed: ['battle-of-hastings', 'magna-carta', 'suez-canal', 'chernobyl-disaster'],
            card: 3,
            order: [RIVAL, ME, THIRD],
            activeIndex: 2,
            turn: 2,
            deadline: Date.now() + 7000,
            banked: { [RIVAL]: 4, [ME]: 6, [THIRD]: 0 },
            revealing: true,
            placements: [
              {
                playerId: THIRD,
                slug: 'magna-carta',
                chosenSlot: 2,
                correctSlot: 1,
                correct: false,
                scored: 0,
                kind: 'placed',
              },
            ],
          },
        }),
      ]),
  },
  {
    id: 'empire',
    label: 'Ghosts of Empires (options + flag)',
    component: ViewEmpire,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'empire-challenge',
          empireId: 'gran-colombia',
          keyframeYears: EMPIRES['gran-colombia'].keyframeYears,
          peakYear: EMPIRES['gran-colombia'].peakYear,
          durationSeconds: 28,
          tapSeconds: 35,
          members: EMPIRES['gran-colombia'].members.core,
          partialMembers: EMPIRES['gran-colombia'].members.partial,
          options: ['gran-colombia', 'inca-empire', 'portuguese-brazil'],
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'empire-plc',
    label: 'Ghosts of Empires (Polish–Lithuanian)',
    component: ViewEmpire,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'empire-challenge',
          empireId: 'polish-lithuanian-commonwealth',
          keyframeYears: EMPIRES['polish-lithuanian-commonwealth'].keyframeYears,
          peakYear: EMPIRES['polish-lithuanian-commonwealth'].peakYear,
          durationSeconds: 24,
          tapSeconds: 30,
          members: EMPIRES['polish-lithuanian-commonwealth'].members.core,
          partialMembers: EMPIRES['polish-lithuanian-commonwealth'].members.partial,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'empire-hard',
    label: 'Ghosts of Empires (free pick, no flag)',
    component: ViewEmpire,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'empire-challenge',
          empireId: 'soviet-union',
          keyframeYears: EMPIRES['soviet-union'].keyframeYears,
          peakYear: EMPIRES['soviet-union'].peakYear,
          durationSeconds: 24,
          tapSeconds: 30,
          members: EMPIRES['soviet-union'].members.core,
          partialMembers: EMPIRES['soviet-union'].members.partial,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'empire-taps',
    label: 'Ghosts of Empires (beat 2 fast-forward)',
    component: ViewEmpire,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'empire-challenge',
          empireId: 'abbasid-caliphate',
          keyframeYears: EMPIRES['abbasid-caliphate'].keyframeYears,
          peakYear: EMPIRES['abbasid-caliphate'].peakYear,
          // The sweep collapses straight into the tap beat — no test hook needed.
          durationSeconds: 3,
          tapSeconds: 35,
          members: EMPIRES['abbasid-caliphate'].members.core,
          partialMembers: EMPIRES['abbasid-caliphate'].members.partial,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'empire-scores',
    label: 'Ghosts of Empires (scorecard)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          ...groupRound({
            _type: 'empire-challenge',
            empireId: 'gran-colombia',
            keyframeYears: EMPIRES['gran-colombia'].keyframeYears,
            peakYear: EMPIRES['gran-colombia'].peakYear,
            durationSeconds: 28,
            tapSeconds: 35,
            members: EMPIRES['gran-colombia'].members.core,
            partialMembers: EMPIRES['gran-colombia'].members.partial,
            maximumPoints: MAXIMUM_POINTS,
          }),
          groupAnswers: {
            [ME]: {
              submitted: ['CO', 'VE', 'PE'],
              correct: EMPIRES['gran-colombia'].members.core,
              empireGuess: { id: 'inca-empire', correct: false },
            },
          },
          playerTurns: { [ME]: { points: { scored: 6, maximum: MAXIMUM_POINTS } } },
        } as unknown as Round,
      ]),
  },
  {
    id: 'timeline-reveal',
    label: 'Timeline (finished, scorecard)',
    component: ViewTimeline,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'timeline-challenge',
          turnSeconds: 22,
          revealSeconds: 7,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            deck: [
              'battle-of-hastings',
              'storming-of-the-bastille',
              'suez-canal',
              'sputnik-1',
              'fall-of-the-berlin-wall',
              'apollo-11',
              'chernobyl-disaster',
            ],
            placed: [
              'battle-of-hastings',
              'storming-of-the-bastille',
              'suez-canal',
              'sputnik-1',
              'apollo-11',
              'chernobyl-disaster',
              'fall-of-the-berlin-wall',
            ],
            card: 6,
            order: [RIVAL, ME, THIRD],
            activeIndex: 0,
            turn: 5,
            deadline: Date.now(),
            banked: { [RIVAL]: 9, [ME]: 12, [THIRD]: 4 },
            finished: true,
            placements: [
              {
                playerId: RIVAL,
                slug: 'storming-of-the-bastille',
                chosenSlot: 1,
                correctSlot: 1,
                correct: true,
                scored: 4,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'suez-canal',
                chosenSlot: 2,
                correctSlot: 2,
                correct: true,
                scored: 5,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'sputnik-1',
                chosenSlot: 3,
                correctSlot: 3,
                correct: true,
                scored: 4,
                kind: 'placed',
              },
              {
                playerId: RIVAL,
                slug: 'apollo-11',
                chosenSlot: 2,
                correctSlot: 4,
                correct: false,
                scored: 0,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'chernobyl-disaster',
                chosenSlot: 5,
                correctSlot: 5,
                correct: true,
                scored: 7,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'fall-of-the-berlin-wall',
                chosenSlot: 6,
                correctSlot: 6,
                correct: true,
                scored: 4,
                kind: 'placed',
              },
            ],
          },
        }),
      ]),
  },
  {
    id: 'composition',
    label: 'Composition (foreign-born origins)',
    component: ViewComposition,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'composition-challenge',
          country: 'TR',
          slices: [
            { isoCode: 'SY', share: 0.5221 },
            { isoCode: 'IQ', share: 0.0591 },
            { isoCode: 'DE', share: 0.0533 },
            { isoCode: 'BG', share: 0.051 },
            { isoCode: 'AF', share: 0.0486 },
            { isoCode: 'IR', share: 0.0293 },
          ],
          options: ['DE', 'SY', 'BG', 'IQ', 'AF', 'IR'],
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
    id: 'stat-detective-scores',
    label: 'Stat detective (scorecard + clue recap)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
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
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['BR'], correct: ['BR'] },
            [RIVAL]: { submitted: [], correct: ['BR'] },
            [THIRD]: { submitted: ['AR'], correct: ['BR'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 14, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
      ]),
  },
  {
    id: 'flag-palette-scores',
    label: 'Flag palette (scorecard + flag meaning)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'flag-palette-challenge',
            country: 'KE',
            swatches: ['#000000', '#bb0000', '#006600', '#ffffff'],
            durationSeconds: 30,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['KE'], correct: ['KE'] },
            [RIVAL]: { submitted: ['TZ'], correct: ['KE'] },
            [THIRD]: { submitted: [], correct: ['KE'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 12, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
      ]),
  },
  {
    id: 'capital-guess-scores',
    label: 'Capital guess (scorecard + city dossier)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'capital-guess-challenge',
            country: 'JP',
            image: '/capitals/JP.webp',
            durationSeconds: 30,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['JP'], correct: ['JP'] },
            [RIVAL]: { submitted: ['KR'], correct: ['JP'] },
            [THIRD]: { submitted: [], correct: ['JP'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 16, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
      ]),
  },
  {
    id: 'water-scores',
    label: 'River run (scorecard + water fact)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'water-blitz-challenge',
            featureId: 'river-rhine',
            featureName: 'Rhine',
            kind: 'river',
            countries: ['CH', 'DE', 'FR', 'NL'],
            durationSeconds: 45,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['DE', 'NL'], correct: ['CH', 'DE', 'FR', 'NL'] },
            [RIVAL]: { submitted: ['CH'], correct: ['CH', 'DE', 'FR', 'NL'] },
            [THIRD]: { submitted: [], correct: ['CH', 'DE', 'FR', 'NL'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 10, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 5, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
      ]),
  },
  {
    id: 'mother-tongue-scores',
    label: 'Mother tongue (scorecard + language fact)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'mother-tongue-challenge',
            language: 'Swahili',
            countries: ['KE', 'TZ', 'UG'],
            durationSeconds: 30,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: { submitted: ['KE', 'TZ'], correct: ['KE', 'TZ', 'UG'] },
            [RIVAL]: { submitted: ['KE'], correct: ['KE', 'TZ', 'UG'] },
            [THIRD]: { submitted: [], correct: ['KE', 'TZ', 'UG'] },
          },
          playerTurns: {
            [ME]: { points: { scored: 9, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 4, maximum: MAXIMUM_POINTS } },
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
    id: 'water-blitz',
    label: 'Water blitz (shared shores, typed)',
    component: ViewWaterBlitz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'water-blitz-challenge',
          featureId: 'adriatic-sea',
          featureName: 'Adriatic Sea',
          kind: 'sea',
          countries: ['AL', 'BA', 'GR', 'HR', 'IT', 'ME', 'SI'],
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'mother-tongue',
    label: 'Mother tongue (typed, collect set)',
    component: ViewMotherTongue,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'mother-tongue-challenge',
          language: 'Portuguese',
          countries: ['PT', 'BR', 'AO', 'MZ', 'GW', 'CV', 'ST', 'TL', 'GQ'],
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'neighbour-blitz',
    label: 'Neighbour blitz (typed)',
    component: ViewNeighbourBlitz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'neighbour-blitz-challenge',
          country: 'DE',
          neighbours: ['DK', 'NL', 'BE', 'LU', 'FR', 'CH', 'AT', 'CZ', 'PL'],
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'name-that-water',
    label: 'Name that water (typed, hints)',
    component: ViewNameThatWater,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'name-water-challenge',
          featureId: 'adriatic-sea',
          featureName: 'Adriatic Sea',
          kind: 'sea',
          countries: ['AL', 'BA', 'GR', 'HR', 'IT', 'ME', 'SI'],
          maximumGuesses: 3,
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'traversal',
    label: 'Traversal (typed route)',
    component: ViewTraversalChallenge,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'traversal-challenge',
          start: 'PT',
          target: 'PL',
          optimalHops: 4,
          optimalPath: ['PT', 'ES', 'FR', 'DE', 'PL'],
          maximumClicks: 8,
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
    id: 'flag-palette-hard',
    label: 'Flag palette (hard: no region, sketch still draws)',
    component: ViewFlagPalette,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'flag-palette-challenge',
          country: 'BT',
          swatches: COUNTRIES.BT.identity.colors.slice(0, 6),
          durationSeconds: 45,
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
    id: 'anthem-buzz',
    label: 'Opening Ceremony (anthem audio)',
    component: ViewAnthemBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          // Sweden is the reference country for the lyric wall — the only one
          // curated so far (see public/anthems/lyrics/readme-anthems.md).
          country: 'SE',
          clip: { webm: '/anthems/SE.webm', m4a: '/anthems/SE.m4a' },
          lyricsUrl: '/anthems/lyrics/SE-anthem.json',
          durationSeconds: 30,
          region: 'Europe',
          swatches: flagSwatches('SE'),
          initial: 'S',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'anthem-buzz-poland',
    label: 'Opening Ceremony (white & red palette)',
    component: ViewAnthemBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          // Poland exercises the white-as-primary path: a two-colour flag
          // where one colour is the milk tone, so the field has to carry the
          // hint on crimson alone.
          country: 'PL',
          clip: { webm: '/anthems/PL.webm', m4a: '/anthems/PL.m4a' },
          lyricsUrl: '/anthems/lyrics/PL-anthem.json',
          durationSeconds: 30,
          region: 'Europe',
          swatches: flagSwatches('PL'),
          initial: 'P',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'anthem-buzz-japan',
    label: 'Opening Ceremony (shortest anthem, CJK wall)',
    component: ViewAnthemBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          // Kimigayo is the shortest anthem in the world: a five-line wall in
          // CJK script with a masked 君が代 span — the tiniest verse the wall
          // renders, no drift, non-Latin glyph fallback and mask sizing all in
          // one scenario.
          country: 'JP',
          clip: { webm: '/anthems/JP.webm', m4a: '/anthems/JP.m4a' },
          lyricsUrl: '/anthems/lyrics/JP-anthem.json',
          durationSeconds: 30,
          region: 'Asia',
          swatches: flagSwatches('JP'),
          initial: 'J',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'anthem-buzz-uruguay',
    label: 'Opening Ceremony (longest anthem wall)',
    component: ViewAnthemBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          // The longest anthem text in the world: 21 lines across 6 verses.
          // The wall's tallest column — the drift-scroll's stress test, and
          // the case that finds any bottom-fade or reflow regression first.
          country: 'UY',
          clip: { webm: '/anthems/UY.webm', m4a: '/anthems/UY.m4a' },
          lyricsUrl: '/anthems/lyrics/UY-anthem.json',
          durationSeconds: 30,
          region: 'Americas',
          swatches: flagSwatches('UY'),
          initial: 'U',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'anthem-buzz-broken-clip',
    label: 'Opening Ceremony (unloadable clip)',
    component: ViewAnthemBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          // Both sources 404 on purpose: the round must arm and run silent
          // rather than strand the table behind a dead play button — group
          // settlement waits on every seat.
          country: 'SE',
          clip: { webm: '/anthems/missing.webm', m4a: '/anthems/missing.m4a' },
          durationSeconds: 30,
          region: 'Europe',
          initial: 'S',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'tongue-buzz',
    label: 'Tongues (speech audio)',
    component: ViewTongueBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'tongue-buzz-challenge',
          // Swahili: distinctive enough to be a fair listen, and official in
          // four countries, so the any-speaker rule is visible in the reveal.
          language: 'Swahili',
          // All three voices, to exercise the dock's sequence-and-cycle.
          clips: [
            { webm: '/tongues/sw-0.webm', m4a: '/tongues/sw-0.m4a' },
            { webm: '/tongues/sw-1.webm', m4a: '/tongues/sw-1.m4a' },
            { webm: '/tongues/sw-2.webm', m4a: '/tongues/sw-2.m4a' },
          ],
          countries: ['TZ', 'KE', 'UG', 'RW'],
          durationSeconds: 20,
          region: 'Africa',
          speakerCount: 4,
          initial: 'T',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'tongue-buzz-ukrainian',
    label: 'Tongues (Ukrainian, borrowed anthem sample)',
    component: ViewTongueBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'tongue-buzz-challenge',
          // No `sample` on purpose: Ukrainian has no seed, so the view must
          // borrow lines from Ukraine's own anthem wall — the path Swahili and
          // most languages take in a real deal — and render them in Cyrillic.
          language: 'Ukrainian',
          clips: [
            { webm: '/tongues/uk-0.webm', m4a: '/tongues/uk-0.m4a' },
            { webm: '/tongues/uk-1.webm', m4a: '/tongues/uk-1.m4a' },
            { webm: '/tongues/uk-2.webm', m4a: '/tongues/uk-2.m4a' },
          ],
          countries: ['UA'],
          durationSeconds: 20,
          region: 'Europe',
          speakerCount: 1,
          initial: 'U',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'tongue-buzz-sample',
    label: 'Tongues (seeded writing sample)',
    component: ViewTongueBuzz,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'tongue-buzz-challenge',
          // Hindi has no anthem sung in it (India's is Bengali), so it falls
          // back to a seeded sample — the path Swahili never exercises.
          language: 'Hindi',
          // Hindi has a single sample — the degenerate sequence of one.
          clips: [{ webm: '/tongues/hi-0.webm', m4a: '/tongues/hi-0.m4a' }],
          countries: ['IN'],
          durationSeconds: 20,
          region: 'Asia',
          speakerCount: 1,
          sample: seededTongueSample('Hindi'),
          initial: 'I',
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
            ready: [RIVAL, ME, THIRD],
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
    id: 'border-chain-briefing',
    label: 'Border chain (briefing — rules card, one rival ready)',
    component: ViewBorderChain,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 1,
          state: {
            briefing: true,
            ready: [RIVAL],
            chains: [['DK']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 0,
            turn: 0,
            deadline: 0,
            named: {},
            strikesLeft: { [RIVAL]: 1, [ME]: 1, [THIRD]: 1 },
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ]),
  },
  {
    id: 'border-chain-easy',
    label: 'Border chain (easy: 20s clock, ISO chips on open moves)',
    component: ViewBorderChain,
    build: () => {
      const game = mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 20,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 1,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['DK', 'SE', 'FI']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 2,
            deadline: Date.now() + 20000,
            named: { [RIVAL]: ['SE'], [ME]: ['FI'] },
            strikesLeft: { [RIVAL]: 1, [ME]: 1, [THIRD]: 1 },
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ])
      game.difficulty = 'easy'
      return game
    },
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
    id: 'border-chain-trap',
    label: 'Border chain (dead-end hold, someone else trapped)',
    component: ViewBorderChain,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            // Gibraltar's neighbours are Spain (walked) and the sea.
            chains: [['FR', 'ES', 'PT']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 2,
            turn: 3,
            deadline: 0,
            named: { [RIVAL]: ['ES'], [ME]: ['PT'] },
            strikesLeft: {},
            eliminated: [THIRD],
            outcomes: { [THIRD]: 'trapped' },
            missedOuts: { [THIRD]: [] },
            lastMoverId: ME,
            trappedBy: { [THIRD]: ME },
            trap: {
              playerId: THIRD,
              head: 'PT',
              byPlayerId: ME,
              doors: [{ isoCode: 'ES', reason: 'walked', step: 2 }],
            },
          },
        }),
      ]),
  },
  {
    id: 'border-chain-trapped-me',
    label: 'Border chain (dead-end hold, you are the one trapped)',
    component: ViewBorderChain,
    build: () => {
      // Europe: Morocco borders Spain but is off this board — the mixed
      // walked/off-board proof, and the local player is the victim.
      const game = mockGame('group-challenge', [
        groupRound({
          _type: 'border-chain-challenge',
          turnSeconds: 12,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          state: {
            chains: [['DE', 'FR', 'ES']],
            order: [RIVAL, THIRD, ME],
            activeIndex: 2,
            turn: 3,
            deadline: 0,
            named: { [RIVAL]: ['FR'], [THIRD]: ['ES'] },
            strikesLeft: {},
            eliminated: [ME],
            outcomes: { [ME]: 'trapped' },
            missedOuts: { [ME]: [] },
            lastMoverId: THIRD,
            trappedBy: { [ME]: THIRD },
            trap: {
              playerId: ME,
              head: 'ES',
              byPlayerId: THIRD,
              doors: [
                { isoCode: 'FR', reason: 'walked', step: 2 },
                { isoCode: 'PT', reason: 'off-board' },
                { isoCode: 'AD', reason: 'off-board' },
                { isoCode: 'MA', reason: 'off-board' },
              ],
            },
          },
        }),
      ])
      game.variant = 'europe'
      return game
    },
  },
  {
    id: 'border-chain-trap-reveal',
    label: 'Border chain (reveal, trapped by a rival)',
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
              ['FR', 'ES', 'PT'],
              ['NO', 'SE', 'FI'],
            ],
            order: [RIVAL, ME, THIRD],
            activeIndex: 0,
            turn: 8,
            deadline: 0,
            named: { [RIVAL]: ['ES', 'SE'], [ME]: ['PT'], [THIRD]: ['FI'] },
            strikesLeft: {},
            eliminated: [ME, THIRD],
            // The fate line "walked into RIVAL's dead end" — never rendered
            // before, because every earlier fixture left trappedBy empty.
            outcomes: { [ME]: 'trapped', [THIRD]: 'timeout', [RIVAL]: 'won' },
            missedOuts: { [ME]: [], [THIRD]: ['RU', 'NO'] },
            trappedBy: { [ME]: RIVAL },
            finished: true,
          },
        }),
      ]),
  },
  {
    id: 'manhunt-detective',
    label: 'The Despot (detective, hunt beat, candidates painted)',
    component: ViewManhunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'manhunt-challenge',
          turnCount: 7,
          moveSeconds: 15,
          huntSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
          despotId: RIVAL,
          seaPassages: 2,
          subpoenas: 2,
          showCandidates: true,
          state: {
            ready: [],
            turn: 5,
            hop: 3,
            beat: 'hunt',
            deadline: Date.now() + 25000,
            detectives: [ME, THIRD],
            clues: [
              {
                hop: 1,
                kind: 'region',
                topic: 'geography',
                text: 'The despot is hiding in Europe',
              },
              {
                hop: 2,
                kind: 'threshold',
                accessorId: 'people.medianAge',
                threshold: 42,
                above: true,
                text: 'Its median age is at least 42 years',
              },
              {
                hop: 3,
                kind: 'threshold',
                accessorId: 'economics.gdpPerCapita',
                threshold: 30000,
                above: true,
                text: 'Its GDP per capita is at least $30,000',
              },
            ],
            moves: [
              { hop: 1, kind: 'ground' },
              { hop: 2, kind: 'ground' },
              { hop: 3, kind: 'sea' },
            ],
            seaPassagesLeft: 1,
            subpoenasLeft: { [ME]: 2, [THIRD]: 1 },
            candidates: ['IT', 'DE', 'ES', 'PT', 'GR', 'HR', 'SI', 'AT'],
            dragnets: [
              { hop: 1, markers: { [ME]: 'FR', [THIRD]: 'PL' } },
              { hop: 2, markers: { [ME]: 'DE', [THIRD]: 'DE' } },
            ],
            committed: [THIRD],
          },
        }),
      ]),
  },
  {
    id: 'manhunt-briefing',
    label: 'The Despot (briefing — detective case file)',
    component: ViewManhunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'manhunt-challenge',
          turnCount: 7,
          moveSeconds: 15,
          huntSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
          despotId: RIVAL,
          seaPassages: 2,
          subpoenas: 2,
          showCandidates: true,
          state: {
            briefing: true,
            ready: [THIRD],
            turn: 0,
            hop: 1,
            beat: 'move',
            deadline: 0,
            detectives: [ME, THIRD],
            clues: [],
            moves: [],
            seaPassagesLeft: 2,
            subpoenasLeft: { [ME]: 2, [THIRD]: 2 },
            candidates: [],
            dragnets: [],
            committed: [],
          },
        }),
      ]),
  },
  {
    id: 'manhunt-briefing-despot',
    label: 'The Despot (briefing — Glorious Leader card)',
    component: ViewManhunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'manhunt-challenge',
          turnCount: 7,
          moveSeconds: 15,
          huntSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
          despotId: ME,
          seaPassages: 2,
          subpoenas: 2,
          showCandidates: true,
          state: {
            briefing: true,
            ready: [THIRD],
            turn: 0,
            hop: 1,
            beat: 'move',
            deadline: 0,
            detectives: [RIVAL, THIRD],
            clues: [],
            moves: [],
            seaPassagesLeft: 2,
            subpoenasLeft: { [RIVAL]: 2, [THIRD]: 2 },
            candidates: [],
            dragnets: [],
            committed: [],
          },
        }),
      ]),
  },
  {
    id: 'manhunt-despot',
    label: 'The Despot (you flee, move beat, trail + dragnet)',
    component: ViewManhunt,
    build: () => {
      // The trail arrives over the targeted position channel in real play —
      // the harness plants it directly.
      gameStore.manhunt = { trail: ['CZ', 'AT', 'IT'], turn: 4 }
      return mockGame('group-challenge', [
        groupRound({
          _type: 'manhunt-challenge',
          turnCount: 7,
          moveSeconds: 15,
          huntSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
          despotId: ME,
          seaPassages: 2,
          subpoenas: 2,
          showCandidates: true,
          state: {
            ready: [],
            turn: 4,
            hop: 3,
            beat: 'move',
            deadline: Date.now() + 15000,
            detectives: [RIVAL, THIRD],
            clues: [
              { hop: 1, kind: 'region', text: 'The despot is hiding in Europe' },
              { hop: 2, kind: 'language', text: 'Official languages there include German' },
            ],
            moves: [
              { hop: 1, kind: 'ground' },
              { hop: 2, kind: 'ground' },
            ],
            seaPassagesLeft: 2,
            subpoenasLeft: { [RIVAL]: 2, [THIRD]: 2 },
            candidates: ['IT', 'AT', 'CH', 'SI', 'HR'],
            dragnets: [
              { hop: 1, markers: { [RIVAL]: 'DE', [THIRD]: 'PL' } },
              { hop: 2, markers: { [RIVAL]: 'AT', [THIRD]: 'CH' } },
            ],
            committed: [],
          },
        }),
      ])
    },
  },
  {
    id: 'manhunt-reveal',
    label: 'The Despot (captured, trail replay + reveal)',
    component: ViewManhunt,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'manhunt-challenge',
          turnCount: 7,
          moveSeconds: 15,
          huntSeconds: 25,
          maximumPoints: MAXIMUM_POINTS,
          despotId: RIVAL,
          seaPassages: 2,
          subpoenas: 2,
          showCandidates: true,
          state: {
            ready: [],
            turn: 10,
            hop: 5,
            beat: 'hunt',
            deadline: 0,
            detectives: [ME, THIRD],
            clues: [
              { hop: 1, kind: 'region', text: 'The despot is hiding in Europe' },
              { hop: 2, kind: 'threshold', text: 'Its urbanization is below 68%' },
              { hop: 3, kind: 'language', text: 'Official languages there include Italian' },
              {
                hop: 4,
                kind: 'flag-colors',
                text: 'The flag flying over the hideout carries green',
              },
              { hop: 5, kind: 'threshold', text: 'Its population is below 11,000,000' },
            ],
            moves: [
              { hop: 1, kind: 'ground' },
              { hop: 2, kind: 'ground' },
              { hop: 3, kind: 'sea' },
              { hop: 4, kind: 'ground' },
              { hop: 5, kind: 'ground' },
            ],
            seaPassagesLeft: 1,
            subpoenasLeft: { [ME]: 0, [THIRD]: 1 },
            candidates: ['IT', 'SI'],
            dragnets: [
              { hop: 1, markers: { [ME]: 'FR', [THIRD]: 'DE' } },
              { hop: 2, markers: { [ME]: 'AT', [THIRD]: 'AT' } },
              { hop: 3, markers: { [ME]: 'ES', [THIRD]: 'IT' } },
              { hop: 4, markers: { [ME]: 'HR', [THIRD]: 'HR' } },
              { hop: 5, markers: { [ME]: 'SI', [THIRD]: 'SI' } },
            ],
            committed: [ME, THIRD],
            outcome: {
              kind: 'captured',
              hop: 5,
              capturerIds: [ME, THIRD],
              country: 'SI',
              trail: ['CZ', 'AT', 'IT', 'HR', 'SI'],
            },
            finished: true,
          },
        }),
      ]),
  },
  {
    id: 'unique-briefing',
    label: 'Unique or Bust (briefing — tutorial card)',
    component: ViewUniqueOrBust,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'unique-or-bust-challenge',
          letter: 'M',
          categories: ['country', 'capital', 'river', 'megacity'],
          durationSeconds: 75,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            briefing: true,
            ready: [THIRD],
            deadline: 0,
            order: [ME, RIVAL, THIRD],
            locked: {},
          },
        }),
      ]),
  },
  {
    id: 'unique-board',
    label: 'Unique or Bust (live board, rivals locking)',
    component: ViewUniqueOrBust,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'unique-or-bust-challenge',
          letter: 'M',
          categories: ['country', 'capital', 'river', 'megacity'],
          durationSeconds: 75,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            ready: [ME, RIVAL, THIRD],
            deadline: Date.now() + 48000,
            order: [ME, RIVAL, THIRD],
            locked: { [RIVAL]: ['country', 'river'], [THIRD]: ['country'] },
          },
        }),
      ]),
  },
  {
    id: 'unique-reveal',
    label: 'Unique or Bust (collision grid reveal)',
    component: ViewUniqueOrBust,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'unique-or-bust-challenge',
          letter: 'M',
          categories: ['country', 'capital', 'river', 'megacity'],
          durationSeconds: 75,
          maximumPoints: MAXIMUM_POINTS,
          state: {
            ready: [ME, RIVAL, THIRD],
            deadline: 0,
            order: [ME, RIVAL, THIRD],
            locked: {
              [ME]: ['country', 'capital', 'river', 'megacity'],
              [RIVAL]: ['country', 'capital', 'river'],
              [THIRD]: ['country', 'megacity'],
            },
            results: {
              country: [
                {
                  key: 'mexico',
                  id: 'MX',
                  name: 'Mexico',
                  holders: [ME, RIVAL],
                  scored: 0,
                },
                { key: 'mauritania', id: 'MR', name: 'Mauritania', holders: [THIRD], scored: 5 },
              ],
              capital: [
                { key: 'madrid', id: 'ES', name: 'Madrid', holders: [ME], scored: 5 },
                { key: 'manila', id: 'PH', name: 'Manila', holders: [RIVAL], scored: 5 },
              ],
              river: [
                {
                  key: 'mississippi',
                  id: 'mississippi',
                  name: 'Mississippi',
                  holders: [ME, RIVAL],
                  scored: 0,
                },
              ],
              megacity: [
                { key: 'mumbai', id: 'IN:Mumbai', name: 'Mumbai', holders: [ME], scored: 5 },
                { key: 'madrid', id: 'ES:Madrid', name: 'Madrid', holders: [THIRD], scored: 5 },
              ],
            },
            finished: true,
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
    id: 'individual-find-flag',
    label: 'Individual: find the flag country (map tap)',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'find', id: 'flag', country: 'SY' }),
  },
  {
    id: 'individual-flag-pick',
    label: 'Individual: flag pick',
    component: ViewIndividualChallenge,
    build: () => individualGame({ variant: 'flag-pick', options: ['NL', 'LU', 'FR', 'RU'] }),
  },
  {
    id: 'individual-flag-twins',
    label: 'Individual: flag twins (palette lookalikes)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({ variant: 'flag-twins', country: 'ID', options: ['ID', 'MC', 'PL', 'SG'] }),
  },
  {
    id: 'individual-money-match',
    label: 'Individual: money match (banknote)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'money-match',
        country: 'JP',
        options: ['JP', 'KR', 'CN', 'TH'],
        image: '/currencies/JPY.webp',
      }),
  },
  {
    id: 'individual-capital-match',
    label: 'Individual: capital match (skyline)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'capital-match',
        country: 'SE',
        options: ['SE', 'NO', 'DK', 'FI'],
        image: '/capitals/SE.webp',
      }),
  },
  {
    id: 'individual-odd-one-out',
    label: 'Individual: odd one out (shared property)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'odd-one-out',
        country: 'BR',
        oddOneOut: {
          countries: ['MX', 'BR', 'CO', 'AR'],
          propertyLabel: 'Three of these share a language: Spanish',
          kind: 'language',
          value: 'Spanish',
        },
      }),
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
    id: 'individual-leader-find-easy',
    label: 'Individual: leader find (easy — portrait + facts)',
    component: ViewIndividualChallenge,
    build: () => leaderFindGame('easy'),
  },
  {
    id: 'individual-leader-find-normal',
    label: 'Individual: leader find (normal — facts only)',
    component: ViewIndividualChallenge,
    build: () => leaderFindGame('normal'),
  },
  {
    id: 'individual-leader-find-hard',
    label: 'Individual: leader find (hard — bare question)',
    component: ViewIndividualChallenge,
    build: () => leaderFindGame('hard'),
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
      finalGame([
        {
          _type: 'membership-challenge',
          organization: 'eu',
          exception: 'NO',
          lineup: membershipLineup('eu', 'NO'),
        },
      ]),
  },
  {
    // 54 members: the sheet's stress case, and the one that proved region
    // headings leak (every AU member is African).
    id: 'final-membership-au',
    label: 'Final: membership (African Union, 54 rows)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'membership-challenge',
          organization: 'au',
          exception: 'PT',
          lineup: membershipLineup('au', 'PT'),
        },
      ]),
  },
  {
    // 6 members: below the letter-heading threshold, renders flat.
    id: 'final-membership-csto',
    label: 'Final: membership (CSTO, 6 rows)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'membership-challenge',
          organization: 'csto',
          exception: 'MN',
          lineup: membershipLineup('csto', 'MN'),
        },
      ]),
  },
  {
    // The payoff case: the US is the only country on earth that signed the CRC
    // and never ratified it.
    id: 'final-treaty',
    label: 'Final: treaty (signed, never ratified)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'treaty-challenge',
          treaty: 'crc',
          holdout: 'US',
          standing: 'signatory',
          lineup: buildLineup(
            'US',
            ISOCountryCodes.filter(isoCode => TREATIES.crc?.[isoCode]?.standing === 'party')
          ),
        },
      ]),
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
    id: 'final-boundary',
    label: 'Final: boundary commission (draw, FR–ES)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'boundary-challenge',
          countries: ['FR', 'ES'],
          tolerance: BOUNDARY_TOLERANCE.normal,
        },
      ]),
  },
  {
    id: 'final-boundary-hard',
    label: 'Final: boundary commission (draw, KZ–UZ)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'boundary-challenge',
          countries: ['KZ', 'UZ'],
          tolerance: BOUNDARY_TOLERANCE.hard,
        },
      ]),
  },
  {
    id: 'final-change',
    label: 'Final: world of change (tap only)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'change-challenge',
          slug: 'the-vanishing-inland-sea',
          frames: [
            '/changes/the-vanishing-inland-sea-before.webp',
            '/changes/the-vanishing-inland-sea-after.webp',
          ],
          crossfadeSeconds: 2.4,
          frameYears: [2000, 2018],
        },
      ]),
  },
  {
    id: 'final-change-africa',
    label: 'Final: world of change (Lake Chad)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'change-challenge',
          slug: 'the-shrinking-basin-lake',
          frames: [
            '/changes/the-shrinking-basin-lake-before.webp',
            '/changes/the-shrinking-basin-lake-after.webp',
          ],
          crossfadeSeconds: 2.4,
          frameYears: [1973, 2017],
          acceptNeighbours: true,
        },
      ]),
  },
  {
    id: 'final-change-decade',
    label: 'Final: world of change (tap + decade dial)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'change-challenge',
          slug: 'the-fishbone-clearings',
          frames: [
            '/changes/the-fishbone-clearings-before.webp',
            '/changes/the-fishbone-clearings-after.webp',
          ],
          crossfadeSeconds: 2,
          decadeTolerance: 10,
        },
      ]),
  },
  {
    id: 'final-yearbook',
    label: 'Final: yearbook (year dial)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'yearbook-challenge',
          headlines: [
            'fall-of-the-berlin-wall',
            'baltic-way',
            'velvet-revolution',
            'world-wide-web',
          ],
          tolerance: 1,
          secondsPerHeadline: 14,
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
    id: 'final-endonym',
    label: 'Final: endonym (own names)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        { _type: 'endonym-challenge', countries: ['FI', 'DE', 'CN', 'EG', 'HR'], quota: 3 },
      ]),
  },
  {
    id: 'final-diaspora',
    label: 'Final: diaspora (where the born-in live)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'diaspora-challenge',
          origins: ['LK', 'MW', 'KW'],
          accepted: [['IN'], ['ZA'], ['AE']],
          quota: 2,
        },
      ]),
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
    // The other end of the ranking: the scorecard slices from the tail and
    // counts its places up from the lowest.
    id: 'final-min',
    label: 'Final: min (stat pick)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'min-challenge',
          accessorId: 'economics.gdpPerCapita',
          country: 'BI',
          hints: ['BI', 'CF', 'SS', 'SO', 'MZ'],
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
const finalGame = (challenges: FinalChallengeItem[], difficulty: GameDifficulty = 'hard'): Game => {
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

/** The lineup a real deal would build, so a pinned fixture matches production. */
const membershipLineup = (
  organization: keyof typeof OrganizationVector,
  exception: ISOCountryCode
): ISOCountryCode[] =>
  buildLineup(
    exception,
    ISOCountryCodes.filter(isoCode =>
      COUNTRIES[isoCode].membership.some(entry => entry.id === organization)
    )
  )

/** A real dealer run — same randomness as production. */
const gauntletGame = (difficulty: GameDifficulty): Game => {
  const game = finalGame([], difficulty)
  game.players[ME]!.moves[0]!.challenge = getFinalChallenges({ game })
  return game
}

const leaderFindGame = (difficulty: GameDifficulty): Game => {
  const game = individualGame({ variant: 'find', id: 'government.leader', country: 'SO' })
  game.difficulty = difficulty
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
  // Selection survives a refresh: /test-views?scenario=border-chain-easy
  router.replace({ query: { scenario: scenario.id } })
  lastEvent.value = ''
  gameStore.game = scenario.build()
  renderKey.value += 1
  ready.value = true
}

/** Push a few opponent guesses so ticker chrome can be previewed. */
const seedGuesses = () => {
  const now = Date.now()
  gameStore.map.liveGuesses.push(
    { entryId: crypto.randomUUID(), playerId: RIVAL, kind: 'wrong', isoCode: 'DE', at: now },
    { entryId: crypto.randomUUID(), playerId: THIRD, kind: 'correct', isoCode: 'PT', at: now },
    { entryId: crypto.randomUUID(), playerId: RIVAL, kind: 'presence', at: now }
  )
}

onMounted(() => {
  installStubSocket()
  const requested = String(route.query.scenario ?? '')
  if (scenarios.some(s => s.id === requested)) scenarioId.value = requested
  diagnostics.value = route.query.diagnostics !== undefined
  deal()

  // /test-views?reveal=AL — park the country reveal card open (framed, as a
  // real round leaves it) so the card's layout and the berth it claims from
  // the camera can be inspected without playing a round to its answer.
  // Waits out the scenario's interstitial, which clears the board on arrival.
  const reveal = String(route.query.reveal ?? '').toUpperCase()
  if (reveal) {
    window.setTimeout(() => {
      gameStore.map.reveal = reveal as ISOCountryCode
      gameStore.map.status = 'correct'
      gameStore.map.focus = [reveal as ISOCountryCode]
    }, REVEAL_PREVIEW_DELAY_MS)
  }
})
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
/** The floating scenario bar's footprint: its content plus its own top offset.
 *  Used twice below to push the scene clear of it on a phone. */
$harness-bar-height: 3.4rem;

/** Mirrors `.main-board` in pages/room/[roomId].vue — see test-recognition. */
.harness {
  height: var(--viewport-height);
  overflow: hidden;
  position: relative;
  max-width: 100%;
  pointer-events: none;

  // The scenario bar floats over the scene. On a desktop there is room above
  // the title for it; on a phone it lands squarely on the challenge's header,
  // hiding the very question the round is asking. Start the scene below it
  // instead — the bar can't move to the bottom, where the guess console lives.
  @media screen and (max-width: $phone) {
    height: calc(var(--viewport-height) - #{$harness-bar-height});
    margin-top: $harness-bar-height;
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
