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

      <!-- The same mode, dealt with different data — the rungs that used to be
           scenarios of their own. Only modes that HAVE variants show it. -->
      <div v-if="variantOptions.length" class="group">
        <span class="label">Variant</span>
        <select
          class="variant-select"
          :value="activeVariant?.id"
          @change="pickVariant(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in variantOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
        </select>
        <input
          v-if="activeScenario?.anyCountry"
          v-model="variantQuery"
          class="variant-any"
          aria-label="Deal any country"
          autocomplete="off"
          spellcheck="false"
          placeholder="any country…"
          @keydown.enter.prevent="pickFreeCountry()"
        />
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
import { CITY_PLAN_INDEX, GROUND_PLAN_CITIES } from '~~/data/city-plans.gen'
import { groundPlanHints, groundPlanImage } from '~~/lib/ground-plan'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { MAP_BOUNDS, MAP_REGIONS } from '~~/data/map.gen'
import { isLabelableBox, labelBoxFor } from '~~/lib/geo'
import { TREATIES } from '~~/data/treaties.gen'
import { buildLineup } from '~~/lib/odd-one-out'
import {
  countriesWithGoverningLogo,
  governingParty,
  impostorParties,
  partiesWithLogo,
  partySpectrum,
  SPECTRUM_BANDS,
  shortPartyName,
} from '~~/lib/parties'
import {
  BEAT_POINTS,
  BEAT_SECONDS,
  dealGovernment,
  governmentPool,
  GOVERNMENT_BEATS,
  scoreBeat,
  scoreGovernment,
  type GovernmentAnswer,
  type GovernmentBeat,
  type GovernmentDeal,
} from '~~/lib/government'
import { ROSETTA_RELATIONS } from '~~/lib/rosetta'
import type { OrganizationVector } from '~~/types/organization.type'
import { EMPIRES } from '~~/data/empires.gen'
import { TRENDS } from '~~/lib/trends-data'
import { PLACES } from '~~/data/places.gen'
import { heritagePlaces } from '~~/lib/places'
import { PLAYER_COLORS } from '~~/data/palette'
import { getCorrectRanking, scoreChallengeSubmission } from '~~/lib/challenges'
import { SWEEP_SETS } from '~~/lib/clean-sweep'
import { latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { countryName, getCountry, searchCountriesByName } from '~~/lib/country'
import { REGION_LABELS } from '~~/lib/variant'
import { resolveChallengeView } from '~/components/view/dispatch'
import {
  ATLAS_TABLE_SEED_OPTIONS,
  atlasContinuations,
  atlasTailLetter,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { chainHead, closedDoors, liveChain, openMoves, pickChainSeed } from '~~/lib/chain'
import { createChainSimulator } from '~~/lib/harness/chain-simulator'
import { normalizeAnswer } from '~~/lib/strings'
import { listScrollTop } from '~~/lib/use-viewport'
import { playableCountries, playableWorldCountries } from '~~/lib/game-rules'
import {
  BEAT_VERDICT_HOLD_MS,
  GROUND_PLAN_SECONDS_PER_HINT,
  TIMELINE_BROWSE_CAP_MS,
  groundPlanSeconds,
  isClassicGroupRound,
} from '~~/lib/round-beats'
import { settleGroupRound } from '~~/lib/harness/settle-group-round'
import type { GroupSubmission } from '~~/lib/events/server/grade-group-answer'
import type {
  AtlasChallenge,
  BorderChainChallenge,
  GovernmentChallenge,
} from '~~/types/challenges/group-modes.type'
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
import {
  pickSunsetWindow,
  SUNSET_TUNING,
  sunsetSeconds,
  sunsetWindowAround,
} from '~~/lib/sunset-window'
import { starChartInitials, starChartSeconds } from '~~/lib/star-chart'
import { terraCollapseThreshold, terraSeconds, TERRA_CADENCE_MS } from '~~/lib/terra-incognita'
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
        // The browsable reveal: settle waits on the table (or the cap).
        state.revealDone = []
        state.deadline = Date.now() + TIMELINE_BROWSE_CAP_MS
        return
      }
      state.revealing = false
      state.card++
      state.turn++
      state.deadline = Date.now() + challenge.turnSeconds * 1000
    }, challenge.revealSeconds * 1000)
  }, SIM_LATENCY_MS)
}

/** The reveal's Continue: bank ME as read-on so the button flips to the
 *  waiting label. The harness's rivals never ack, so the cap is the exit —
 *  exactly the partially-read table the real engine backstops. */
const simulateTimelineRevealDone = () => {
  const game = gameStore.game
  const challenge = game ? latestChallengeOfType(game, 'timeline-challenge') : undefined
  if (!challenge?.state.finished) return
  const done = (challenge.state.revealDone ??= [])
  if (!done.includes(ME)) done.push(ME)
}

/**
 * Atlas and Border Chain both ride the shared chain simulator, exactly as they
 * ride one engine on the server: only the link rule differs, and each spec
 * hands back lib/'s own answer rather than reimplementing it.
 */
const gameRules = () => gameStore.game ?? { variant: 'world', difficulty: 'normal' }

const atlasOf = () => {
  const game = gameStore.game
  return game ? latestChallengeOfType(game, 'atlas-challenge') : undefined
}

const atlasPool = () => playableWorldCountries(gameRules())

const atlasOpenMoves = (challenge: AtlasChallenge) => {
  const head = liveChain(challenge.state).at(-1)
  if (!head) return []
  return atlasContinuations(head, challenge.state.chains.flat(), atlasPool(), {
    overlaps: challenge.overlaps,
  })
}

const atlasSim = createChainSimulator<AtlasChallenge>({
  meId: ME,
  current: atlasOf,
  turnSeconds: challenge => challenge.turnSeconds,
  openMoves: atlasOpenMoves,
  buildTrap: (challenge, trappedId, byPlayerId) => {
    const head = liveChain(challenge.state).at(-1)!
    const used = new Set(challenge.state.chains.flat())
    return {
      playerId: trappedId,
      head,
      byPlayerId,
      letter: atlasTailLetter(head),
      spent: atlasContinuations(head, [], atlasPool(), { overlaps: challenge.overlaps }).filter(
        isoCode => used.has(isoCode)
      ),
    }
  },
  reseed: challenge =>
    pickAtlasSeed(gameStore.game!, {
      minOptions: ATLAS_TABLE_SEED_OPTIONS,
      exclude: new Set(challenge.state.chains.flat()),
    }) ?? pickAtlasSeed(gameStore.game!, { minOptions: ATLAS_TABLE_SEED_OPTIONS }),
})

const borderChainOf = () => {
  const game = gameStore.game
  return game ? latestChallengeOfType(game, 'border-chain-challenge') : undefined
}

const borderChainSim = createChainSimulator<BorderChainChallenge>({
  meId: ME,
  current: borderChainOf,
  turnSeconds: challenge => challenge.turnSeconds,
  openMoves: challenge => openMoves(challenge.state, gameRules()),
  buildTrap: (challenge, trappedId, byPlayerId) => ({
    playerId: trappedId,
    head: chainHead(challenge.state)!,
    byPlayerId,
    doors: closedDoors(challenge.state, gameRules()),
  }),
  reseed: challenge =>
    pickChainSeed(gameRules(), new Set(challenge.state.chains.flat())) ??
    pickChainSeed(gameRules()),
})

/** The two chain modes share one wire event, so the live kind picks the sim. */
const chainSim = () => (borderChainOf() ? borderChainSim : atlasSim)

const armChainScenario = () => {
  atlasSim.arm()
  borderChainSim.arm()
}

const governmentOf = () => {
  const game = gameStore.game
  return game ? latestChallengeOfType(game, 'government-challenge') : undefined
}

