<template>
  <div class="harness">
    <nav class="controls">
      <div class="group grow">
        <span class="label">Scenario</span>
        <div class="picker" @focusout="onPickerFocusOut">
          <button class="picker-toggle" @click="pickerOpen ? closePicker() : openPicker()">
            <span class="picker-current">{{ activeScenario?.label ?? scenarioId }}</span>
            <span class="picker-caret">▾</span>
          </button>
          <div v-if="pickerOpen" class="picker-panel">
            <div class="picker-head">
              <input
                ref="pickerInput"
                v-model="pickerQuery"
                aria-label="Filter scenarios"
                autocomplete="off"
                spellcheck="false"
                @keydown.down.prevent="movePickerHighlight(1)"
                @keydown.up.prevent="movePickerHighlight(-1)"
                @keydown.enter.prevent="pickHighlighted()"
                @keydown.esc.prevent="closePicker()"
              />
              <span class="picker-count">{{ pickerItems.length }}/{{ scenarios.length }}</span>
            </div>
            <ul ref="pickerList" class="picker-rows">
              <template v-for="row in pickerRows" :key="row.key">
                <li v-if="row.kind === 'header'" class="picker-group">{{ row.group }}</li>
                <li v-else>
                  <button
                    class="picker-row"
                    :class="{
                      highlighted: row.index === pickerHighlight,
                      current: row.entry.scenario.id === scenarioId,
                    }"
                    :data-index="row.index"
                    @pointerdown.prevent
                    @pointerenter="pickerHighlight = row.index"
                    @click="pick(row.entry.scenario.id)"
                  >
                    <span class="picker-row-label">{{ row.entry.scenario.label }}</span>
                    <span v-if="pickerQuery.trim()" class="picker-row-group">
                      {{ row.entry.group }}
                    </span>
                  </button>
                </li>
              </template>
              <li v-if="!pickerItems.length" class="picker-empty">No scenario matches</li>
            </ul>
          </div>
        </div>
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
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import ViewAtlas from '~/components/view/ViewAtlas.vue'
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
import ViewStarChart from '~/components/view/ViewStarChart.vue'
import ViewTerraIncognita from '~/components/view/ViewTerraIncognita.vue'
import ViewStatDetective from '~/components/view/ViewStatDetective.vue'
import ViewTimeline from '~/components/view/ViewTimeline.vue'
import ViewTraversalChallenge from '~/components/view/ViewTraversalChallenge.vue'
import ViewTrendRace from '~/components/view/ViewTrendRace.vue'
import ViewWaterBlitz from '~/components/view/ViewWaterBlitz.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewCleanSweep from '~/components/view/ViewCleanSweep.vue'
import ViewUniqueOrBust from '~/components/view/ViewUniqueOrBust.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { TREATIES } from '~~/data/treaties.gen'
import { buildLineup } from '~~/lib/odd-one-out'
import { ROSETTA_RELATIONS } from '~~/lib/rosetta'
import type { OrganizationVector } from '~~/types/organization.type'
import { EMPIRES } from '~~/data/empires.gen'
import { TRENDS } from '~~/lib/trends-data'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { PLAYER_COLORS } from '~~/data/palette'
import {
  getCorrectRanking,
  scoreChallengeSubmission,
  scoreTraversalSubmission,
} from '~~/lib/challenges'
import { shortestRoute, traversalWithin } from '~~/lib/traversal'
import { SWEEP_SETS } from '~~/lib/clean-sweep'
import type { TraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import { latestChallengeOfType } from '~~/lib/rounds'
import {
  ATLAS_TABLE_SEED_OPTIONS,
  atlasContinuations,
  atlasTailLetter,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { activePlayerId, liveChain, standingPlayers } from '~~/lib/chain'
import { sample } from '~~/lib/arrays'
import { normalizeAnswer } from '~~/lib/strings'
import { listScrollTop } from '~~/lib/use-viewport'
import { playableWorldCountries } from '~~/lib/game-rules'
import { TRAP_HOLD_MS } from '~~/lib/round-beats'
import type { AtlasChallenge, ChainTurnOutcome } from '~~/types/challenges/group-modes.type'
import {
  drawnCard,
  activeTimelinePlayerId,
  placedYears,
  resolveSlot,
  timelineEvent,
} from '~~/lib/timeline'
import { flagSwatches } from '~~/lib/audio-palette'
import { seededTongueSample } from '~~/lib/tongue-samples'
import {
  BOUNDARY_TOLERANCE,
  GAUNTLET_LIVES,
  getFinalChallenges,
} from '~~/lib/challenges/final-challenge'
import { blitzScore } from '~~/lib/scoring'
import { starChartInitials, starChartSeconds } from '~~/lib/star-chart'
import { terraSeconds, TERRA_CADENCE_MS, TERRA_COLLAPSE_THRESHOLD } from '~~/lib/terra-incognita'
import { generateTiles } from '~~/lib/tiles'
import { useGameStore } from '~~/store/game.store'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Game, GameDifficulty, PlayerColor, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
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
    state.placements.push({
      playerId,
      slug,
      chosenSlot: chosen,
      correctSlot: slot,
      correct,
      slotCount: state.placed.length + 1,
      kind: 'placed',
    })
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

/**
 * Mirror of atlas-turns on the pinned game, through the same lib/atlas-chain
 * rule the server grades with — so the atlas scenarios play the full rhythm
 * (turn handoff, rival moves, strikes, the letter trap, reveal) without a
 * server. Rivals answer after a beat with a valid continuation; the local
 * shot clock burns a strike or eliminates exactly like the engine. Every
 * timer re-reads the pinned challenge and dies when the scenario was redealt
 * or the turn moved on — the engine's own staleness posture.
 */
const RIVAL_BEAT_MS = 1600

const atlasOf = () => {
  const game = gameStore.game
  return game ? latestChallengeOfType(game, 'atlas-challenge') : undefined
}

const atlasPool = () =>
  playableWorldCountries(gameStore.game ?? { variant: 'world', difficulty: 'normal' })

const atlasOpenMoves = (challenge: AtlasChallenge) => {
  const head = liveChain(challenge.state).at(-1)
  if (!head) return []
  return atlasContinuations(head, challenge.state.chains.flat(), atlasPool(), {
    overlaps: challenge.overlaps,
  })
}

const atlasAdvanceTurn = (challenge: AtlasChallenge) => {
  const { state } = challenge
  const standing = new Set(standingPlayers(state))
  for (let step = 1; step <= state.order.length; step++) {
    const index = (state.activeIndex + step) % state.order.length
    if (standing.has(state.order[index])) {
      state.activeIndex = index
      break
    }
  }
  state.turn++
  state.deadline = Date.now() + challenge.turnSeconds * 1000
}

const atlasFinish = (challenge: AtlasChallenge) => {
  const winner = standingPlayers(challenge.state)[0]
  if (winner) challenge.state.outcomes[winner] = 'won'
  challenge.state.finished = true
}

const atlasEliminate = (
  challenge: AtlasChallenge,
  playerId: string,
  outcome: ChainTurnOutcome,
  outs: ISOCountryCode[]
) => {
  challenge.state.eliminated.push(playerId)
  challenge.state.outcomes[playerId] = outcome
  challenge.state.missedOuts[playerId] = outs
}

const atlasSpringTrap = (challenge: AtlasChallenge) => {
  const { state } = challenge
  const trappedId = activePlayerId(state)
  atlasEliminate(challenge, trappedId, 'trapped', [])
  const byPlayerId =
    state.lastMoverId && state.lastMoverId !== trappedId ? state.lastMoverId : undefined
  if (byPlayerId) (state.trappedBy ??= {})[trappedId] = byPlayerId
  const head = liveChain(state).at(-1)!
  const used = new Set(state.chains.flat())
  state.trap = {
    playerId: trappedId,
    head,
    byPlayerId,
    letter: atlasTailLetter(head),
    spent: atlasContinuations(head, [], atlasPool(), { overlaps: challenge.overlaps }).filter(
      isoCode => used.has(isoCode)
    ),
  }
  state.deadline = 0
  armAtlasTrapResume(challenge)
}

const armAtlasTrapResume = (challenge: AtlasChallenge) => {
  const heldTurn = challenge.state.turn
  window.setTimeout(() => {
    const current = atlasOf()
    if (current !== challenge || !current?.state.trap || current.state.finished) return
    if (current.state.turn !== heldTurn) return
    const { state } = current
    state.trap = undefined
    if (standingPlayers(state).length <= 1) return atlasFinish(current)
    const seed =
      pickAtlasSeed(gameStore.game!, {
        minOptions: ATLAS_TABLE_SEED_OPTIONS,
        exclude: new Set(state.chains.flat()),
      }) ?? pickAtlasSeed(gameStore.game!, { minOptions: ATLAS_TABLE_SEED_OPTIONS })
    if (!seed) return atlasFinish(current)
    state.chains.push([seed])
    atlasAdvanceTurn(current)
    atlasContinueTurn(current)
  }, TRAP_HOLD_MS)
}

const atlasApplyMove = (challenge: AtlasChallenge, isoCode: ISOCountryCode) => {
  const { state } = challenge
  const moverId = activePlayerId(state)
  liveChain(state).push(isoCode)
  ;(state.named[moverId] ??= []).push(isoCode)
  state.lastMoverId = moverId
  atlasAdvanceTurn(challenge)
  if (!atlasOpenMoves(challenge).length) return atlasSpringTrap(challenge)
  atlasContinueTurn(challenge)
}

const atlasResolveMiss = (challenge: AtlasChallenge, kind: 'wrong' | 'timeout') => {
  const { state } = challenge
  const missedId = activePlayerId(state)
  if ((state.strikesLeft[missedId] ?? 0) > 0) {
    state.strikesLeft[missedId]--
  } else {
    atlasEliminate(challenge, missedId, kind, atlasOpenMoves(challenge))
    if (standingPlayers(state).length <= 1) return atlasFinish(challenge)
  }
  atlasAdvanceTurn(challenge)
  atlasContinueTurn(challenge)
}

/** After each committed turn: arm the local shot clock, and let a rival act. */
const atlasContinueTurn = (challenge: AtlasChallenge) => {
  if (challenge.state.finished) return
  const { turn } = challenge.state
  window.setTimeout(
    () => {
      const current = atlasOf()
      if (current !== challenge || current.state.finished || current.state.trap) return
      if (current.state.turn !== turn) return
      atlasResolveMiss(current, 'timeout')
    },
    challenge.turnSeconds * 1000 + 400
  )

  const activeId = activePlayerId(challenge.state)
  if (activeId === ME) return
  window.setTimeout(() => {
    const current = atlasOf()
    if (current !== challenge || current.state.finished || current.state.trap) return
    if (current.state.turn !== turn || activePlayerId(current.state) !== activeId) return
    const move = sample(atlasOpenMoves(current))
    if (move) atlasApplyMove(current, move)
  }, RIVAL_BEAT_MS)
}

const simulateAtlasReady = () => {
  const challenge = atlasOf()
  if (!challenge?.state.briefing || challenge.state.finished) return
  window.setTimeout(() => {
    const current = atlasOf()
    if (current !== challenge || !current.state.briefing) return
    current.state.ready = [...current.state.order]
    current.state.briefing = false
    current.state.deadline = Date.now() + current.turnSeconds * 1000
    atlasContinueTurn(current)
  }, SIM_LATENCY_MS)
}

const simulateAtlasMove = (eventData: Record<string, unknown>) => {
  const challenge = atlasOf()
  if (!challenge || challenge.state.finished) return
  const { state } = challenge
  if (state.briefing || state.trap) return
  if (eventData.turn !== state.turn) return
  if (activePlayerId(state) !== ME) return
  const isoCode = String(eventData.isoCode ?? '') as ISOCountryCode
  window.setTimeout(() => {
    const current = atlasOf()
    if (current !== challenge || current.state.finished || current.state.trap) return
    if (current.state.turn !== state.turn) return
    if (atlasOpenMoves(current).includes(isoCode)) {
      atlasApplyMove(current, isoCode)
    } else {
      atlasResolveMiss(current, 'wrong')
    }
  }, SIM_LATENCY_MS)
}

/** Redealt atlas scenarios come alive at once: a live turn arms its clock (and
 *  a rival's move), a parked trap arms its resume. */
const armAtlasScenario = () => {
  const challenge = atlasOf()
  if (!challenge || challenge.state.finished || challenge.state.briefing) return
  if (challenge.state.trap) return armAtlasTrapResume(challenge)
  challenge.state.deadline = Date.now() + challenge.turnSeconds * 1000
  atlasContinueTurn(challenge)
}

const installStubSocket = () => {
  gameStore.playerId = ME
  const record = (event: string, eventData: Record<string, unknown>) => {
    lastEvent.value = `${event} ${JSON.stringify(eventData ?? {}).slice(0, 160)}`
    if (event === 'submit-timeline-placement') simulateTimelinePlacement(eventData ?? {})
    if (event === 'submit-chain-move') simulateAtlasMove(eventData ?? {})
    if (event === 'chain-ready') simulateAtlasReady()
  }
  // Critical events go through timeout().emitWithAck() — stub both paths.
  // `io` is the manager views subscribe to for reconnects; it never fires in
  // the harness, but its absence would crash any view that listens.
  const stub = {
    emit: record,
    timeout: () => stub,
    emitWithAck: async (event: string, eventData: Record<string, unknown>) => {
      record(event, eventData)
      return { ok: true }
    },
    io: { on: () => {}, off: () => {} },
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
const settledRound = (
  accessorId: GroupChallengeAccessorId = 'economics.gdpPerCapita',
  dealt: ISOCountryCode[] = ['FR', 'BR', 'JP', 'NG', 'SE']
): Round => {
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

/**
 * Clean Sweep fixtures. The board is the EU as the register resolves it, so
 * the harness can never drift from the set the dealer would actually deal.
 */
const SWEEP_BOARD = SWEEP_SETS.eu.members({ variant: 'world', difficulty: 'normal' })

const sweepChallenge = () => ({
  _type: 'clean-sweep-challenge' as const,
  setId: 'eu',
  members: SWEEP_BOARD,
  durationSeconds: 80,
  maximumPoints: MAXIMUM_POINTS,
})

const sweepState = () => ({
  ready: [ME, RIVAL, THIRD],
  deadline: 0,
  order: [ME, RIVAL, THIRD],
  claims: [] as { isoCode: string; playerId: string; at: number; remaining: number }[],
  strays: [] as { isoCode: string; playerId: string }[],
  benched: {} as { [playerId: string]: number },
})

/** Claim rows with a plausible descending clock, so the reveal's "cleared with
 *  Ns to spare" line has something real to read. */
const sweepClaims = (rows: (readonly [string, string])[]) =>
  rows.map(([isoCode, playerId], index) => ({
    isoCode,
    playerId,
    at: index,
    remaining: Math.max(0.05, 1 - (index + 1) / (rows.length + 2)),
  }))

const groupRound = (groupChallenge: unknown): Round =>
  ({ groupChallenge, groupAnswers: {}, playerTurns: {} }) as unknown as Round

/**
 * A settled Star Chart, for the reveal that has to make a GROUP round's
 * outcome legible: one star everybody found, one only a rival did, one nobody
 * reached — plus a wrong capital on your sheet. Answers and points come from
 * the real grader, so the ledger and the score always agree.
 */
const settledStarChartRound = (): Round => {
  const stars: ISOCountryCode[] = ['ES', 'PL', 'AT', 'FI', 'BA']
  const challenge = {
    _type: 'star-chart-challenge',
    stars,
    initials: starChartInitials(stars),
    durationSeconds: starChartSeconds(stars.length),
    maximumPoints: MAXIMUM_POINTS,
  }
  const submissions: { [playerId: string]: ISOCountryCode[] } = {
    // Three of five, Sarajevo missed by everyone, and Bratislava cost a point.
    [ME]: ['ES', 'PL', 'AT', 'SK'],
    [RIVAL]: ['ES', 'AT', 'FI'],
    [THIRD]: ['ES'],
  }

  return {
    groupChallenge: challenge,
    groupAnswers: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { submitted, correct: stars },
      ])
    ),
    playerTurns: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { points: blitzScore(stars, submitted, MAXIMUM_POINTS) },
      ])
    ),
  } as unknown as Round
}