/**
 * The Government round's beats are server-owned, so the harness has to stand in
 * for the engine to make them PLAYABLE rather than five separate entry points.
 *
 * This mirrors `government-beats.ts` deliberately and minimally: bank the beat
 * through the real `scoreBeat`, bump `turn` (the staleness token), restamp the
 * deadline, and settle onto the round when the questions run out. The rivals
 * answer too — a beat only resolves once the whole table has, which is the rule
 * the engine enforces and the reason a solo click used to look like a no-op.
 *
 * It is a stand-in, not a second engine: nothing here decides scoring or
 * grading, which both come from lib/government.
 */
const governmentDealOf = (challenge: GovernmentChallenge): GovernmentDeal | undefined => {
  const answers = challenge.state.answers
  if (!answers) return undefined
  return {
    country: challenge.country,
    ...(challenge.chamber ? { chamber: challenge.chamber } : {}),
    totalSeats: challenge.totalSeats,
    options: challenge.options,
    governingParty: answers.governingParty,
    blocks: challenge.blocks,
    governingSeats: answers.governingSeats,
    // Seats come from the ANSWERS: `benches[].seats` is stripped from the
    // public payload until beat 3 opens (the governing bench's row is beat 2's
    // answer), so rebuilding a deal has to read them from where they were held.
    benches: challenge.benches.map(bench => {
      const seats = answers.benchSeats?.[bench.name] ?? bench.seats ?? 0
      return {
        ...bench,
        seats,
        share: challenge.totalSeats ? seats / challenge.totalSeats : 0,
        standing: answers.standings[bench.name] ?? 'opposition',
      }
    }),
    sorted: challenge.sorted,
    ...(answers.status ? { status: answers.status } : {}),
    minority: answers.minority,
    ...(answers.backedSeats !== undefined ? { backedSeats: answers.backedSeats } : {}),
  }
}

const governmentAnswerOf = (
  challenge: GovernmentChallenge,
  playerId: string
): GovernmentAnswer => ({
  ...(challenge.state.picks.party[playerId] !== undefined
    ? { party: challenge.state.picks.party[playerId] }
    : {}),
  ...(challenge.state.picks.seats[playerId] !== undefined
    ? { seats: challenge.state.picks.seats[playerId] }
    : {}),
  ...(challenge.state.picks.sides[playerId] !== undefined
    ? { sides: challenge.state.picks.sides[playerId] }
    : {}),
})

/** The rivals answer the live beat — one of them well, one of them badly. */
const answerGovernmentRivals = (challenge: GovernmentChallenge) => {
  const deal = governmentDealOf(challenge)
  if (!deal) return
  const { state } = challenge
  const wrongOption = deal.options.find(option => option.name !== deal.governingParty)
  const wrongBlock = deal.blocks.find(block => block !== deal.governingSeats)
  const truthSides = Object.fromEntries(
    deal.sorted.map(name => {
      const standing = deal.benches.find(bench => bench.name === name)?.standing
      return [name, standing === 'opposition' ? 'opposition' : 'government'] as const
    })
  )

  if (state.beat === 'party') {
    state.picks.party[RIVAL] ??= deal.governingParty
    state.picks.party[THIRD] ??= wrongOption?.name ?? deal.governingParty
  } else if (state.beat === 'seats') {
    state.picks.seats[RIVAL] ??= wrongBlock ?? deal.governingSeats
    state.picks.seats[THIRD] ??= deal.governingSeats
  } else {
    state.picks.sides[RIVAL] ??= truthSides
    state.picks.sides[THIRD] ??= Object.fromEntries(
      deal.sorted.map(name => [name, 'opposition'] as const)
    )
  }
}

/** What the beat's answer was — the engine's `truthOf`, same rules. */
const governmentTruthOf = (beat: GovernmentBeat, deal: GovernmentDeal): string => {
  if (beat === 'party') return deal.governingParty
  if (beat === 'seats') return `${deal.governingSeats}`
  const withGovernment = deal.sorted.filter(
    name => deal.benches.find(bench => bench.name === name)?.standing !== 'opposition'
  )
  return withGovernment.length ? withGovernment.join(', ') : 'nobody'
}

const settleGovernment = (challenge: GovernmentChallenge) => {
  const game = gameStore.game
  const round = game?.rounds[game.rounds.length - 1]
  const deal = governmentDealOf(challenge)
  if (!round || !deal) return
  challenge.state.finished = true
  for (const playerId of Object.keys(game?.players ?? {})) {
    const answer = governmentAnswerOf(challenge, playerId)
    round.groupAnswers[playerId] = {
      submitted: [],
      correct: [],
      governmentBeats: GOVERNMENT_BEATS.map(beat => ({
        beat,
        scored: scoreBeat(beat, deal, answer),
        maximum: BEAT_POINTS[beat],
      })),
    }
    round.playerTurns[playerId] = {
      points: { scored: scoreGovernment(deal, answer), maximum: MAXIMUM_POINTS },
    }
  }
}

/** Bank the live beat and move to the next question, or settle. */
const resolveGovernmentBeat = (challenge: GovernmentChallenge) => {
  const { state } = challenge
  const deal = governmentDealOf(challenge)
  if (deal) {
    for (const playerId of Object.keys(gameStore.game?.players ?? {})) {
      state.scores[playerId] =
        (state.scores[playerId] ?? 0) +
        scoreBeat(state.beat, deal, governmentAnswerOf(challenge, playerId))
    }
  }
  if (deal && state.beat === 'party') state.subject = deal.governingParty
  // The verdict hold, exactly as the engine does it: the beat resolves onto
  // its verdict, and the next question replaces it a beat later.
  if (deal) {
    const scored = Object.fromEntries(
      Object.keys(gameStore.game?.players ?? {}).map(playerId => [
        playerId,
        scoreBeat(state.beat, deal, governmentAnswerOf(challenge, playerId)),
      ])
    )
    state.verdict = { beat: state.beat, truth: governmentTruthOf(state.beat, deal), scored }
  }
  state.turn += 1
  const held = state.turn
  window.setTimeout(() => {
    const current = governmentOf()
    if (!current || current.state.finished || current.state.turn !== held) return
    const resolved = current.state.verdict?.beat ?? current.state.beat
    delete current.state.verdict
    const following = GOVERNMENT_BEATS[GOVERNMENT_BEATS.indexOf(resolved) + 1]
    if (!following) return settleGovernment(current)
    current.state.beat = following
    current.state.turn += 1
    current.state.deadline = Date.now() + BEAT_SECONDS[following] * 1000
    armGovernmentScenario()
  }, BEAT_VERDICT_HOLD_MS)
}

const simulateGovernmentPick = (eventData: Record<string, unknown>) => {
  const challenge = governmentOf()
  if (!challenge || challenge.state.finished) return
  const { state } = challenge
  if (eventData.turn !== state.turn) return
  const pick = (eventData.pick ?? {}) as GovernmentAnswer

  if (state.beat === 'party' && typeof pick.party === 'string') {
    if (state.picks.party[ME] !== undefined) return
    state.picks.party[ME] = pick.party
  } else if (state.beat === 'seats' && typeof pick.seats === 'number') {
    if (state.picks.seats[ME] !== undefined) return
    state.picks.seats[ME] = pick.seats
  } else if (state.beat === 'sides' && pick.sides) {
    if (state.picks.sides[ME] !== undefined) return
    state.picks.sides[ME] = pick.sides
  } else {
    return
  }

  const turn = state.turn
  window.setTimeout(() => {
    const current = governmentOf()
    if (!current || current.state.finished || current.state.turn !== turn) return
    answerGovernmentRivals(current)
    resolveGovernmentBeat(current)
  }, SIM_LATENCY_MS)
}