/**
 * A settled Terra Incognita, for the reveal that has to teach placement: eight
 * countries erased, three of them still missing at the buzzer, and one name on
 * your sheet that was never gone at all.
 */
const settledTerraRound = (): Round => {
  const vanishings: ISOCountryCode[] = ['UY', 'MW', 'AL', 'TM', 'LA', 'BJ', 'MD', 'BT']
  const cadenceMs = TERRA_CADENCE_MS.normal
  const challenge = {
    _type: 'terra-incognita-challenge',
    vanishings,
    cadenceMs,
    collapseThreshold: TERRA_COLLAPSE_THRESHOLD.normal,
    durationSeconds: terraSeconds(vanishings.length, cadenceMs),
    maximumPoints: MAXIMUM_POINTS,
  }
  const submissions: { [playerId: string]: ISOCountryCode[] } = {
    // Five of eight, Bhutan and Moldova missed by the whole table, and Peru
    // named while it was still sitting there in plain sight.
    [ME]: ['UY', 'AL', 'TM', 'LA', 'BJ', 'PE'],
    [RIVAL]: ['UY', 'MW', 'AL'],
    [THIRD]: ['LA'],
  }

  return {
    groupChallenge: challenge,
    groupAnswers: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { submitted, correct: vanishings },
      ])
    ),
    playerTurns: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { points: blitzScore(vanishings, submitted, MAXIMUM_POINTS) },
      ])
    ),
  } as unknown as Round
}

/**
 * A settled Border Run, for the reveal that has to make a detour LOOK like a
 * detour: Russia → Albania in four crossings, answered with a five-crossing
 * Balkan route plus one guess that never joined it.
 */
const settledTraversalRound = (): Round => {
  const rules = { variant: 'world', difficulty: 'normal' } as const
  const challenge: TraversalChallenge = {
    _type: 'traversal-challenge',
    start: 'RU',
    target: 'AL',
    optimalHops: 4,
    optimalPath: shortestRoute('RU', 'AL', { within: traversalWithin(rules) })!,
    maximumClicks: 8,
    maximumPoints: MAXIMUM_POINTS,
  }
  const submissions: { [playerId: string]: ISOCountryCode[] } = {
    [ME]: ['UA', 'RO', 'RS', 'XK'],
    [RIVAL]: ['GE', 'TR', 'GR'],
    [THIRD]: ['BY', 'PL', 'SK', 'HU'],
  }

  return {
    groupChallenge: challenge,
    groupAnswers: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { submitted, correct: challenge.optimalPath },
      ])
    ),
    playerTurns: Object.fromEntries(
      Object.entries(submissions).map(([playerId, submitted]) => [
        playerId,
        { points: scoreTraversalSubmission({ challenge, submittedGuesses: submitted, rules }) },
      ])
    ),
  } as unknown as Round
}

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

/** A marathon chain grown greedily through the real letter rule — the same
 *  `atlasContinuations` the round grades with, so every tie is legit. */