/** A live beat runs its own clock; when it rings, the beat resolves regardless. */
let governmentTimer: number | undefined
const armGovernmentScenario = () => {
  const challenge = governmentOf()
  window.clearTimeout(governmentTimer)
  if (!challenge || challenge.state.finished) return
  if (!challenge.state.deadline) {
    challenge.state.deadline = Date.now() + BEAT_SECONDS[challenge.state.beat] * 1000
  }
  const turn = challenge.state.turn
  governmentTimer = window.setTimeout(
    () => {
      const current = governmentOf()
      if (!current || current.state.finished || current.state.turn !== turn) return
      answerGovernmentRivals(current)
      resolveGovernmentBeat(current)
    },
    Math.max(0, challenge.state.deadline - Date.now())
  )
}

/**
 * Every classic group round settles through ONE wire event, so a single
 * stand-in carries all of them from the answer to their own scorecard — the
 * reveals that used to need a hand-built scenario each. The turn/beat engines
 * own their own simulators above and are left alone.
 */
const simulateGroupSettle = (eventData: Record<string, unknown>) => {
  const game = gameStore.game
  const round = game ? latestRound(game) : undefined
  if (!game || !round || !isClassicGroupRound(round.groupChallenge)) return
  window.setTimeout(() => {
    // Re-read: the scenario may have been redealt while the latency ran.
    const fresh = gameStore.game
    if (fresh !== game || latestRound(fresh) !== round) return
    void settleGroupRound({
      game,
      round,
      submission: eventData as unknown as GroupSubmission,
      meId: ME,
      onSettled: () => (renderKey.value += 1),
    })
  }, SIM_LATENCY_MS)
}