const longAtlasGame = (finished: boolean): Game => {
  const chain: ISOCountryCode[] = ['NP']
  const pool = [...ISOCountryCodes]
  while (chain.length < 40) {
    const moves = atlasContinuations(chain[chain.length - 1], chain, pool)
    if (!moves.length) break
    // Max-degree greedy: take the move that leaves the most onward options,
    // so the walk skirts the drained letters and actually runs long.
    let next = moves[0]
    let best = -1
    for (const candidate of moves) {
      const onward = atlasContinuations(candidate, [...chain, candidate], pool).length
      if (onward > best) {
        best = onward
        next = candidate
      }
    }
    chain.push(next)
  }
  const order = [RIVAL, ME, THIRD]
  // The settled cut breaks the walk into two stanzas at a pretend dead end,
  // so the reveal card shows a trap boundary and a fresh chain.
  const cut = Math.floor(chain.length * 0.55)
  const chains = finished ? [chain.slice(0, cut), chain.slice(cut)] : [chain]
  const named: { [playerId: string]: ISOCountryCode[] } = {}
  for (const walkedChain of chains) {
    walkedChain.slice(1).forEach((isoCode, index) => {
      const playerId = order[index % order.length]
      ;(named[playerId] ??= []).push(isoCode)
    })
  }
  return mockGame('group-challenge', [
    groupRound({
      _type: 'atlas-challenge',
      turnSeconds: 14,
      maximumPoints: MAXIMUM_POINTS,
      strikes: 0,
      overlaps: false,
      state: {
        ready: order,
        chains,
        order,
        activeIndex: 1,
        turn: chain.length - 1,
        deadline: finished ? 0 : Date.now() + 14000,
        named,
        strikesLeft: {},
        eliminated: finished ? [ME, THIRD] : [],
        outcomes: finished ? { [RIVAL]: 'won', [ME]: 'trapped', [THIRD]: 'timeout' } : {},
        missedOuts: finished ? { [THIRD]: ['NA', 'NG', 'NL'] } : {},
        trappedBy: finished ? { [ME]: RIVAL } : undefined,
        finished,
      },
    }),
  ])
}

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
    label: 'Ranking (6 tiles, overflow)',
    component: ViewGroupChallenge,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'group-challenge',
          id: 'people.population',
          countriesPerPlayer: { [ME]: ['FR', 'BR', 'JP', 'NG', 'SE', 'MX'] },
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
    // The row-vs-row comparison: four guessed flags used to sit above a
    // five-flag optimum and read as the shorter journey.
    id: 'traversal-scores',
    label: 'Border Run reveal (route vs shortest)',
    component: ViewGroupScores,
    build: () => mockGame('group-scores', [settledTraversalRound()]),
  },
  {
    // GB and FI carry a note; the other three don't, so one scenario shows
    // both the qualified and the bare row.
    id: 'ranking-marriage-notes',
    label: 'Ranking reveal (per-country notes)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        settledRound('humanRights.gayMarriageLegalized', ['GB', 'FI', 'NL', 'SE', 'MX']),
      ]),
  },
  {
    // Lebanon is negative here — the case that used to render width:-18% and
    // vanish. Keeps the floored-shortest-bar behaviour under a live eye.
    id: 'ranking-negative-bars',
    label: 'Ranking reveal (negative values)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        settledRound('people.netMigration', ['SY', 'LB', 'AE', 'QA', 'US']),
      ]),
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
            placements: [
              {
                playerId: RIVAL,
                slug: 'storming-of-the-bastille',
                chosenSlot: 1,
                correctSlot: 1,
                correct: true,
                slotCount: 2,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'suez-canal',
                chosenSlot: 2,
                correctSlot: 2,
                correct: true,
                slotCount: 3,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'sputnik-1',
                chosenSlot: 0,
                correctSlot: 3,
                correct: false,
                slotCount: 4,
                kind: 'timeout',
              },
              {
                playerId: RIVAL,
                slug: 'fall-of-the-berlin-wall',
                chosenSlot: 4,
                correctSlot: 4,
                correct: true,
                slotCount: 5,
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
            revealing: true,
            placements: [
              {
                playerId: THIRD,
                slug: 'magna-carta',
                chosenSlot: 2,
                correctSlot: 1,
                correct: false,
                slotCount: 2,
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
    id: 'empire-majapahit',
    label: 'Ghosts of Empires (island archipelago)',
    component: ViewEmpire,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'empire-challenge',
          empireId: 'majapahit',
          keyframeYears: EMPIRES['majapahit'].keyframeYears,
          peakYear: EMPIRES['majapahit'].peakYear,
          durationSeconds: 24,
          tapSeconds: 30,
          members: EMPIRES['majapahit'].members.core,
          partialMembers: EMPIRES['majapahit'].members.partial,
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
            finished: true,
            placements: [
              {
                playerId: RIVAL,
                slug: 'storming-of-the-bastille',
                chosenSlot: 1,
                correctSlot: 1,
                correct: true,
                slotCount: 2,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'suez-canal',
                chosenSlot: 2,
                correctSlot: 2,
                correct: true,
                slotCount: 3,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'sputnik-1',
                chosenSlot: 3,
                correctSlot: 3,
                correct: true,
                slotCount: 4,
                kind: 'placed',
              },
              {
                playerId: RIVAL,
                slug: 'apollo-11',
                chosenSlot: 2,
                correctSlot: 4,
                correct: false,
                slotCount: 5,
                kind: 'placed',
              },
              {
                playerId: ME,
                slug: 'chernobyl-disaster',
                chosenSlot: 5,
                correctSlot: 5,
                correct: true,
                slotCount: 6,
                kind: 'placed',
              },
              {
                playerId: THIRD,
                slug: 'fall-of-the-berlin-wall',
                chosenSlot: 6,
                correctSlot: 6,
                correct: true,
                slotCount: 7,
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
    // Five stars over Europe, all mutually distant: Madrid, Warsaw, Vienna,
    // Helsinki, Sarajevo — the near-pair guard's own shape, and wide enough to
    // read at one camera framing.
    id: 'star-chart',
    label: 'Star chart (nocturne, initials aid)',
    component: ViewStarChart,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'star-chart-challenge',
          stars: ['ES', 'PL', 'AT', 'FI', 'BA'],
          initials: starChartInitials(['ES', 'PL', 'AT', 'FI', 'BA']),
          durationSeconds: starChartSeconds(5),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    // Hard mode: no initials, and the stars reach for the deeper field —
    // Ulaanbaatar, Tashkent, Vientiane, Asunción, Windhoek.
    id: 'star-chart-hard',
    label: 'Star chart (hard, no aid)',
    component: ViewStarChart,
    build: () => {
      const game = mockGame('group-challenge', [
        groupRound({
          _type: 'star-chart-challenge',
          stars: ['MN', 'UZ', 'LA', 'PY', 'NA'],
          durationSeconds: starChartSeconds(5),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ])
      game.difficulty = 'hard'
      return game
    },
  },
  {
    id: 'star-chart-scores',
    label: 'Star chart reveal (who named which star)',
    component: ViewGroupScores,
    build: () => mockGame('group-scores', [settledStarChartRound()]),
  },
  {
    // The atlas failing across five continents, so the erasure reads at one
    // world framing: Uruguay, Malawi, Albania, Turkmenistan, Laos, Benin,
    // Moldova, Bhutan — none of them touching, all of them landlocked or
    // neighbour-locked enough to melt cleanly into the wash.
    id: 'terra-incognita',
    label: 'Terra Incognita (the atlas fails)',
    component: ViewTerraIncognita,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'terra-incognita-challenge',
          vanishings: ['UY', 'MW', 'AL', 'TM', 'LA', 'BJ', 'MD', 'BT'],
          cadenceMs: TERRA_CADENCE_MS.normal,
          collapseThreshold: TERRA_COLLAPSE_THRESHOLD.normal,
          durationSeconds: terraSeconds(8, TERRA_CADENCE_MS.normal),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'terra-incognita-scores',
    label: 'Terra Incognita reveal (what you never noticed)',
    component: ViewGroupScores,
    build: () => mockGame('group-scores', [settledTerraRound()]),
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
          // Option variants get only the vague rungs — the flag table has
          // already narrowed the world to four.
          hints: [
            {
              kind: 'onset',
              text: 'Its defining conflict broke out in the 1960s, and it has not finished.',
            },
            { kind: 'tempo', text: 'It flared and died down across 2 separate bouts.' },
          ],
          secondsPerHint: 5,
          durationSeconds: 35,
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
          // Hard mode — the only difficulty that deals this kind in auto —
          // gets the full ladder, `bounds` included.
          hints: [
            {
              kind: 'onset',
              text: 'Its defining conflict broke out in the 2010s, and it is over.',
            },
            {
              kind: 'shape',
              text: 'An internal conflict (internationalized), fought over territory.',
            },
            { kind: 'tempo', text: 'One unbroken stretch of fighting, about 9 years of it.' },
            {
              kind: 'scale',
              text: '5 distinct disputes on the record since 1946 — 2 still live in the last five years.',
            },
            { kind: 'bounds', neighbours: ['PL', 'SK', 'HU', 'RO', 'MD', 'BY', 'RU'] },
          ],
          secondsPerHint: 5,
          durationSeconds: 42,
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
          hints: [
            {
              kind: 'onset',
              text: 'Its defining conflict broke out in the 1990s, and it is over.',
            },
            { kind: 'tempo', text: 'It flared and died down across 2 separate bouts.' },
          ],
          secondsPerHint: 5,
          durationSeconds: 35,
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
          hints: [
            {
              kind: 'onset',
              text: 'Its defining conflict broke out in the 1970s, and it has not finished.',
            },
            { kind: 'tempo', text: 'One unbroken stretch of fighting, about 47 years of it.' },
          ],
          secondsPerHint: 5,
          durationSeconds: 35,
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
          hints: [
            {
              kind: 'onset',
              text: 'Its defining conflict broke out in the 2000s, and it is over.',
            },
            { kind: 'tempo', text: 'It flared and died down across 2 separate bouts.' },
          ],
          secondsPerHint: 5,
          durationSeconds: 35,
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
            secondsPerHint: 5,
            durationSeconds: 35,
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
            // BE and AT are on nobody's Rhine — the strays the reveal marks.
            [ME]: { submitted: ['DE', 'NL', 'BE'], correct: ['CH', 'DE', 'FR', 'NL'] },
            [RIVAL]: { submitted: ['CH', 'AT'], correct: ['CH', 'DE', 'FR', 'NL'] },
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
            // Swahili is not official in Ethiopia — the stray to mark.
            [ME]: { submitted: ['KE', 'TZ', 'ET'], correct: ['KE', 'TZ', 'UG'] },
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
    // The screenshot that started this: eleven of Russia's fourteen neighbours
    // found, three names that don't border it at all (Armenia, Kyrgyzstan,
    // Turkmenistan), and one repeat. The points are what blitzScore really
    // pays on this pot — round(21 × 11/14) − 3 = 14 — so the tally beside the
    // score can be read against the score itself.
    id: 'neighbour-scores',
    label: 'Neighbour blitz (scorecard — hits, misses, strays)',
    component: ViewGroupScores,
    build: () =>
      mockGame('group-scores', [
        {
          groupChallenge: {
            _type: 'neighbour-blitz-challenge',
            country: 'RU',
            neighbours: [
              'AZ',
              'BY',
              'CN',
              'EE',
              'FI',
              'GE',
              'KP',
              'KZ',
              'LT',
              'LV',
              'MN',
              'NO',
              'PL',
              'UA',
            ],
            durationSeconds: 60,
            maximumPoints: MAXIMUM_POINTS,
          },
          groupAnswers: {
            [ME]: {
              submitted: [
                'AM',
                'KZ',
                'KG',
                'TM',
                'PL',
                'LT',
                'FI',
                'NO',
                'EE',
                'LV',
                'BY',
                'UA',
                'CN',
                'MN',
                'KZ',
              ],
              correct: [
                'AZ',
                'BY',
                'CN',
                'EE',
                'FI',
                'GE',
                'KP',
                'KZ',
                'LT',
                'LV',
                'MN',
                'NO',
                'PL',
                'UA',
              ],
            },
            [RIVAL]: {
              submitted: ['CN', 'MN', 'IN'],
              correct: [
                'AZ',
                'BY',
                'CN',
                'EE',
                'FI',
                'GE',
                'KP',
                'KZ',
                'LT',
                'LV',
                'MN',
                'NO',
                'PL',
                'UA',
              ],
            },
            [THIRD]: {
              submitted: [],
              correct: [
                'AZ',
                'BY',
                'CN',
                'EE',
                'FI',
                'GE',
                'KP',
                'KZ',
                'LT',
                'LV',
                'MN',
                'NO',
                'PL',
                'UA',
              ],
            },
          },
          playerTurns: {
            // round(21 × 11/14) − 3 = 14, and round(21 × 2/14) − 1 = 2.
            [ME]: { points: { scored: 14, maximum: MAXIMUM_POINTS } },
            [RIVAL]: { points: { scored: 2, maximum: MAXIMUM_POINTS } },
            [THIRD]: { points: { scored: 0, maximum: MAXIMUM_POINTS } },
          },
        } as unknown as Round,
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
    id: 'sweep-briefing',
    label: 'Clean Sweep (briefing — rules card)',
    component: ViewCleanSweep,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          ...sweepChallenge(),
          state: { ...sweepState(), briefing: true, ready: [THIRD], deadline: 0, claims: [] },
        }),
      ]),
  },
  {
    id: 'sweep-board',
    label: 'Clean Sweep (live board, the pool draining)',
    component: ViewCleanSweep,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          ...sweepChallenge(),
          state: {
            ...sweepState(),
            deadline: Date.now() + 46000,
            // Deliberately uneven: a rail that is always level never shows
            // the thing it exists for. Rival is out front, you are chasing.
            claims: sweepClaims([
              ['FR', ME],
              ['DE', RIVAL],
              ['IT', THIRD],
              ['ES', RIVAL],
              ['NL', RIVAL],
              ['BE', RIVAL],
              ['PL', THIRD],
              ['SE', ME],
              ['IE', RIVAL],
            ]),
          },
        }),
      ]),
  },
  {
    id: 'sweep-benched',
    label: 'Clean Sweep (benched — a wrong name costs tempo)',
    component: ViewCleanSweep,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          ...sweepChallenge(),
          state: {
            ...sweepState(),
            deadline: Date.now() + 31000,
            benched: { [ME]: Date.now() + 12000 },
            strays: [{ isoCode: 'NO', playerId: ME }],
            claims: sweepClaims([
              ['FR', ME],
              ['DE', RIVAL],
              ['IT', THIRD],
              ['ES', RIVAL],
              ['NL', RIVAL],
              ['BE', THIRD],
            ]),
          },
        }),
      ]),
  },
  {
    id: 'sweep-last-call',
    label: 'Clean Sweep (last call — three slots standing)',
    component: ViewCleanSweep,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          ...sweepChallenge(),
          state: {
            ...sweepState(),
            deadline: Date.now() + 9000,
            claims: sweepClaims(
              SWEEP_BOARD.slice(0, SWEEP_BOARD.length - 3).map((isoCode, index) => [
                isoCode,
                [ME, RIVAL, THIRD][index % 3],
              ])
            ),
          },
        }),
      ]),
  },
  {
    id: 'sweep-reveal',
    label: 'Clean Sweep (reveal — who took what, and what nobody found)',
    component: ViewCleanSweep,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          ...sweepChallenge(),
          state: {
            ...sweepState(),
            deadline: 0,
            finished: true,
            strays: [
              { isoCode: 'NO', playerId: ME },
              { isoCode: 'CH', playerId: RIVAL },
              { isoCode: 'RS', playerId: THIRD },
            ],
            claims: sweepClaims(
              SWEEP_BOARD.slice(0, SWEEP_BOARD.length - 4).map((isoCode, index) => [
                isoCode,
                [ME, RIVAL, THIRD, RIVAL][index % 4],
              ])
            ),
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
    id: 'individual-trend-duel-hard',
    label: 'Individual: trend duel (hard — five duels, the ledger at its widest)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        variant: 'trend-duel',
        trendDuels: [
          { metric: 'co2PerCapita', seek: 'rising', a: 'SE', b: 'IN' },
          { metric: 'homicideRate', seek: 'falling', a: 'SV', b: 'US' },
          { metric: 'politicalCorruption', seek: 'rising', a: 'HU', b: 'EE' },
          { metric: 'gini', seek: 'rising', a: 'US', b: 'FR' },
          { metric: 'lifeExpectancy', seek: 'rising', a: 'RW', b: 'UA' },
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
    id: 'individual-errata-swap',
    label: 'Individual: errata (swapped neighbours)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'isoCode',
        variant: 'errata',
        country: 'ZM',
        errata: {
          lineup: ['ZM', 'ZW', 'MZ', 'BW', 'NA', 'AO', 'MW', 'TZ'],
          kind: 'swap',
          culprits: ['ZM', 'ZW'],
          labels: {
            ZM: 'Zimbabwe',
            ZW: 'Zambia',
            MZ: 'Mozambique',
            BW: 'Botswana',
            NA: 'Namibia',
            AO: 'Angola',
            MW: 'Malawi',
            TZ: 'Tanzania',
          },
        },
      }),
  },
  {
    id: 'individual-errata-impostor',
    label: 'Individual: errata (one borrowed name)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'isoCode',
        variant: 'errata',
        country: 'SK',
        errata: {
          lineup: ['PL', 'CZ', 'SK', 'HU', 'AT', 'DE'],
          kind: 'impostor',
          culprits: ['SK'],
          labels: {
            PL: 'Poland',
            CZ: 'Czechia',
            SK: 'Slovenia',
            HU: 'Hungary',
            AT: 'Austria',
            DE: 'Germany',
          },
        },
      }),
  },
  {
    // The regression case for label placement. Russia's whole-country bbox is
    // 1560 of the map's 2000 units wide, so its centre — where the renderer
    // hangs the name — sits in the Baltic. Every name here must land on its
    // own country; if one is adrift, `labelBoxFor` has come undone.
    id: 'individual-errata-stretched',
    label: 'Individual: errata (antimeridian neighbours)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'errata',
        variant: 'errata',
        country: 'FI',
        errata: {
          lineup: ['RU', 'FI', 'NO', 'SE', 'EE', 'LV', 'BY'],
          kind: 'impostor',
          culprits: ['FI'],
          labels: {
            RU: 'Russia',
            FI: 'Denmark',
            NO: 'Norway',
            SE: 'Sweden',
            EE: 'Estonia',
            LV: 'Latvia',
            BY: 'Belarus',
          },
        },
      }),
  },
  {
    id: 'individual-rosetta-peak',
    label: 'Individual: rosetta (analogy, typed)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'isoCode',
        variant: 'rosetta',
        country: 'AR',
        rosetta: {
          relation: 'peak',
          exemplar: { term: 'Everest', isoCode: 'NP' },
          term: 'Aconcagua',
          relationLabel: ROSETTA_RELATIONS.peak.label,
        },
      }),
  },
  {
    id: 'individual-rosetta-capital',
    label: 'Individual: rosetta (capital register)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'capital.name',
        variant: 'rosetta',
        country: 'PE',
        rosetta: {
          relation: 'capital',
          exemplar: { term: 'Nairobi', isoCode: 'KE' },
          term: 'Lima',
          relationLabel: ROSETTA_RELATIONS.capital.label,
        },
      }),
  },
  {
    id: 'individual-atlas',
    label: 'Individual: atlas (name chain, 4 links)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'lexicon',
        variant: 'atlas',
        country: 'NP',
        atlas: { seed: 'NP', target: 4, overlaps: false },
      }),
  },
  {
    // Mexico seeds the O trap: after Oman, every -o ending is a dead end.
    id: 'individual-atlas-hard',
    label: 'Individual: atlas (hard — overlaps pay, hazard seed)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'lexicon',
        variant: 'atlas',
        country: 'MX',
        atlas: { seed: 'MX', target: 6, overlaps: true },
      }),
  },
  {
    id: 'atlas-long',
    label: 'Atlas (marathon chain — folded live rail)',
    component: ViewAtlas,
    build: () => longAtlasGame(false),
  },
  {
    id: 'atlas-long-reveal',
    label: 'Atlas (marathon chain — reveal card scroll)',
    component: ViewAtlas,
    build: () => longAtlasGame(true),
  },
  {
    id: 'individual-atlas-easy',
    label: 'Individual: atlas (easy — suggestions from 3 letters)',
    component: ViewIndividualChallenge,
    build: () => {
      const game = individualGame({
        id: 'lexicon',
        variant: 'atlas',
        country: 'NP',
        atlas: { seed: 'NP', target: 3, overlaps: false },
      })
      game.difficulty = 'easy'
      return game
    },
  },
  {
    // Amharic borrows Ethiopia's anthem wall — the fetch path, not a seed.
    id: 'individual-scriptorium',
    label: 'Individual: scriptorium (Geʽez sample, typed)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'lexicon',
        variant: 'scriptorium',
        country: 'ET',
        scriptorium: { language: 'Amharic' },
      }),
  },
  {
    id: 'individual-scriptorium-seeded',
    label: 'Individual: scriptorium (Tamil seed, easy free hint)',
    component: ViewIndividualChallenge,
    build: () => {
      const game = individualGame({
        id: 'lexicon',
        variant: 'scriptorium',
        country: 'LK',
        scriptorium: { language: 'Tamil' },
      })
      game.difficulty = 'easy'
      return game
    },
  },
  {
    // Arabic exercises the RTL path: dir flips and the write-on wipe sweeps
    // right-to-left.
    id: 'individual-scriptorium-rtl',
    label: 'Individual: scriptorium (Arabic — RTL wipe)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'lexicon',
        variant: 'scriptorium',
        country: 'EG',
        scriptorium: { language: 'Arabic' },
      }),
  },
  {
    id: 'individual-chronicle',
    label: 'Individual: chronicle (drag Japan into order)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'history',
        variant: 'chronicle',
        country: 'JP',
        chronicle: {
          events: [
            'meiji-restoration',
            'battle-of-sekigahara',
            'the-tale-of-genji',
            'tokaido-shinkansen',
          ],
        },
      }),
  },
  {
    id: 'individual-far-flung',
    label: 'Individual: far flung (Cabinda, options)',
    component: ViewIndividualChallenge,
    build: () =>
      individualGame({
        id: 'isoCode',
        variant: 'far-flung',
        country: 'AO',
        farFlung: { slug: 'cabinda' },
        options: ['AO', 'CD', 'CG', 'GA'],
      }),
  },
  {
    id: 'individual-far-flung-hard',
    label: 'Individual: far flung (hard — Nakhchivan, typed)',
    component: ViewIndividualChallenge,
    build: () => {
      const game = individualGame({
        id: 'isoCode',
        variant: 'far-flung',
        country: 'AZ',
        farFlung: { slug: 'nakhchivan' },
      })
      game.difficulty = 'hard'
      return game
    },
  },
  {
    id: 'atlas-easy',
    label: 'Atlas (easy — 20s turns, ringed answers, suggestions)',
    component: ViewAtlas,
    build: () => {
      const game = mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 20,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 1,
          overlaps: false,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['NP', 'LA', 'SE']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 2,
            deadline: Date.now() + 20000,
            named: { [RIVAL]: ['LA'], [THIRD]: ['SE'] },
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
    id: 'atlas',
    label: 'Atlas (your turn, letter ties)',
    component: ViewAtlas,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 14,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          overlaps: false,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['NP', 'LA', 'SE', 'NO']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 3,
            deadline: Date.now() + 14000,
            named: { [RIVAL]: ['LA', 'NO'], [ME]: ['SE'] },
            strikesLeft: {},
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ]),
  },
  {
    // Nepal → Palestine: the 3-letter overlap badge, ember-tinted.
    id: 'atlas-hard',
    label: 'Atlas (hard — overlap rule, deep tie badge)',
    component: ViewAtlas,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 10,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          overlaps: true,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['NP', 'PS', 'ET']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 1,
            turn: 2,
            deadline: Date.now() + 10000,
            named: { [RIVAL]: ['PS'], [THIRD]: ['ET'] },
            strikesLeft: {},
            eliminated: [],
            outcomes: {},
            missedOuts: {},
          },
        }),
      ]),
  },
  {
    id: 'atlas-briefing',
    label: 'Atlas (briefing — rules card, one rival ready)',
    component: ViewAtlas,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 14,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 1,
          overlaps: false,
          state: {
            briefing: true,
            ready: [RIVAL],
            chains: [['NP']],
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
    // Iraq seals the letter chain: Qatar is the only Q and it opened the walk.
    id: 'atlas-trap',
    label: 'Atlas (trap — the letter Q is spent)',
    component: ViewAtlas,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 14,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          overlaps: false,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['QA', 'RU', 'AZ', 'NP', 'LU', 'GW', 'GB', 'ML', 'IQ']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 2,
            turn: 8,
            deadline: 0,
            named: {
              [RIVAL]: ['RU', 'NP', 'GB', 'IQ'],
              [ME]: ['AZ', 'GW'],
              [THIRD]: ['LU', 'ML'],
            },
            strikesLeft: {},
            eliminated: [THIRD],
            outcomes: { [THIRD]: 'trapped' },
            missedOuts: { [THIRD]: [] },
            lastMoverId: RIVAL,
            trappedBy: { [THIRD]: RIVAL },
            trap: {
              playerId: THIRD,
              head: 'IQ',
              byPlayerId: RIVAL,
              letter: 'q',
              spent: ['QA'],
            },
          },
        }),
      ]),
  },
  {
    id: 'atlas-reveal',
    label: 'Atlas (reveal — placements and missed outs)',
    component: ViewAtlas,
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'atlas-challenge',
          turnSeconds: 14,
          maximumPoints: MAXIMUM_POINTS,
          strikes: 0,
          overlaps: false,
          state: {
            ready: [RIVAL, ME, THIRD],
            chains: [['NP', 'LA', 'SE', 'NO', 'YE']],
            order: [RIVAL, ME, THIRD],
            activeIndex: 0,
            turn: 6,
            deadline: 0,
            named: { [RIVAL]: ['LA', 'NO'], [ME]: ['SE'], [THIRD]: ['YE'] },
            strikesLeft: {},
            eliminated: [ME, THIRD],
            outcomes: { [RIVAL]: 'won', [ME]: 'wrong', [THIRD]: 'timeout' },
            missedOuts: { [ME]: ['NA', 'NG', 'NL'], [THIRD]: ['EE', 'EG', 'ES'] },
            finished: true,
          },
        }),
      ]),
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
    // Arms control's seal, and the withdrawn standing — the only family with
    // real exits in the data (five, all recent and all European).
    id: 'final-treaty-arms',
    label: 'Final: treaty (withdrew, arms control)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'treaty-challenge',
          treaty: 'mine-ban',
          holdout: 'FI',
          standing: 'withdrawn',
          lineup: buildLineup(
            'FI',
            ISOCountryCodes.filter(isoCode => TREATIES['mine-ban']?.[isoCode]?.standing === 'party')
          ),
        },
      ]),
  },
  {
    // The law-of-the-sea seal, and the absent standing: the US is nowhere in
    // the UNCLOS table at all.
    id: 'final-treaty-sea',
    label: 'Final: treaty (never joined, law of the sea)',
    component: ViewFinalChallenge,
    build: () =>
      finalGame([
        {
          _type: 'treaty-challenge',
          treaty: 'unclos',
          holdout: 'US',
          standing: 'absent',
          lineup: buildLineup(
            'US',
            ISOCountryCodes.filter(isoCode => TREATIES.unclos?.[isoCode]?.standing === 'party')
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

const activeScenario = computed(() => scenarios.find(s => s.id === scenarioId.value))
const activeComponent = computed(() => activeScenario.value?.component ?? ViewGroupChallenge)

/** Picker families, in catalog order: first id prefix that matches wins, so
 *  the catch-all '' must stay last. */
const SCENARIO_GROUPS: [group: string, prefixes: string[]][] = [
  ['Ranking & scorecards', ['ranking', 'group-scores']],
  ['Border Run', ['traversal']],
  ['Two Truths', ['two-truths']],
  ['Trends', ['trend-']],
  ['Timeline', ['timeline']],
  ['Ghosts of Empires', ['empire']],
  ['Flashpoint', ['flashpoint']],
  ['Capital Guess', ['capital-guess']],
  ['Star Chart', ['star-chart']],
  ['Terra Incognita', ['terra-incognita']],
  ['Stat Detective', ['stat-detective']],
  ['Flag Palette', ['flag-palette']],
  ['Composition', ['composition']],
  ['Water', ['water-', 'name-that-water']],
  ['Mother Tongue', ['mother-tongue']],
  ['Neighbour Blitz', ['neighbour-']],
  ['Map & Sketch', ['pin-landmark', 'no-mans-land', 'hot-cold', 'silhouette', 'sketch']],
  ['Audio Buzz', ['anthem-', 'tongue-']],
  ['Border Chain', ['border-chain']],
  ['Atlas', ['atlas']],
  ['The Despot', ['manhunt-']],
  ['Unique or Bust', ['unique-']],
  ['Heritage Hunt', ['heritage-hunt']],
  ['Individual Gates', ['individual-']],
  ['Final Gauntlet', ['final-']],
  ['Lobby & Meta', ['lobby', 'tutorial', 'victory']],
  ['Other', ['']],
]

const scenarioGroup = (id: string): string =>
  SCENARIO_GROUPS.find(([, prefixes]) => prefixes.some(prefix => id.startsWith(prefix)))![0]

interface PickerEntry {
  scenario: Scenario
  group: string
  label: string
  slug: string
}

const PICKER_INDEX: PickerEntry[] = scenarios.map(scenario => {
  const group = scenarioGroup(scenario.id)
  return {
    scenario,
    group,
    label: normalizeAnswer(scenario.label, { articles: [] }),
    slug: normalizeAnswer(`${scenario.id} ${group}`, { articles: [] }),
  }
})

const isSubsequence = (needle: string, haystack: string): boolean => {
  let matched = 0
  for (const char of haystack) if (char === needle[matched]) matched++
  return matched >= needle.length
}

/** Hybrid rank per query token: label prefix beats word start beats substring
 *  beats id/group hit beats fuzzy subsequence; -1 rejects the row. */
const tokenRank = (token: string, entry: PickerEntry): number => {
  if (entry.label.startsWith(token)) return 0
  if (entry.label.includes(` ${token}`)) return 1
  if (entry.label.includes(token)) return 2
  if (entry.slug.includes(token)) return 3
  if (isSubsequence(token, entry.label)) return 5
  return -1
}

const pickerRank = (entry: PickerEntry, tokens: string[]): number => {
  let total = 0
  for (const token of tokens) {
    const rank = tokenRank(token, entry)
    if (rank < 0) return -1
    total += rank
  }
  return total
}

type PickerRow =
  | { kind: 'header'; key: string; group: string }
  | { kind: 'item'; key: string; index: number; entry: PickerEntry }

const pickerOpen = ref(false)
const pickerQuery = ref('')
const pickerHighlight = ref(0)
const pickerInput = ref<HTMLInputElement>()
const pickerList = ref<HTMLElement>()

/** Browse mode groups the catalog; a query flattens it to a ranked hit list. */
const pickerRows = computed<PickerRow[]>(() => {
  const tokens = normalizeAnswer(pickerQuery.value, { articles: [] }).split(' ').filter(Boolean)
  let index = 0
  if (!tokens.length) {
    const rows: PickerRow[] = []
    for (const [group] of SCENARIO_GROUPS) {
      const members = PICKER_INDEX.filter(entry => entry.group === group)
      if (!members.length) continue
      rows.push({ kind: 'header', key: `header:${group}`, group })
      for (const entry of members)
        rows.push({ kind: 'item', key: entry.scenario.id, index: index++, entry })
    }
    return rows
  }
  return PICKER_INDEX.map(entry => ({ entry, rank: pickerRank(entry, tokens) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry }) => ({ kind: 'item' as const, key: entry.scenario.id, index: index++, entry }))
})

const pickerItems = computed(() =>
  pickerRows.value.filter((row): row is Extract<PickerRow, { kind: 'item' }> => row.kind === 'item')
)

const keepHighlightInView = () => {
  nextTick(() => {
    const list = pickerList.value
    const item = list?.querySelector<HTMLElement>(`[data-index="${pickerHighlight.value}"]`)
    if (!list || !item) return
    list.scrollTop = listScrollTop(
      list.scrollTop,
      list.clientHeight,
      item.offsetTop,
      item.offsetHeight
    )
  })
}

const openPicker = () => {
  pickerOpen.value = true
  pickerQuery.value = ''
  nextTick(() => {
    pickerInput.value?.focus()
    const current = pickerItems.value.findIndex(row => row.entry.scenario.id === scenarioId.value)
    pickerHighlight.value = Math.max(0, current)
    keepHighlightInView()
  })
}

const closePicker = () => {
  pickerOpen.value = false
}

/** Close only when focus truly leaves the picker; row taps preventDefault on
 *  pointerdown so the filter input keeps focus until the click lands. */
const onPickerFocusOut = (event: FocusEvent) => {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as Node).contains(next)) closePicker()
}

const movePickerHighlight = (delta: number) => {
  const count = pickerItems.value.length
  if (!count) return
  pickerHighlight.value = (pickerHighlight.value + delta + count) % count
  keepHighlightInView()
}

const pick = (id: string) => {
  scenarioId.value = id
  closePicker()
  deal()
}

const pickHighlighted = () => {
  const row = pickerItems.value[pickerHighlight.value]
  if (row) pick(row.entry.scenario.id)
}

watch(pickerQuery, () => {
  pickerHighlight.value = 0
  if (pickerList.value) pickerList.value.scrollTop = 0
})

const deal = () => {
  const scenario = activeScenario.value
  if (!scenario) return
  // Selection survives a refresh: /test-views?scenario=border-chain-easy
  router.replace({ query: { scenario: scenario.id } })
  lastEvent.value = ''
  gameStore.game = scenario.build()
  renderKey.value += 1
  ready.value = true
  armAtlasScenario()
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

    // The scene inside is sized from --viewport-height, so shortening the
    // frame alone leaves it a bar's-worth too tall and its footer lands
    // under the fold. Re-point the variable for the subtree instead.
    --viewport-height: calc(100dvh - #{$harness-bar-height});
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

button {
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
  background: rgb(255 255 255 / 12%);
  border-radius: 6px;
  min-width: 0;
}

.picker {
  display: flex;
  min-width: 0;
}

.picker-toggle {
  gap: 0.5rem;
  display: flex;
  max-width: 46vw;
  align-items: center;
}

.picker-current {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.picker-caret {
  opacity: 0.6;
  font-size: 0.7rem;
}

// Anchored to the bar itself (.controls is the positioned ancestor), so the
// panel stays centred under it and never clips a screen edge on a phone.
.picker-panel {
  top: calc(100% + 0.5rem);
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
  width: min(36rem, calc(100vw - 1rem));
  overflow: hidden;
  box-shadow: 0 12px 32px rgb(0 0 0 / 45%);
  border-radius: 10px;
  background: rgb(20 20 24 / 96%);
  backdrop-filter: blur(6px);
}

.picker-head {
  gap: 0.6rem;
  display: flex;
  padding: 0.6rem;
  align-items: center;

  input {
    flex: 1;
    color: inherit;
    border: 0;
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
    background: rgb(255 255 255 / 10%);
    border-radius: 6px;
    min-width: 0;

    &:focus {
      outline: 1px solid rgb(255 255 255 / 35%);
    }
  }
}

.picker-count {
  opacity: 0.5;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.picker-rows {
  margin: 0;
  padding: 0 0 0.4rem;
  position: relative;
  overflow: auto;
  list-style: none;
  max-height: min(30rem, 62vh);
  overscroll-behavior: contain;
}

.picker-group {
  top: 0;
  z-index: 1;
  opacity: 0.9;
  padding: 0.55rem 0.9rem 0.3rem;
  position: sticky;
  font-size: 0.65rem;
  background: rgb(20 20 24 / 96%);
  letter-spacing: 0.08em;
  text-transform: uppercase;

  &::first-letter {
    color: rgb(255 210 125);
  }
}

.picker-row {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  padding: 0.4rem 0.9rem;
  background: none;
  text-align: left;
  align-items: baseline;
  border-radius: 0;
  justify-content: space-between;

  &.highlighted {
    background: rgb(255 255 255 / 14%);
  }

  &.current .picker-row-label {
    color: rgb(255 210 125);
  }
}

.picker-row-group {
  opacity: 0.5;
  font-size: 0.7rem;
  white-space: nowrap;
}

.picker-empty {
  opacity: 0.6;
  padding: 0.6rem 0.9rem;
  font-size: 0.8rem;
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