const installStubSocket = () => {
  gameStore.playerId = ME
  const record = (event: string, eventData: Record<string, unknown>) => {
    lastEvent.value = `${event} ${JSON.stringify(eventData ?? {}).slice(0, 160)}`
    if (event === 'submit-timeline-placement') simulateTimelinePlacement(eventData ?? {})
    if (event === 'timeline-reveal-done') simulateTimelineRevealDone()
    // gate-reveal-done: no sim — the shell's own beat fallback still ends the
    // preview beat, which is exactly the cap path the button exists to beat.
    if (event === 'submit-chain-move') chainSim().move(eventData ?? {})
    if (event === 'chain-ready') chainSim().ready()
    if (event === 'submit-government-pick') simulateGovernmentPick(eventData ?? {})
    if (event === 'submit-group-challenge-answers') simulateGroupSettle(eventData ?? {})
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

const buildGovernmentReveal = (isoCode: ISOCountryCode) => {
  const deal = dealGovernment(GOVERNMENT_RULES, 'normal', isoCode)!
  const truth = Object.fromEntries(
    deal.sorted.map(name => {
      const standing = deal.benches.find(bench => bench.name === name)!.standing
      return [name, standing === 'opposition' ? 'opposition' : 'government'] as const
    })
  )
  // You knew the party and the sides but missed the seat count; your rival
  // only got the seats.
  const answers = {
    you: {
      party: deal.governingParty,
      seats: deal.blocks.find(b => b !== deal.governingSeats),
      sides: truth,
    },
    rival: {
      party: deal.options.find(o => o.name !== deal.governingParty)!.name,
      seats: deal.governingSeats,
      sides: Object.fromEntries(deal.sorted.map(name => [name, 'opposition'] as const)),
    },
  }
  const beatsFor = (answer: (typeof answers)['you']) =>
    GOVERNMENT_BEATS.map(beat => ({
      beat,
      scored: scoreBeat(beat, deal, answer),
      maximum: BEAT_POINTS[beat],
    }))

  const game = mockGame('group-challenge', [
    groupRound({
      _type: 'government-challenge',
      country: deal.country,
      ...(deal.chamber ? { chamber: deal.chamber } : {}),
      totalSeats: deal.totalSeats,
      options: deal.options,
      blocks: deal.blocks,
      benches: deal.benches.map(({ name, seats, share, color, logo }) => ({
        name,
        seats,
        share,
        ...(color ? { color } : {}),
        ...(logo ? { logo } : {}),
      })),
      sorted: deal.sorted,
      maximumPoints: MAXIMUM_POINTS,
      state: {
        beat: 'sides',
        turn: 3,
        deadline: Date.now(),
        picks: { party: {}, seats: {}, sides: {} },
        scores: {},
        finished: true,
        // The reveal is the one moment these ride the snapshot.
        answers: {
          governingParty: deal.governingParty,
          governingSeats: deal.governingSeats,
          standings: Object.fromEntries(
            deal.benches.map(bench => [bench.name, bench.standing] as const)
          ),
          minority: deal.minority,
          ...(deal.backedSeats !== undefined ? { backedSeats: deal.backedSeats } : {}),
        },
      },
    }),
  ])
  const round = game.rounds[game.rounds.length - 1]!
  const seats = Object.keys(game.players)
  for (const [index, playerId] of seats.entries()) {
    const answer = index === 0 ? answers.you : answers.rival
    round.groupAnswers[playerId] = {
      submitted: [],
      correct: [],
      governmentBeats: beatsFor(answer),
    }
    round.playerTurns[playerId] = {
      points: { scored: scoreGovernment(deal, answer), maximum: MAXIMUM_POINTS },
    }
  }
  return game
}

const groupRound = (groupChallenge: unknown): Round =>
  ({ groupChallenge, groupAnswers: {}, playerTurns: {} }) as unknown as Round

/**
 * A Ground Plan round for one roster city, at whichever cut the variant asks
 * for. Reads the shipped roster rather than a fixture so the harness always
 * offers exactly the cities that have tiles.
 */
const groundPlanGame = (city: string | undefined, signature: boolean): Game => {
  const entry =
    GROUND_PLAN_CITIES.find(candidate => candidate.city === city) ?? GROUND_PLAN_CITIES[0]
  const cut = entry.cuts.find(candidate => candidate.signature === signature) ?? entry.cuts[0]
  const decoys = GROUND_PLAN_CITIES.filter(other => other.city !== entry.city)
    .slice(0, 3)
    .map(other => other.city)
  const hints = signature ? groundPlanHints(entry) : []

  return mockGame('group-challenge', [
    groupRound({
      _type: 'ground-plan-challenge',
      country: entry.country,
      city: entry.city,
      cut,
      crossings: CITY_PLAN_INDEX[cut.slug]?.crossings ?? 0,
      ...(entry.lesson ? { lesson: entry.lesson } : {}),
      ...(groundPlanImage(entry) ? { image: groundPlanImage(entry) } : {}),
      layers: ['fabric', 'arterials', 'rail', 'bridges'],
      secondsPerLayer: 8,
      // Hints ride the non-hard variant, matching how the dealer splits them.
      ...(signature ? { hints } : {}),
      secondsPerHint: GROUND_PLAN_SECONDS_PER_HINT,
      // The signature cut offers the option table; the generic one free-types,
      // which is how the dealer splits them by difficulty.
      ...(signature ? { options: [entry.city, ...decoys].sort(), maximumGuesses: 2 } : {}),
      durationSeconds: groundPlanSeconds(4, hints.length),
      maximumPoints: MAXIMUM_POINTS,
    }),
  ])
}

/**
 * A deal of the SAME mode with different data — the anthem's country, a
 * zoom-out's geometry, a leader's party chip. These used to be top-level
 * scenarios, which buried the modes among their own edge cases; as variants
 * they stay one keystroke away without crowding the catalog.
 */
interface Variant {
  id: string
  label: string
  /** The country a free pick replaces, when the mode takes one. */
  country?: ISOCountryCode
  /**
   * A rung that deals its own game. Beat-states a round now REACHES by playing
   * (a briefing card, a sprung trap, the reveal) stay one keystroke away here
   * rather than standing as scenarios of their own.
   */
  build?: () => Game
}

interface Scenario {
  id: string
  label: string
  /**
   * Override for the views that route OUTSIDE `resolveChallengeView` — the
   * synthetic galleries, the lobby and the tutorial. Leave it off and the
   * harness renders whatever the REAL dispatcher resolves for the pinned
   * seat's phase, so a round that plays through to its settle lands on the
   * scorecard by itself instead of needing a second scenario for the reveal.
   */
  component?: Component
  /** Curated rungs; the first is the default deal. */
  variants?: Variant[]
  /** True when a variant may name ANY country, not just a curated rung. */
  anyCountry?: boolean
  build: (variant?: Variant) => Game
}

const landmark = PLACES['eiffel-tower']
const heritageSlugs = heritagePlaces().map(([slug]) => slug)

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

/** The Tongues rungs: a language, its clip files, and who speaks it. Swahili is
 *  spoken across four countries, so the any-speaker rule shows in its reveal. */
const TONGUE_RUNGS: {
  [id: string]: {
    language: string
    clipCodes: string[]
    countries: ISOCountryCode[]
    /** Hindi has no anthem sung in it (India's is Bengali), so it seeds. */
    seeded?: boolean
    /** Regional boards scope the answer set — and the copy that describes it. */
    scope?: 'europe'
  }
} = {
  // A Europe board asking for French: buzzing Senegal is right about the world
  // and off this board, so it must bounce free rather than lock the buzzer out.
  'french-europe': {
    language: 'French',
    clipCodes: ['fr-0'],
    countries: ['FR', 'BE', 'LU', 'MC', 'CH'],
    scope: 'europe',
  },
  swahili: {
    language: 'Swahili',
    clipCodes: ['sw-0', 'sw-1', 'sw-2'],
    countries: ['TZ', 'KE', 'UG', 'RW'],
  },
  ukrainian: {
    language: 'Ukrainian',
    clipCodes: ['uk-0', 'uk-1', 'uk-2'],
    countries: ['UA'],
  },
  hindi: {
    language: 'Hindi',
    clipCodes: ['hi-0'],
    countries: ['IN'],
    seeded: true,
  },
}

const GOVERNMENT_RULES = {
  difficulty: 'normal',
  variant: 'world',
  includeMicroNations: false,
} as const

/** The chambers the mode can deal — the dealer's own pool, sorted by name so
 *  the picker reads alphabetically rather than in data order. */
const GOVERNMENT_COUNTRIES = [...governmentPool(GOVERNMENT_RULES, 'normal')].sort((a, b) =>
  countryName(a).localeCompare(countryName(b))
)

/** One chamber, parked at a beat so the round plays on from there. */
const governmentBeatGame = (
  beat: GovernmentBeat,
  index: number,
  isoCode: ISOCountryCode = 'SE'
): Game => {
  const deal = dealGovernment(GOVERNMENT_RULES, 'normal', isoCode)!
  return mockGame('group-challenge', [
    groupRound({
      _type: 'government-challenge',
      country: deal.country,
      ...(deal.chamber ? { chamber: deal.chamber } : {}),
      totalSeats: deal.totalSeats,
      options: deal.options,
      blocks: deal.blocks,
      benches: deal.benches.map(({ name, seats, share, color, logo }) => ({
        name,
        seats,
        share,
        ...(color ? { color } : {}),
        ...(logo ? { logo } : {}),
      })),
      sorted: deal.sorted,
      maximumPoints: MAXIMUM_POINTS,
      state: {
        beat,
        turn: index,
        deadline: Date.now() + BEAT_SECONDS[beat] * 1000,
        picks: { party: {}, seats: {}, sides: {} },
        scores: {},
        // Published by the engine once beat 1 resolves, so beats 2 and 3 can
        // name the party they are about.
        ...(beat === 'party' ? {} : { subject: deal.governingParty }),
        // The harness stands in for the engine, so it holds what the engine
        // holds in its side key — without these the beats play but nothing can
        // be graded, and the round never reaches its reveal.
        answers: {
          governingParty: deal.governingParty,
          governingSeats: deal.governingSeats,
          standings: Object.fromEntries(
            deal.benches.map(bench => [bench.name, bench.standing] as const)
          ),
          minority: deal.minority,
          ...(deal.backedSeats !== undefined ? { backedSeats: deal.backedSeats } : {}),
        },
      },
    }),
  ])
}

const scenarios: Scenario[] = [
  {
    id: 'ranking',
    label: 'Ranking (5 tiles)',
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
    // GB and FI carry a note; the other three don't, so one scenario shows
    // both the qualified and the bare row.
    id: 'ranking-marriage-notes',
    label: 'Ranking reveal (per-country notes)',
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
    build: () =>
      mockGame('group-scores', [
        settledRound('people.netMigration', ['SY', 'LB', 'AE', 'QA', 'US']),
      ]),
  },
  {
    id: 'anthem-scores',
    label: 'Opening Ceremony scores (buzz race)',
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
    id: 'pyramid-scheme',
    label: 'Pyramid scheme (drag countries onto their shapes)',
    variants: [
      { id: 'normal', label: 'Normal — four subjects' },
      // Hard deals five, which is where the phone's two-abreast board runs to
      // three rows and has to stay on one screen.
      { id: 'hard', label: 'Hard — five subjects' },
    ],
    build: variant =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'pyramid-scheme-challenge',
          // The four extremes, so every axis the round reads on is on screen:
          // Niger's triangle, Japan's coffin, Qatar's migrant slab and the US
          // barrel between them.
          countries:
            variant?.id === 'hard' ? ['NE', 'JP', 'QA', 'US', 'DE'] : ['NE', 'JP', 'QA', 'US'],
          distinctnessFloor: variant?.id === 'hard' ? 16 : 22,
          durationSeconds: variant?.id === 'hard' ? 50 : 55,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'pyramid-scheme-reveal',
    label: 'Pyramid scheme — reveal (two right, two wrong)',
    build: () => {
      const countries: ISOCountryCode[] = ['DE', 'NE', 'QA', 'JP']
      const game = mockGame('group-scores', [
        groupRound({
          _type: 'pyramid-scheme-challenge',
          countries,
          distinctnessFloor: 22,
          durationSeconds: 55,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ])
      const round = game.rounds[game.rounds.length - 1]!
      // Germany and Niger matched; Qatar and Japan swapped — so the card has to
      // render both verdicts, a hand-written scar and a derived lesson.
      for (const playerId of Object.keys(game.players)) {
        round.groupAnswers[playerId] = {
          submitted: ['DE', 'NE', 'JP', 'QA'],
          correct: countries,
        }
        round.playerTurns[playerId] = {
          points: { scored: Math.round(MAXIMUM_POINTS / 2), maximum: MAXIMUM_POINTS },
        }
      }
      return game
    },
  },
  {
    id: 'trend-race',
    label: 'Trend race (pick → reveal on click)',
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
    id: 'timeline-reveal',
    label: 'Timeline (finished, scorecard)',
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
            deadline: Date.now() + 60000,
            finished: true,
            revealDone: [RIVAL],
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
    id: 'ground-plan',
    label: 'Ground Plan (signature cut)',
    // One scenario per variant rather than per city: the roster runs to well
    // over a hundred cities, and a scenario each would bury every other mode
    // in the picker.
    //
    // EVERY city is listed in both scenarios, not just the ones holding a cut
    // of that kind. A third of the roster is generic-only — the capitals whose
    // centres are honestly not diagnostic — and listing them in one picker
    // alone left them findable only by knowing that in advance. A city with no
    // cut of the asked-for kind falls back to the one it has, and its label
    // says so.
    variants: GROUND_PLAN_CITIES.map(entry => ({
      id: entry.city,
      label: entry.cuts.some(cut => cut.signature) ? entry.city : `${entry.city} (generic only)`,
    })),
    build: variant => groundPlanGame(variant?.id, true),
  },
  {
    id: 'ground-plan-generic',
    label: 'Ground Plan (generic cut, free-typed)',
    variants: GROUND_PLAN_CITIES.map(entry => ({
      id: entry.city,
      label: entry.cuts.some(cut => !cut.signature) ? entry.city : `${entry.city} (signature only)`,
    })),
    build: variant => groundPlanGame(variant?.id, false),
  },
  {
    id: 'capital-guess',
    label: 'Capital guess (options)',
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
    // One mode, its three beats and its reveal. The harness stands in for the
    // beats engine, so picking a rung starts the round THERE and plays on.
    id: 'government',
    label: 'Government (who governs, and with whom)',
    // Every chamber the mode can actually deal, straight from `governmentPool`
    // — the dealer's own definition of playable, so this list can never offer
    // a country the round would refuse. Each rung opens at beat 1 and the
    // harness's beats stand-in plays it through to its own reveal.
    variants: [
      ...GOVERNMENT_COUNTRIES.map(isoCode => ({
        id: isoCode,
        label: countryName(isoCode),
        country: isoCode,
        build: () => governmentBeatGame('party', 0, isoCode),
      })),
      // The payoff, jumped to directly: a settled round with two seats who
      // answered differently. Points come from the REAL scorer, so the per-beat
      // pips and the totals can never drift from what the engine would bank.
      ...GOVERNMENT_COUNTRIES.map(isoCode => ({
        id: `reveal-${isoCode}`,
        label: `Reveal — ${countryName(isoCode)}`,
        country: isoCode,
        build: () => buildGovernmentReveal(isoCode),
      })),
    ],
    // 92 chambers is 184 rungs with the reveals, which is more than a <select>
    // can be read. Typing an ISO code or a country name jumps straight to one.
    anyCountry: true,
    // Never dealt: a variant always wins, and the first chamber is the default.
    build: () => governmentBeatGame('party', 0, GOVERNMENT_COUNTRIES[0]),
  },
  {
    // Hard mode: no initials, and the stars reach for the deeper field —
    // Ulaanbaatar, Tashkent, Vientiane, Asunción, Windhoek.
    id: 'star-chart-hard',
    label: 'Star chart (hard, no aid)',
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
    // Central & eastern Europe failing, which is what the mode actually deals:
    // one neighbourhood, cropped to (terraTheatre drives the camera), none of
    // the five touching so no two blanks can merge into one.
    id: 'terra-incognita',
    label: 'Terra Incognita (the atlas fails)',
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'terra-incognita-challenge',
          vanishings: ['AL', 'MD', 'SK', 'LT', 'BA'],
          cadenceMs: TERRA_CADENCE_MS.normal,
          collapseThreshold: terraCollapseThreshold(5, 'normal'),
          durationSeconds: terraSeconds(5, TERRA_CADENCE_MS.normal),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'flashpoint',
    label: 'Flashpoint (options)',
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
    id: 'ranking-years-at-war',
    label: 'Ranking (years at war, scale bar)',
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
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'stat-detective-challenge',
          country: 'IT',
          // A full ladder, and one plotted stat of each ScaleTone: share65Plus
          // (neutral), equality (inverted), democracyIndex (positive) — the
          // clue pile that used to squeeze the console off the bottom edge.
          clues: [
            'people.population',
            'geography.area.total',
            'economics.gdpPerCapita',
            'government.corruptionIndex',
            'people.share65Plus',
            'economics.equality',
            'government.democracyIndex',
          ],
          secondsPerClue: 4,
          region: 'Europe',
          photo: '/capitals/IT.webp',
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'pin-landmark',
    label: 'Pin the landmark (photo dock)',
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
    id: 'mother-tongue-regional',
    label: 'Mother tongue (Europe board — off-board speakers bounce)',
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'mother-tongue-challenge',
          language: 'French',
          // The Europe board's answer set. Burundi and Senegal speak French
          // but stand off it: they must bounce free, not score as misses.
          countries: ['FR', 'BE', 'LU', 'MC', 'CH'],
          scope: 'europe',
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'mother-tongue-regional-reveal',
    label: 'Mother tongue — Europe board scorecard (scoped "spoken" label)',
    build: () => {
      const countries: ISOCountryCode[] = ['FR', 'BE', 'LU', 'MC', 'CH']
      const game = mockGame('group-scores', [
        groupRound({
          _type: 'mother-tongue-challenge',
          language: 'French',
          countries,
          scope: 'europe',
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ])
      const round = game.rounds[game.rounds.length - 1]!
      for (const playerId of Object.keys(game.players)) {
        round.groupAnswers[playerId] = {
          // France and Belgium found; Grenada is a real miss. Burundi and
          // Senegal never reach here at all — the round vetoes them.
          submitted: ['FR', 'BE', 'GD'],
          correct: countries,
        }
        round.playerTurns[playerId] = {
          points: { scored: Math.round(MAXIMUM_POINTS / 2), maximum: MAXIMUM_POINTS },
        }
      }
      return game
    },
  },
  {
    id: 'neighbour-blitz',
    label: 'Neighbour blitz (typed)',
    build: () =>
      mockGame('group-challenge', [
        groupRound({
          _type: 'neighbour-blitz-challenge',
          // Italy on a normal board: San Marino and the Holy See really border
          // it but are benched out of the key, so naming them must bounce free.
          country: 'IT',
          neighbours: ['FR', 'CH', 'AT', 'SI'],
          durationSeconds: 45,
          maximumPoints: MAXIMUM_POINTS,
        }),
      ]),
  },
  {
    id: 'name-that-water',
    label: 'Name that water (typed, hints)',
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
    // Each rung is a deliberate stress case for the lyric wall; the free pick
    // deals any country's anthem, which is how a missing clip or an uncurated
    // wall gets seen. Sweden is the reference country (the only fully curated
    // wall so far — see public/anthems/lyrics/readme-anthems.md).
    variants: [
      { id: 'sweden', label: 'Sweden — reference lyric wall', country: 'SE' },
      // A two-colour flag where one colour is the milk tone, so the field has
      // to carry the hint on crimson alone.
      { id: 'poland', label: 'Poland — white-as-primary palette', country: 'PL' },
      // Kimigayo, the shortest anthem in the world: a five-line CJK wall with a
      // masked 君が代 span — glyph fallback and mask sizing in one deal.
      { id: 'japan', label: 'Japan — shortest anthem, CJK wall', country: 'JP' },
      // The longest anthem text in the world, 21 lines across 6 verses: the
      // drift-scroll's stress test, where any reflow regression shows first.
      { id: 'uruguay', label: 'Uruguay — longest anthem wall', country: 'UY' },
      // Both sources 404 on purpose: the round must arm and run silent rather
      // than strand the table behind a dead play button.
      { id: 'broken-clip', label: 'Unloadable clip (404s on purpose)', country: 'SE' },
    ],
    anyCountry: true,
    build: variant => {
      const isoCode = variant?.country ?? 'SE'
      const broken = variant?.id === 'broken-clip'
      const clipCode = broken ? 'missing' : isoCode
      return mockGame('group-challenge', [
        groupRound({
          _type: 'anthem-buzz-challenge',
          country: isoCode,
          clip: { webm: `/anthems/${clipCode}.webm`, m4a: `/anthems/${clipCode}.m4a` },
          // The broken rung carries no wall on purpose: a dead clip must not
          // be rescued by lyrics that happen to exist.
          ...(broken ? {} : { lyricsUrl: `/anthems/lyrics/${isoCode}-anthem.json` }),
          durationSeconds: 30,
          region: REGION_LABELS[getCountry(isoCode).region],
          ...(broken ? {} : { swatches: flagSwatches(isoCode) }),
          initial: countryName(isoCode).slice(0, 1),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ])
    },
  },
  {
    id: 'tongue-buzz',
    label: 'Tongues (speech audio)',
    // Each rung is a different path through the writing wall: the common case
    // (borrow the speaker country's anthem lines), a seeded sample, and the
    // degenerate one-clip sequence.
    variants: [
      { id: 'french-europe', label: 'French on a Europe board — off-board buzz bounces' },
      { id: 'swahili', label: 'Swahili — three voices, four speakers' },
      { id: 'ukrainian', label: 'Ukrainian — borrowed anthem wall, Cyrillic' },
      { id: 'hindi', label: 'Hindi — seeded sample, one clip' },
    ],
    build: variant => {
      const rung = TONGUE_RUNGS[variant?.id ?? 'swahili'] ?? TONGUE_RUNGS.swahili!
      return mockGame('group-challenge', [
        groupRound({
          _type: 'tongue-buzz-challenge',
          language: rung.language,
          clips: rung.clipCodes.map(code => ({
            webm: `/tongues/${code}.webm`,
            m4a: `/tongues/${code}.m4a`,
          })),
          countries: rung.countries,
          ...(rung.scope ? { scope: rung.scope } : {}),
          durationSeconds: 20,
          region: REGION_LABELS[getCountry(rung.countries[0]!).region],
          speakerCount: rung.countries.length,
          // Only the seeded rung carries a sample; the others must fall back
          // to the speaker country's own anthem wall.
          ...(rung.seeded ? { sample: seededTongueSample(rung.language) } : {}),
          initial: countryName(rung.countries[0]!).slice(0, 1),
          maximumPoints: MAXIMUM_POINTS,
        }),
      ])
    },
  },
  {
    id: 'sketch',
    label: 'Sketch (canvas)',
    build: () =>
      mockGame('group-challenge', [
        groupRound({ _type: 'sketch-challenge', country: 'FR', maximumPoints: MAXIMUM_POINTS }),
      ]),
  },
  {
    id: 'border-chain',
    label: 'Border chain (your turn, strait hops)',
    // The beats this round now REACHES by playing, kept a keystroke away.
    variants: [
      {
        id: 'live',
        label: 'Your turn — strait hops',
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
        id: 'briefing',
        label: 'Briefing — rules card, one rival ready',
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
        id: 'easy',
        label: 'Easy — 20s clock, ISO chips on open moves',
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
        id: 'europe',
        label: 'Europe board, world dimmed',
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
        id: 'spectate',
        label: 'Eliminated, spectating',
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
        id: 'trap',
        label: 'Dead-end hold — someone else trapped',
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
        id: 'trapped-me',
        label: 'Dead-end hold — you are trapped',
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
        id: 'trap-reveal',
        label: 'Reveal — trapped by a rival',
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
        id: 'reveal',
        label: 'Reveal — finished, replay',
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
    ],
    // Never dealt: a variant always wins, and 'live' is the default rung.
    build: () => mockGame('group-challenge', []),
  },
  {
    id: 'manhunt-detective',
    label: 'The Despot (detective, hunt beat, candidates painted)',
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
    id: 'heritage-hunt',
    label: 'Heritage hunt (live beat)',
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
    build: () => individualGame({ variant: 'find', id: 'flag', country: 'SY' }),
  },
  {
    id: 'individual-flag-pick',
    label: 'Individual: flag pick',
    build: () => individualGame({ variant: 'flag-pick', options: ['NL', 'LU', 'FR', 'RU'] }),
  },
  {
    id: 'individual-flag-twins',
    label: 'Individual: flag twins (palette lookalikes)',
    build: () =>
      individualGame({ variant: 'flag-twins', country: 'ID', options: ['ID', 'MC', 'PL', 'SG'] }),
  },
  {
    id: 'individual-money-match',
    label: 'Individual: money match (banknote)',
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
    // Rulers: the real gate, dealt by the real dealer. The map IS the
    // interface — every framed country wears its government's logo except one,
    // which wears an opposition party from its own country.
    id: 'individual-rulers',
    label: 'Individual: rulers (spot the party not in government)',
    // Seeds that once broke the sizing: the frame is grown from the seed, so
    // each of these assembles a different mix of country sizes and logo shapes.
    variants: [
      { id: 'AT', label: 'Austria — the ordinary deal', country: 'AT' },
      { id: 'RO', label: 'Romania — big country, square crest', country: 'RO' },
      { id: 'DE', label: 'Germany — widest neighbourhood', country: 'DE' },
    ],
    build: variant => {
      // The dealer is async (it imports map geometry), and `build` is not — so
      // the harness assembles one deal from the same lib helpers the dealer
      // uses. The impostor test is the LOGO FILE, exactly as `impostorParties`
      // does it.
      // Grown from the eligible pool by proximity, exactly as `dealRulers`
      // does: a hardcoded neighbourhood lights countries nobody can answer
      // (Hungary's government carries no logo, Slovenia's does not resolve).
      const seed: ISOCountryCode = (variant?.country as ISOCountryCode) ?? 'AT'
      const near = (isoCode: ISOCountryCode) => {
        const box = MAP_BOUNDS[isoCode as keyof typeof MAP_BOUNDS]
        const from = MAP_BOUNDS[seed as keyof typeof MAP_BOUNDS]
        return box && from ? Math.hypot(box[0] - from[0], box[1] - from[1]) : Infinity
      }
      // The SAME labelability gate the logo layer applies — without it the
      // nearest neighbours include Liechtenstein and Luxembourg, which are too
      // small to carry a logo and render as lit-but-empty countries.
      const lineup = countriesWithGoverningLogo()
        .filter(isoCode =>
          isLabelableBox(
            labelBoxFor(
              MAP_BOUNDS[isoCode as keyof typeof MAP_BOUNDS],
              MAP_REGIONS[isoCode as keyof typeof MAP_REGIONS]
            )
          )
        )
        .sort((a, b) => near(a) - near(b))
        .slice(0, 5)
      const victim = lineup[1]!
      const impostor = impostorParties(victim)[0]
      const dressed = lineup.flatMap(isoCode => {
        const party = isoCode === victim ? impostor : governingParty(isoCode)
        return party?.logo ? [[isoCode, party] as const] : []
      })
      const logos = Object.fromEntries(dressed.map(([isoCode, party]) => [isoCode, party.logo!]))
      const names = Object.fromEntries(
        dressed.map(([isoCode, party]) => [isoCode, shortPartyName(party)])
      )
      // The shapes, exactly as `dealRulers` passes them — without these the
      // stage falls back to square boxes and the harness would be previewing
      // the bug rather than the fix.
      const ratios = Object.fromEntries(
        dressed.flatMap(([isoCode, party]) => (party.logoRatio ? [[isoCode, party.logoRatio]] : []))
      )
      const governing = governingParty(victim)
      return individualGame({
        variant: 'rulers',
        country: victim,
        rulers: {
          lineup,
          logos,
          names,
          ratios,
          trueLogo: { [victim]: governing?.logo ?? '' },
          ...(governing?.logoRatio ? { trueRatio: { [victim]: governing.logoRatio } } : {}),
          impostor: { name: impostor?.name ?? '' },
          governing: { name: governing?.name ?? '' },
        },
      })
    },
  },
  {
    id: 'individual-zoom-out',
    label: 'Individual: zoom-out (typed)',
    // The opening frame must hold target land, so every rung here is a shape
    // that once broke it. Check them with the keyboard UP — the worst case.
    variants: [
      { id: 'MY', label: 'Malaysia — the ordinary deal', country: 'MY' },
      { id: 'GM', label: 'Gambia — small country', country: 'GM' },
      { id: 'EE', label: 'Estonia — the crop that opened in Latvia', country: 'EE' },
      { id: 'NO', label: 'Norway — concave, box centre on a neighbour', country: 'NO' },
      { id: 'CL', label: 'Chile — longest pan', country: 'CL' },
      { id: 'US', label: 'United States — widest interior', country: 'US' },
    ],
    anyCountry: true,
    build: variant => individualGame({ variant: 'zoom-out', country: variant?.country ?? 'MY' }),
  },
  {
    id: 'individual-border-detective',
    label: 'Individual: border detective (timed, hint)',
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
    build: () => individualGame({ variant: 'outline-reveal', country: 'ZA' }),
  },
  {
    id: 'individual-higher-lower',
    label: 'Individual: higher/lower duel',
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
    // The reveal's party chip degrades across these rungs, so a logo-less or
    // unresolved party is as easy to eyeball as the happy path. A free pick
    // deals the country against its own regional neighbours.
    variants: [
      { id: 'DE', label: 'Germany — the ordinary deal', country: 'DE' },
      { id: 'SV', label: 'El Salvador — widest wordmark', country: 'SV' },
      { id: 'AL', label: 'Albania — tallest roundel', country: 'AL' },
      { id: 'BD', label: 'Bangladesh — ideology, no band', country: 'BD' },
      { id: 'UA', label: 'Ukraine — independent, no party', country: 'UA' },
    ],
    anyCountry: true,
    build: variant => {
      const isoCode = variant?.country ?? 'DE'
      return individualGame({
        variant: 'leader-pick',
        country: isoCode,
        options: leaderPickOptions(isoCode),
      })
    },
  },
  {
    id: 'individual-logo-politics',
    label: 'Individual: logo politics (origin)',
    build: () =>
      individualGame({
        variant: 'logo-politics',
        country: 'DE',
        options: ['DE', 'FR', 'IT', 'ES'],
        partyLogo: {
          image: partiesWithLogo('DE')[0]?.logo ?? '',
          name: partiesWithLogo('DE')[0]?.name ?? '',
          ask: 'origin',
        },
      }),
  },
  {
    id: 'individual-logo-ruling',
    label: 'Individual: logo politics (does it govern?)',
    build: () => {
      // Built from the real join so the scenario answers what the dealer would:
      // Germany's actual governing party, claimed truthfully.
      const governing = governingParty('DE')
      return individualGame({
        variant: 'logo-politics',
        country: 'DE',
        partyLogo: {
          image: governing?.logo ?? partiesWithLogo('DE')[0]?.logo ?? '',
          name: governing?.name ?? partiesWithLogo('DE')[0]?.name ?? '',
          ask: 'ruling',
          rules: true,
        },
      })
    },
  },
  {
    id: 'individual-logo-spectrum',
    label: 'Individual: logo politics (spectrum)',
    build: () => {
      const party = partiesWithLogo('DE').find(candidate => partySpectrum(candidate))
      return individualGame({
        variant: 'logo-politics',
        country: 'DE',
        partyLogo: {
          image: party?.logo ?? '',
          name: party?.name ?? '',
          ask: 'spectrum',
          band: party ? partySpectrum(party) : undefined,
          bands: [...SPECTRUM_BANDS],
        },
      })
    },
  },
  {
    id: 'individual-leader-find-easy',
    label: 'Individual: leader find (easy — portrait + facts)',
    build: () => leaderFindGame('easy'),
  },
  {
    id: 'individual-leader-find-normal',
    label: 'Individual: leader find (normal — facts only)',
    build: () => leaderFindGame('normal'),
  },
  {
    id: 'individual-leader-find-hard',
    label: 'Individual: leader find (hard — bare question)',
    build: () => leaderFindGame('hard'),
  },
  {
    id: 'individual-landmark-quiz',
    label: 'Individual: landmark quiz (photo)',
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
    build: () => longAtlasGame(false),
  },
  {
    id: 'atlas-long-reveal',
    label: 'Atlas (marathon chain — reveal card scroll)',
    build: () => longAtlasGame(true),
  },
  {
    id: 'individual-atlas-easy',
    label: 'Individual: atlas (easy — suggestions from 3 letters)',
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
    id: 'individual-far-flung-small',
    label: 'Individual: far flung (Príncipe — smallest fragment)',
    build: () =>
      individualGame({
        id: 'isoCode',
        variant: 'far-flung',
        country: 'ST',
        farFlung: { slug: 'principe' },
        options: ['ST', 'GQ', 'GA', 'CM'],
      }),
  },
  {
    id: 'individual-far-flung-hard',
    label: 'Individual: far flung (hard — Nakhchivan, typed)',
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
    id: 'atlas',
    label: 'Atlas (your turn, letter ties)',
    // The beats this round now REACHES by playing, kept a keystroke away.
    variants: [
      {
        id: 'live',
        label: 'Your turn — letter ties',
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
        id: 'easy',
        label: 'Easy — 20s turns, ringed answers, suggestions',
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
        id: 'hard',
        label: 'Hard — overlap rule, deep tie badge',
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
        id: 'briefing',
        label: 'Briefing — rules card, one rival ready',
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
        id: 'trap',
        label: 'Trap — the letter Q is spent',
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
        id: 'reveal',
        label: 'Reveal — placements and missed outs',
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
    ],
    // Never dealt: a variant always wins, and 'live' is the default rung.
    build: () => mockGame('group-challenge', []),
  },
  {
    id: 'final-gauntlet-easy',
    label: 'Final gauntlet (easy, dealt)',
    build: () => gauntletGame('easy'),
  },
  {
    id: 'final-gauntlet-normal',
    label: 'Final gauntlet (normal, dealt)',
    build: () => gauntletGame('normal'),
  },
  {
    id: 'final-gauntlet-hard',
    label: 'Final gauntlet (hard, dealt)',
    build: () => gauntletGame('hard'),
  },
  {
    id: 'final-membership',
    label: 'Final: membership (odd one out)',
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
    label: 'Final: sunset blitz (typed, window around Croatia)',
    build: () => finalGame([sunsetFixture('hard', 'HR')]),
  },
  {
    id: 'final-sunset-dealt',
    label: 'Final: sunset blitz (typed, a fresh window each load)',
    build: () => finalGame([sunsetFixture('normal')], 'normal'),
  },
  {
    id: 'final-city-nocturne',
    label: 'Final: city nocturne (typed)',
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
    build: () => finalGame([{ _type: 'born-challenge', year: 1990, quota: 3 }]),
  },
  {
    id: 'final-made',
    label: 'Final: made in (exports)',
    build: () => finalGame([{ _type: 'made-challenge', commodity: 'cocoa beans' }]),
  },
  {
    id: 'final-endonym',
    label: 'Final: endonym (own names)',
    build: () =>
      finalGame([
        { _type: 'endonym-challenge', countries: ['FI', 'DE', 'CN', 'EG', 'HR'], quota: 3 },
      ]),
  },
  {
    id: 'final-diaspora',
    label: 'Final: diaspora (where the born-in live)',
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
    build: () => finalGame([{ _type: 'language-challenge', language: 'Portuguese' }]),
  },
  {
    id: 'final-leadership',
    label: 'Final: leadership',
    build: () => finalGame([{ _type: 'leadership-challenge', country: 'FR' }]),
  },
  {
    id: 'final-region',
    label: 'Final: region',
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
    build: () => {
      const game = mockGame('victory', [settledRound(), settledRound(), settledRound()])
      game.players[ME]!.completedAtRound = 3
      return game
    },
  },
]

/** The gauntlet reads its payload off the player's pending move. */
/** The window a real deal would frame — anchored on `seed` for a pinned
 *  scene, or wherever the dealer lands when no seed is given. */
const sunsetFixture = (difficulty: GameDifficulty, seed?: ISOCountryCode): FinalChallengeItem => {
  const pool = playableCountries({ variant: 'world', difficulty, includeMicroNations: false })
  const window = seed
    ? sunsetWindowAround(pool, difficulty, seed)
    : pickSunsetWindow(pool, difficulty)
  if (!window) throw new Error('No sunset window on this board')
  return {
    _type: 'sunset-blitz-challenge',
    frame: window.frame,
    countries: window.countries,
    quotaRatio: SUNSET_TUNING[difficulty].quotaRatio,
    durationSeconds: sunsetSeconds(window.countries.length, difficulty),
  }
}

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
/** A leader-pick lineup: the country plus three from its own region, so a
 *  freely picked country is asked among plausible neighbours. */
const leaderPickOptions = (isoCode: ISOCountryCode): ISOCountryCode[] => {
  const { region } = getCountry(isoCode)
  const neighbours = playableWorldCountries({ variant: 'world', difficulty: 'normal' })
    .filter(code => code !== isoCode && getCountry(code).region === region)
    .slice(0, 3)
  return [isoCode, ...neighbours]
}

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

/**
 * The view the pinned seat is looking at — resolved through the SAME
 * `resolveChallengeView` the room page renders, so the harness follows a phase
 * change instead of being frozen on one component. That is what lets a round
 * play through its own settle onto the scorecard; a scenario only pins
 * `component` when it routes outside the resolver entirely.
 */
const activeComponent = computed(() => {
  const scenario = activeScenario.value
  if (scenario?.component) return scenario.component
  const game = gameStore.game
  const phase = game?.players[ME]?.phase
  const resolved = phase && game ? resolveChallengeView(phase, latestRound(game)) : undefined
  return resolved?.component ?? ViewGroupChallenge
})

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
  ['Ground Plan', ['ground-plan']],
  ['Star Chart', ['star-chart']],
  ['Terra Incognita', ['terra-incognita']],
  ['Stat Detective', ['stat-detective']],
  ['Flag Palette', ['flag-palette']],
  ['Composition', ['composition']],
  ['Water', ['water-', 'name-that-water']],
  ['Mother Tongue', ['mother-tongue', 'mother-tongue-regional', 'mother-tongue-regional-reveal']],
  ['Neighbour Blitz', ['neighbour-']],
  ['Map & Sketch', ['pin-landmark', 'no-mans-land', 'hot-cold', 'silhouette', 'sketch']],
  ['Audio Buzz', ['anthem-', 'tongue-']],
  ['Border Chain', ['border-chain']],
  ['Atlas', ['atlas']],
  ['Government', ['government']],
  ['Clean Sweep', ['sweep-']],
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
  // A new mode starts on its own first rung; a rung from the previous mode
  // means nothing here.
  variantId.value = ''
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

/**
 * The chosen rung, or a country the harness was asked for by ISO code. A free
 * pick is just a Variant built on the fly, so `build()` never learns the
 * difference between a curated case and a typed one.
 */
const variantId = ref('')

const freeCountryVariant = (isoCode: string): Variant | undefined => {
  const code = isoCode.toUpperCase() as ISOCountryCode
  if (!ISOCountryCodes.includes(code)) return undefined
  return { id: code, label: countryName(code), country: code }
}

/**
 * A typed country the ACTIVE scenario can really deal.
 *
 * `freeCountryVariant` only asks whether the code is a country, which is a far
 * wider set than a mode's own pool. Government is the case: `dealGovernment`
 * returns undefined for a chamber outside `governmentPool`, and both harness
 * call sites assert non-null — so typing "AF" would throw on the first property
 * access rather than politely refusing.
 *
 * Modes that deal any country at all (the zoom-out gate, the leader pick) have
 * no pool to check, so they take every code as before.
 */
const dealableFreeCountry = (scenario: Scenario, isoCode: string): Variant | undefined => {
  const free = freeCountryVariant(isoCode)
  if (!free?.country) return undefined
  if (scenario.id !== 'government') return free
  return GOVERNMENT_COUNTRIES.includes(free.country) ? free : undefined
}

const activeVariant = computed<Variant | undefined>(() => {
  const scenario = activeScenario.value
  if (!scenario?.variants?.length) return undefined
  const curated = scenario.variants.find(entry => entry.id === variantId.value)
  if (curated) return curated
  if (scenario.anyCountry && variantId.value) {
    // `reveal-SE` is a curated rung, matched above; a bare code lands here.
    const free = dealableFreeCountry(scenario, variantId.value)
    if (free) return free
  }
  return scenario.variants[0]
})

/** Rungs plus, when the mode takes any country, whatever was typed. */
const variantOptions = computed<Variant[]>(() => {
  const scenario = activeScenario.value
  if (!scenario?.variants?.length) return []
  const rungs = [...scenario.variants]
  const chosen = activeVariant.value
  if (chosen && !rungs.some(entry => entry.id === chosen.id)) rungs.push(chosen)
  return rungs
})

const pickVariant = (id: string) => {
  variantId.value = id
  deal()
}

/** A typed country deals immediately when it resolves to a real ISO code. */
const variantQuery = ref('')
const pickFreeCountry = () => {
  const scenario = activeScenario.value
  const typed = variantQuery.value.trim()
  if (!scenario || !typed) return

  // "reveal SE" / "reveal-SE" jumps to the reveal rung of a country rather than
  // its opening beat. Without this the typed path could only ever reach one of
  // the two rungs a mode generates per country.
  const reveal = /^reveal[\s-]+/i.test(typed)
  const name = typed.replace(/^reveal[\s-]+/i, '').trim()

  const isoCode =
    dealableFreeCountry(scenario, name)?.country ?? searchCountriesByName(name)[0]?.isoCode
  if (!isoCode) return
  // A name search can land on a country the mode cannot deal — check the code
  // it resolved to, not just the text that was typed.
  if (!dealableFreeCountry(scenario, isoCode)) return

  variantQuery.value = ''
  const wanted = reveal ? `reveal-${isoCode}` : isoCode
  // Only take the reveal id when the scenario actually generates one.
  pickVariant(scenario.variants?.some(entry => entry.id === wanted) ? wanted : isoCode)
}

const deal = () => {
  const scenario = activeScenario.value
  if (!scenario) return
  const variant = activeVariant.value
  // Selection survives a refresh:
  //   /test-views?scenario=anthem-buzz&variant=japan
  //   /test-views?scenario=anthem-buzz&variant=BR   (a free country pick)
  router.replace({
    query: { scenario: scenario.id, ...(variant ? { variant: variant.id } : {}) },
  })
  lastEvent.value = ''
  gameStore.game = variant?.build ? variant.build() : scenario.build(variant)
  renderKey.value += 1
  ready.value = true
  armChainScenario()
  armGovernmentScenario()
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
  // A bare ?scenario= still deals the first rung, so every existing link (and
  // e2e/flashpoint-ladder.spec.ts) keeps working untouched.
  variantId.value = String(route.query.variant ?? '')
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
    margin-top: $harness-bar-height;

    // The scene inside is sized from --viewport-height, so shortening the
    // frame alone leaves it a bar's-worth too tall and its footer lands
    // under the fold. Re-point the variable for the subtree instead — the
    // `height` above reads it too, so the frame follows without a second
    // subtraction (which clipped a bar's-worth off the console, making the
    // harness lie about the very thing it exists to show).
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

.variant-select,
.variant-any {
  border: 0;
  color: inherit;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  background: rgb(255 255 255 / 12%);
  border-radius: 6px;
  min-width: 0;
}

.variant-select {
  cursor: pointer;
  max-width: 22vw;
}

.variant-any {
  width: 9rem;

  &::placeholder {
    color: inherit;
    opacity: 0.45;
  }
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
