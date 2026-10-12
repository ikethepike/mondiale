<template>
  <div v-if="challenge" class="manhunt challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      kind="manhunt"
      :title="interstitialTitle"
      :stakes="stakes"
      @done="begin()"
    >
      <template #emblem>
        <DespotHat />
      </template>
    </Interstitial>

    <MapYearLabels
      v-if="!showInterstitial && mapChipEntries.length"
      :entries="mapChipEntries"
      :min-gap-px="26"
    />

    <!-- No prompt while the briefing is up: "your move" belongs to a round
         that has actually started, not to the card explaining it. -->
    <ChallengePrompt v-if="!briefing" ref="promptHost" compact>
      <h1 class="map-caption headline-line">
        <DespotHat class="despot-hat" />
        <span>{{ headline }}</span>
        <ChallengeTimerRadial
          v-if="live"
          :key="`turn-${state.turn}`"
          class="beat-clock"
          :value="secondsOnClock"
          :total="challenge.beatSeconds"
        />
      </h1>
      <Transition name="caption" mode="out-in">
        <div
          v-if="live && latestLeak"
          :key="`${latestLeak.hop}:${latestLeak.text}`"
          class="map-caption intel-card"
        >
          <span class="intel-eyebrow eyebrow">{{ leakEyebrow }}</span>
          <span class="intel-line">{{ latestLeak.text }}</span>
          <span v-if="analysing" class="intel-analysis">Analysts are narrowing the map…</span>
        </div>
      </Transition>
      <Transition name="caption">
        <span v-if="hint" class="map-caption hint" :class="hintTone">{{ hint }}</span>
      </Transition>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <BriefingCard
      v-if="briefing"
      :class="{ despotic: isDespot }"
      :participants="briefingParticipants"
      :ready="state.ready"
      :cta="isDespot ? 'Flee with dignity' : 'Open the hunt'"
      :sent="sentReady"
      @ready="sendReady"
    >
      <DespotHat class="briefing-hat" />
      <h2>{{ isDespot ? 'Glorious Leader!' : 'Your case file' }}</h2>
      <ul class="briefing-points">
        <template v-if="isDespot">
          <li>Each beat, slip up to two borders. You see every ping and stakeout land.</li>
          <li>You choose which of two true facts about your next hideout leaks.</li>
          <li>
            ⚓ {{ challenge.favours }} smuggler's favours: a sea passage or a beat lying low. The
            hunt only learns that one was used.
          </li>
          <li>
            Vault: your first beat inside one, you're untouchable and bank a share of the treasury.
            Expect them at the exits.
          </li>
          <li>Survive {{ challenge.turnCount }} beats to escape.</li>
        </template>
        <template v-else>
          <li>
            Each beat, do one thing. 📡 <strong>Ping</strong> a country to learn how many borders
            away the Despot is (only you see it), or ✕ <strong>stake one out</strong> to catch them.
          </li>
          <li>The Despot runs up to two borders a beat, and one true fact leaks every beat.</li>
          <li>A vault shelters the Despot the beat they loot it, so guard the exits.</li>
          <li>⚖ A subpoena picks the next leak's topic and takes the Despot's choice away.</li>
          <li>The bounty splits by how close your last marker lands.</li>
        </template>
      </ul>
      <template #seat="{ playerId }">
        <DespotHat v-if="playerId === challenge.despotId" class="seat-hat" />
      </template>
    </BriefingCard>

    <footer v-if="!briefing && !showInterstitial" ref="dock" class="hunt-dock">
      <ManhuntReveal
        v-if="finished"
        :challenge="challenge"
        :players="gameStore.game?.players ?? {}"
        :player-id="gameStore.seatId"
      />

      <template v-else>
        <div class="dock-status map-caption">
          <span class="status-main">
            <span class="chip" :style="{ background: despotPlayer?.color }" />
            <span class="status-text">{{ statusLine }}</span>
          </span>
          <span v-if="isDespot && challenge.favours" class="favour-pips" :title="favourTitle">
            <span
              v-for="index in challenge.favours"
              :key="index"
              :class="{ spent: index > state.favoursLeft }"
              >⚓</span
            >
          </span>
          <span v-if="hideoutCount" class="hideout-count">{{ hideoutCount }}</span>
          <span class="dock-actions">
            <button
              v-if="iAmDetective"
              class="dock-button"
              :class="{ open: subpoenaOpen }"
              :disabled="!canSubpoena"
              :aria-pressed="subpoenaOpen"
              :title="subpoenaTitle"
              @click="subpoenaOpen = !subpoenaOpen"
            >
              ⚖<span class="button-count">{{ mySubpoenas }}</span>
            </button>
            <button
              class="dock-button"
              :disabled="tauntCooling"
              title="Taunt"
              aria-label="Taunt"
              @click="sendTaunt"
            >
              <StatTopicIcon class="button-icon" topic="society.protest" />
            </button>
          </span>
        </div>

        <p v-if="state.subpoena" class="served map-caption">
          ⚖ {{ nameOf(state.subpoena.by) }} served a subpoena: the next leak is about
          {{ subpoenaTopic(state.subpoena.topic)?.label.toLowerCase() }}
        </p>

        <div v-if="subpoenaOpen && canSubpoena" class="topic-row">
          <button
            v-for="topic in MANHUNT_SUBPOENA_TOPICS"
            :key="topic.id"
            class="topic-chip map-caption"
            @click="sendSubpoena(topic.id)"
          >
            <StatTopicIcon
              class="chip-icon"
              :topic="topic.icon.topic"
              :accessor="topic.icon.accessor"
            />
            <span>{{ topic.label }}</span>
          </button>
        </div>

        <div v-if="canAct" class="action-switch" role="radiogroup" aria-label="This beat">
          <button
            class="switch-option map-caption"
            :class="{ active: mode === 'ping' }"
            role="radio"
            :aria-checked="mode === 'ping'"
            @click="mode = 'ping'"
          >
            <SonarGlyph />
            Ping
          </button>
          <button
            class="switch-option map-caption"
            :class="{ active: mode === 'stakeout' }"
            role="radio"
            :aria-checked="mode === 'stakeout'"
            :disabled="!stakeoutOpen"
            @click="mode = 'stakeout'"
          >
            ✕ Stake out
            <small>{{ stakeoutsLeft }} left</small>
          </button>
        </div>

        <div v-if="staged" class="stage-row">
          <CountryChip tag="span" class="map-caption staged" :country="getCountry(staged)">
            <span v-if="challenge.vaults.includes(staged)" class="chip-tag">Vault</span>
          </CountryChip>
          <ButtonFilled @click="sendAction(staged)">
            {{ mode === 'ping' ? 'Ping' : 'Stake out' }}
          </ButtonFilled>
          <button class="dock-button" aria-label="Cancel" @click="staged = undefined">✕</button>
        </div>

        <template v-if="isDespot && planning">
          <div
            v-if="!plan || plan.leak === undefined"
            class="flee country-chip-list rail"
            role="group"
            aria-label="Flee to"
          >
            <button
              v-if="legalMoves.sea.length"
              class="map-caption fan-toggle"
              :class="{ open: seaFanOpen }"
              :aria-pressed="seaFanOpen"
              @click="seaFanOpen = !seaFanOpen"
            >
              {{ seaFanOpen ? '◂ Over land' : `⚓ By sea · ${legalMoves.sea.length}` }}
            </button>
            <CountryChip
              v-for="option in shownMoves"
              :key="option.isoCode + option.shape"
              tag="button"
              class="map-caption flee-option"
              :class="{ chosen: chosenMove === option.isoCode }"
              :country="getCountry(option.isoCode)"
              :aria-pressed="chosenMove === option.isoCode"
              @click="sendMove(option.isoCode)"
            >
              <span v-if="option.shape === 'stay'" class="chip-tag">Lie low ⚓</span>
              <span v-else-if="option.shape === 'sea'" class="chip-tag">⚓</span>
              <span v-if="isSheltered(option.isoCode, challenge.vaults, looted)" class="chip-tag"
                >Vault</span
              >
            </CountryChip>
          </div>

          <div v-if="plan && plan.leak === undefined" class="leak-pick">
            <span class="eyebrow">{{
              plan.options.length > 1 ? 'Choose what Interpol learns' : 'Subpoenaed — this leaks'
            }}</span>
            <div class="card-options" :class="{ single: plan.options.length === 1 }">
              <button
                v-for="(option, index) in plan.options"
                :key="option.text"
                class="card-option leak-option"
                @click="sendLeak(index)"
              >
                <StatTopicIcon
                  class="leak-icon"
                  :topic="option.topic"
                  :accessor="option.accessorId"
                />
                <span class="leak-text">{{ option.text }}</span>
                <span v-if="planWidths[index] !== undefined" class="leak-width"
                  >leaves {{ planWidths[index] }} hideouts</span
                >
              </button>
            </div>
          </div>
        </template>

        <section v-if="caseRows.length" class="case-file">
          <button
            class="case-toggle map-caption"
            :aria-expanded="caseFileOpen"
            @click="caseFileOpen = !caseFileOpen"
          >
            {{ isDespot ? 'What the hunt knows' : 'Case file' }} · {{ caseSummary }}
            <span class="toggle-mark">{{ caseFileOpen ? '▾' : '▸' }}</span>
          </button>
          <ol v-if="caseFileOpen" class="leak-list">
            <li
              v-for="row in caseRows"
              :key="row.key"
              class="leak-row map-caption"
              :class="{ reading: row.reading !== undefined }"
              :style="row.reading !== undefined ? { '--warmth': row.color } : undefined"
            >
              <SonarGlyph v-if="row.reading !== undefined" class="row-icon" />
              <StatTopicIcon
                v-else
                class="row-icon"
                :topic="row.clue?.topic"
                :accessor="row.clue?.accessorId"
              />
              <span class="row-hop">{{ row.hop }}</span>
              <span class="row-text">{{ row.text }}</span>
              <span v-if="row.clue?.askedBy" class="row-tag">⚖</span>
            </li>
          </ol>
        </section>
      </template>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import SonarGlyph from '~/components/challenge/SonarGlyph.vue'
import DespotHat from '~/components/challenge/DespotHat.vue'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ManhuntReveal from '~/components/challenge/ManhuntReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import { countryName, getCountry } from '~~/lib/country'
import { isStraitHop, walkColor } from '~~/lib/chain'
import {
  canServeSubpoena,
  claimantOf,
  formatReading,
  hasActed,
  huntCandidates,
  isPreSonarRound,
  isSheltered,
  leakWidths,
  legalManhuntMoves,
  MANHUNT_STRIDE,
  MANHUNT_SUBPOENA_TOPICS,
  MANHUNT_TAUNTS,
  manhuntHopShape,
  readingWarmth,
  seaNeighboursOf,
  sonarDistance,
  sonarRipple,
  subpoenaTopic,
  withLiveLeak,
  type ManhuntSubpoenaTopicId,
} from '~~/lib/manhunt'
import { warmthColor } from '~~/lib/warmth'
import { useAckOnce } from '~~/lib/use-ack-once'
import { REPLAY_REDRAW_MS, SONAR_HOLD_MS, SONAR_RING_MS } from '~~/lib/motion'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { sample } from '~~/lib/arrays'
import { isCountryPlayable, playableCountries, unplayableCountries } from '~~/lib/game-rules'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useServerNow } from '~~/lib/use-server-now'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { usePromptBerth } from '~~/lib/use-prompt-berth'
import { useIsCoarsePointer, useIsPhone } from '~~/lib/use-viewport'
import { playerDisplayName } from '~~/lib/player'
import type { CountryColorGrouping } from '~~/types/map.type'
import { isMapClickEvent, isMapHoverEvent } from '~~/types/events.types'
import type { ManhuntState } from '~~/types/challenges/group-modes.type'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

const {
  challenge,
  showInterstitial,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  registerCleanup,
  createViewTimer,
  gameStore,
  update,
} = useGroupChallenge('manhunt-challenge', { solo: false })

// Timers and watchers keep evaluating for a beat after the round advances
// past manhunt, so the state must never dereference undefined.
const EMPTY_STATE: ManhuntState = {
  ready: [],
  turn: 0,
  hop: 1,
  deadline: 0,
  analysisAt: 0,
  detectives: [],
  clues: [],
  moves: [],
  favoursLeft: 0,
  subpoenasLeft: {},
  claims: {},
  pings: {},
  despotReady: false,
  dragnets: [],
}

const isPhone = useIsPhone()
const isCoarse = useIsCoarsePointer()
const { now } = useServerNow()

const preSonar = computed(() => !!challenge.value && isPreSonarRound(challenge.value))
const state = computed(() => ({ ...EMPTY_STATE, ...challenge.value?.state }))
const finished = computed(() => !!state.value.finished)
const briefing = computed(
  () => !!state.value.briefing && !finished.value && !showInterstitial.value
)
const live = computed(
  () => !finished.value && !briefing.value && !showInterstitial.value && !preSonar.value
)
const lastBeat = computed(() => state.value.hop >= (challenge.value?.turnCount ?? 0))

// The watching lens: following the despot shows the HUNT's honest view — the
// despot's trail arrives only on their own socket.
const isDespot = computed(
  () => challenge.value?.despotId === gameStore.seatId && !gameStore.watching
)
const despotPlayer = computed(() =>
  challenge.value ? gameStore.game?.players[challenge.value.despotId] : undefined
)
const despotName = computed(() => playerDisplayName(despotPlayer.value))
const iAmDetective = computed(
  () => state.value.detectives.includes(gameStore.seatId) && !gameStore.watching
)

const position = computed(() => (isDespot.value ? gameStore.manhunt : undefined))
const trail = computed(() => position.value?.trail ?? [])
const looted = computed(() => position.value?.looted ?? [])
const despotAt = computed(() => trail.value[trail.value.length - 1])
const plan = computed(() =>
  position.value?.turn === state.value.turn ? position.value?.plan : undefined
)

/** This detective's own sonar readings — their eyes only. */
const readings = computed(() =>
  iAmDetective.value ? (gameStore.manhuntReadings?.readings ?? []) : []
)

// Private intel is a single-socket emit, so a beat resolved while this socket
// was down never reaches it — re-ask on mount (covers the reveal) and on
// every reconnect.
const refetchIntel = () => {
  if ((isDespot.value || iAmDetective.value) && !finished.value) {
    update({ event: 'fetch-manhunt-intel' })
  }
}
onMounted(() => {
  refetchIntel()
  const manager = gameStore.socket?.io
  manager?.on('reconnect', refetchIntel)
  onUnmounted(() => manager?.off('reconnect', refetchIntel))
})

const rules = gameStore.game ?? { regions: [], difficulty: 'normal' as const }
gameStore.map.dimmed = unplayableCountries(rules)
// The berths already clear the chrome, so the default pad would pay for the
// margin twice and shrink the hunt to a postage stamp on a wide screen.
gameStore.map.framePad = { scale: 0.15, floor: 30 }
registerCleanup(() => (gameStore.map.framePad = undefined))

const playerColor = (playerId: string): string | undefined =>
  gameStore.game?.players[playerId]?.color

const nameOf = (playerId: string) =>
  playerId === gameStore.seatId ? 'you' : playerDisplayName(gameStore.game?.players[playerId])

// --- What the table knows ---------------------------------------------------

/** Before the analysts land, the map shows only where the despot COULD have
 *  moved; a detective who can apply the leak themselves acts first. Each
 *  detective's map replays the public record with their OWN readings; the
 *  despot's shows what the whole hunt knows. */
const analysed = computed(() => now.value >= state.value.analysisAt)
const analysing = computed(() => live.value && !!challenge.value?.showCandidates && !analysed.value)
const possibleBefore = computed(() =>
  challenge.value && live.value
    ? huntCandidates(challenge.value, rules, readings.value, { latestLeak: false })
    : []
)
const possible = computed(() => withLiveLeak(state.value, possibleBefore.value))
const paintedSet = computed(() =>
  challenge.value?.showCandidates ? (analysed.value ? possible.value : possibleBefore.value) : []
)

const latestLeak = computed(() => state.value.clues[state.value.clues.length - 1])
const favourThisBeat = computed(() =>
  state.value.moves.some(move => move.hop === state.value.hop && move.kind === 'favour')
)

const leakEyebrow = computed(() => {
  const leak = latestLeak.value
  const parts = [leak?.askedBy ? `⚖ ${nameOf(leak.askedBy)}'s subpoena` : 'Interpol leak']
  if (favourThisBeat.value) parts.unshift('⚓ Favour called in')
  return parts.join(' · ')
})

const hideoutCount = computed(() => {
  if (!live.value || !challenge.value?.showCandidates) return ''
  const count = paintedSet.value.length
  return isDespot.value ? `hiding among ${count}` : `${count} possible`
})

const headline = computed(() => {
  const turnCount = challenge.value?.turnCount ?? 0
  if (finished.value) {
    const outcome = state.value.outcome
    return outcome?.kind === 'captured'
      ? `Captured in ${countryName(getCountry(outcome.country))}`
      : 'The Despot escaped'
  }
  return isPhone.value
    ? `Beat ${state.value.hop}/${turnCount}`
    : `The hunt — beat ${state.value.hop} of ${turnCount}`
})

const interstitialTitle = computed(() =>
  isDespot.value
    ? 'You are the Despot — run'
    : `${despotName.value} is the deposed Despot — hunt them down`
)

const stakes = computed(() => {
  const turnCount = challenge.value?.turnCount ?? 0
  if (isDespot.value) {
    return `Run up to two borders every beat and survive ${turnCount} beats. Every ping and stakeout lands where you can see it — and a vault shelters you for the beat you empty it.`
  }
  return `Each beat, ping a country to hear how many borders away the Despot is — or stake one out to catch them. Only you hear your pings.`
})

// --- Detective actions ------------------------------------------------------

const myClaim = computed(() => state.value.claims[gameStore.seatId])
const myPing = computed(() => state.value.pings[gameStore.seatId])
const claimsIn = computed(() => Object.keys(state.value.claims).length)
const claimsPerBeat = computed(() => challenge.value?.claimsPerBeat ?? 0)
const stakeoutsLeft = computed(() => Math.max(0, claimsPerBeat.value - claimsIn.value))
const stakeoutOpen = computed(() => stakeoutsLeft.value > 0)
const canAct = computed(
  () => live.value && iAmDetective.value && !hasActed(state.value, gameStore.seatId)
)
const actedCount = computed(
  () => state.value.detectives.filter(playerId => hasActed(state.value, playerId)).length
)

/** This beat's one action. A ping is the default, a stakeout a choice — except
 *  on the last beat, when no reading can come back to act on. */
const defaultMode = () => (lastBeat.value && stakeoutOpen.value ? 'stakeout' : 'ping')
const mode = ref<'ping' | 'stakeout'>(defaultMode())
watch(stakeoutOpen, open => !open && (mode.value = 'ping'))

/** Touch stages an action before sending it — a fat-fingered Slovenia must
 *  not cost the beat. A fine pointer acts on click. */
const staged = ref<ISOCountryCode | undefined>()
/** The country this detective's in-flight action names, until it lands. */
const pendingAct = ref<ISOCountryCode | undefined>()
watch(
  () => state.value.turn,
  () => {
    staged.value = undefined
    pendingAct.value = undefined
    pendingMove.value = undefined
    subpoenaOpen.value = false
    seaFanOpen.value = false
    mode.value = defaultMode()
  }
)
watch(canAct, open => !open && (staged.value = undefined))

const sendAction = (isoCode: ISOCountryCode) => {
  if (!canAct.value || pendingAct.value) return
  if (mode.value === 'stakeout') {
    const holder = claimantOf(state.value, isoCode)
    if (holder) {
      announce({
        hint: `${nameOf(holder)} is already staking out ${countryName(getCountry(isoCode))}`,
      })
      return
    }
  }
  staged.value = undefined
  pendingAct.value = isoCode
  const marker = { isoCode, turn: state.value.turn }
  update(
    mode.value === 'stakeout'
      ? { event: 'submit-manhunt-claim', ...marker }
      : { event: 'submit-manhunt-ping', ...marker }
  )
}
// The action landed, or it lost the race for its country: free the button.
watch(
  () =>
    !!pendingAct.value &&
    (hasActed(state.value, gameStore.seatId) ||
      (mode.value === 'stakeout' && !!claimantOf(state.value, pendingAct.value))),
  settled => settled && (pendingAct.value = undefined)
)

const mySubpoenas = computed(() => state.value.subpoenasLeft[gameStore.seatId] ?? 0)
const canSubpoena = computed(
  () =>
    live.value &&
    iAmDetective.value &&
    !!challenge.value &&
    canServeSubpoena(challenge.value, gameStore.seatId)
)
const subpoenaOpen = ref(false)
const subpoenaTitle = computed(() =>
  mySubpoenas.value ? 'Subpoena: pick the topic of the next leak' : 'No subpoenas left'
)
const sendSubpoena = (topic: ManhuntSubpoenaTopicId) => {
  if (!canSubpoena.value) return
  subpoenaOpen.value = false
  update({ event: 'submit-manhunt-subpoena', topic, turn: state.value.turn })
}

const tauntCooling = ref(false)
let tauntTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => tauntTimer && clearTimeout(tauntTimer))
const sendTaunt = () => {
  if (tauntCooling.value) return
  const lines = MANHUNT_TAUNTS[isDespot.value ? 'despot' : 'detective']
  update({ event: 'manhunt-taunt', index: sample(lines.keys().toArray() as number[]) ?? 0 })
  tauntCooling.value = true
  tauntTimer = setTimeout(() => (tauntCooling.value = false), 6000)
}

// --- Despot actions ---------------------------------------------------------

const planning = computed(
  () => live.value && isDespot.value && !lastBeat.value && !state.value.despotReady
)

const legalMoves = computed(() =>
  despotAt.value
    ? legalManhuntMoves(despotAt.value, state.value.favoursLeft, rules)
    : { ground: [], sea: [], stay: false }
)

const moveOptions = computed(() => {
  const from = despotAt.value
  if (!from) return []
  const { ground, sea, stay } = legalMoves.value
  return [
    ...ground.map(isoCode => ({ isoCode, shape: 'ground' as const })),
    ...sea.map(isoCode => ({ isoCode, shape: 'sea' as const })),
    ...(stay ? [{ isoCode: from, shape: 'stay' as const }] : []),
  ]
})

/** Sea passages fan out on request — a coastline can reach twenty shores,
 *  and a standing list of them buries the hops that matter. */
const seaFanOpen = ref(false)
const shownMoves = computed(() =>
  moveOptions.value.filter(option =>
    seaFanOpen.value ? option.shape === 'sea' : option.shape !== 'sea'
  )
)

const pendingMove = ref<ISOCountryCode | undefined>()
const chosenMove = computed(() => pendingMove.value ?? plan.value?.isoCode)

const sendMove = (isoCode: ISOCountryCode) => {
  if (!planning.value || plan.value?.leak !== undefined) return
  pendingMove.value = isoCode
  update({ event: 'submit-manhunt-move', isoCode, turn: state.value.turn })
}
watch(
  () => plan.value?.isoCode,
  isoCode => isoCode === pendingMove.value && (pendingMove.value = undefined)
)

const sendLeak = (index: number) => {
  if (!planning.value || !plan.value) return
  update({ event: 'submit-manhunt-leak', index, turn: state.value.turn })
}

/** How many hideouts each leak would leave the hunt — the despot's own sum
 *  over public knowledge, so it is only offered where the set is painted. */
const planWidths = computed(() => {
  const active = plan.value
  if (!active || !challenge.value?.showCandidates) return []
  return leakWidths(possible.value, active.kind, active.options, rules)
})

const favourTitle = computed(
  () => `${state.value.favoursLeft} of ${challenge.value?.favours} smuggler's favours left`
)

/** The despot's danger read: the nearest marker landed this beat. */
const nearestMarker = computed(() => {
  if (!isDespot.value || !despotAt.value) return undefined
  const markers = [...Object.values(state.value.claims), ...Object.values(state.value.pings)]
  const distances = markers
    .map(marker => sonarDistance(marker, despotAt.value!, rules))
    .filter((distance): distance is number => distance !== null)
  return distances.length ? Math.min(...distances) : undefined
})

const statusLine = computed(() => {
  const inLine = `${actedCount.value}/${state.value.detectives.length} in`
  if (isDespot.value) {
    const danger =
      nearestMarker.value === undefined
        ? ''
        : ` · nearest marker ${formatReading(nearestMarker.value)}`
    if (
      despotAt.value &&
      isSheltered(despotAt.value, challenge.value?.vaults ?? [], looted.value)
    ) {
      return lastBeat.value
        ? 'Safe in the vault — the treasury is yours'
        : `Safe in the vault this beat${danger}`
    }
    if (lastBeat.value) return `Last beat — survive the dragnet${danger}`
    if (state.value.despotReady) {
      return `Escape planned → ${countryName(getCountry(plan.value?.isoCode ?? despotAt.value!))}${danger}`
    }
    if (plan.value) return `Now choose the leak${danger}`
    return `${isPhone.value ? 'Pick your next hideout' : 'Plan your escape — pick your next hideout'}${danger}`
  }
  if (!iAmDetective.value) return `${despotName.value} is on the run · ${inLine}`
  if (myClaim.value) return `Staking out ${countryName(getCountry(myClaim.value))} · ${inLine}`
  if (myPing.value) {
    return isPhone.value
      ? `Pinged ${countryName(getCountry(myPing.value))} · ${inLine}`
      : `Pinged ${countryName(getCountry(myPing.value))} — it answers when the beat ends · ${inLine}`
  }
  const lead = lastBeat.value ? 'Last beat — ' : ''
  return mode.value === 'ping'
    ? `${lead}Tap a country to ping it`
    : `${lead}Tap a country to stake it out · ${stakeoutsLeft.value} left`
})

/** The case file: every leak, and this detective's own readings, newest first. */
const caseRows = computed(() => {
  const rows = [
    ...state.value.clues.slice(0, -1).map(clue => ({
      key: `leak-${clue.hop}-${clue.text}`,
      hop: clue.hop,
      text: clue.text,
      clue,
      reading: undefined as number | null | undefined,
      color: undefined as string | undefined,
    })),
    ...readings.value.map(reading => ({
      key: `ping-${reading.hop}`,
      hop: reading.hop,
      text: `${countryName(getCountry(reading.isoCode))}: ${formatReading(reading.distance)}`,
      clue: undefined,
      reading: reading.distance,
      color: warmthColor(readingWarmth(reading.distance)),
    })),
  ]
  return rows.sort((a, b) => b.hop - a.hop || (a.reading === undefined ? 1 : -1))
})
const caseSummary = computed(() => {
  const leaks = Math.max(0, state.value.clues.length - 1)
  const parts = [`${leaks} earlier ${leaks === 1 ? 'leak' : 'leaks'}`]
  if (readings.value.length) {
    parts.push(`${readings.value.length} ${readings.value.length === 1 ? 'ping' : 'pings'}`)
  }
  return parts.join(' · ')
})

// --- The map ----------------------------------------------------------------

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event) || !live.value) return
  const isoCode = event.detail.isoCode
  if (!isValidISOCode(isoCode)) return

  if (isDespot.value) {
    if (!planning.value || plan.value?.leak !== undefined) return
    if (moveOptions.value.some(option => option.isoCode === isoCode)) return sendMove(isoCode)
    const name = countryName(getCountry(isoCode))
    const bySea = despotAt.value ? seaNeighboursOf(despotAt.value).includes(isoCode) : false
    const reason =
      isoCode === despotAt.value
        ? "Lying low needs a smuggler's favour"
        : !isCountryPlayable(rules, isoCode)
          ? `${name} is off this board`
          : bySea
            ? `Sailing to ${name} needs a smuggler's favour`
            : `${name} is more than ${MANHUNT_STRIDE} borders away`
    return announce({ hint: reason })
  }

  if (!canAct.value) return
  if (isCoarse.value) {
    staged.value = isoCode
    return
  }
  sendAction(isoCode)
}
onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))

const hovered = ref<ISOCountryCode | undefined>()
const onMapHover = (event: Event) => {
  if (!isMapHoverEvent(event) || !planning.value) return
  const isoCode = event.detail.isoCode
  hovered.value =
    isValidISOCode(isoCode) && moveOptions.value.some(option => option.isoCode === isoCode)
      ? isoCode
      : undefined
}
onBeforeMount(() => document.addEventListener('mapHover', onMapHover))
registerCleanup(() => document.removeEventListener('mapHover', onMapHover))

/** The latest beat's own readings — what the sonar just answered. */
const freshReadings = computed(() =>
  readings.value.filter(reading => reading.hop === state.value.hop - 1)
)

/** One chip per country: this detective's fresh readings (warmth-coloured
 *  sonar marks), the live pings and stakeouts in their detective's colour —
 *  read as distances from the despot on the despot's own map — the vaults,
 *  and the despot's numbered trail. */
const mapChipEntries = computed(() => {
  type Chip = { labels: string[]; color?: string; icon?: 'sonar'; pulse?: string }
  const chips = new Map<ISOCountryCode, Chip>()
  const add = (isoCode: ISOCountryCode, label: string, extra: Omit<Chip, 'labels'> = {}) => {
    const chip = chips.get(isoCode) ?? { labels: [] }
    if (label) chip.labels.push(label)
    chip.color ??= extra.color
    chip.icon ??= extra.icon
    chip.pulse ??= extra.pulse
    chips.set(isoCode, chip)
  }
  if (!finished.value) {
    for (const reading of freshReadings.value) {
      add(reading.isoCode, formatReading(reading.distance, true), {
        icon: 'sonar',
        color: warmthColor(readingWarmth(reading.distance)),
        pulse: `${reading.hop}`,
      })
    }
    for (const [playerId, isoCode] of Object.entries(state.value.pings)) {
      const distance =
        isDespot.value && despotAt.value ? sonarDistance(isoCode, despotAt.value, rules) : undefined
      add(
        isoCode,
        distance === undefined
          ? playerId === gameStore.seatId
            ? '…'
            : ''
          : formatReading(distance, true),
        {
          icon: 'sonar',
          color:
            distance === undefined ? playerColor(playerId) : warmthColor(readingWarmth(distance)),
        }
      )
    }
    for (const [playerId, isoCode] of Object.entries(state.value.claims)) {
      add(isoCode, '✕', { color: playerColor(playerId) })
    }
    if (staged.value) {
      add(staged.value, mode.value === 'ping' ? '?' : '✕?', {
        color: playerColor(gameStore.seatId),
        icon: mode.value === 'ping' ? 'sonar' : undefined,
      })
    }
    for (const vault of challenge.value?.vaults ?? []) {
      add(vault, isDespot.value && looted.value.includes(vault) ? 'Emptied' : 'Vault')
    }
  }
  trail.value.forEach((isoCode, index) => {
    if (trail.value[index - 1] !== isoCode) add(isoCode, String(index + 1))
  })
  if (planning.value && gameStore.game?.difficulty === 'easy') {
    for (const option of moveOptions.value) {
      if (!chips.has(option.isoCode)) add(option.isoCode, option.isoCode)
    }
  }
  return [...chips].map(([isoCode, chip]) => ({
    isoCode,
    label: chip.labels.join(' '),
    color: chip.color,
    icon: chip.icon,
    pulse: chip.pulse,
  }))
})

const CANDIDATE_FILL = 'hsla(212, 58%, 62%, 0.4)'
const POSSIBLE_FILL = 'hsla(212, 58%, 62%, 0.18)'
const PLANNED_FILL = 'hsla(20, 80%, 55%, 0.35)'
const CLEARED_FILL = 'hsla(212, 20%, 70%, 0.22)'

/** The sonar ripple: when a reading lands, its rings wash out from the ping
 *  one border at a time — cleared ground, then the ring the despot stood on —
 *  before the map settles back to the possible set. On hard, where no set is
 *  painted, the ring itself stays as the signpost. */
const rippling = ref(false)
const scheduleRippleEnd = createViewTimer()
watch(
  () =>
    live.value && freshReadings.value.map(reading => `${reading.hop}:${reading.isoCode}`).join('|'),
  key => {
    if (!key) return
    rippling.value = true
    const depth = Math.max(0, ...freshReadings.value.map(reading => reading.distance ?? 0))
    scheduleRippleEnd(() => (rippling.value = false), depth * SONAR_RING_MS + SONAR_HOLD_MS)
  }
)

/** Fills spaced along the map's own stagger, so each ring lands a beat after
 *  the last. */
const RING_SPACING = Math.round(SONAR_RING_MS / 60)
const rippleGroupings = (rings: boolean): CountryColorGrouping[] =>
  freshReadings.value.flatMap(reading => {
    const warmth = warmthColor(readingWarmth(reading.distance), 0.5)
    const ripple = sonarRipple(reading, rules)
    if (!rings)
      return ripple.length ? [{ color: warmth, countries: ripple[ripple.length - 1]! }] : []
    return ripple.flatMap((countries, ring) => [
      { color: ring === ripple.length - 1 ? warmth : CLEARED_FILL, countries },
      ...Array.from({ length: RING_SPACING - 1 }, () => ({ color: CLEARED_FILL, countries: [] })),
    ])
  })

/** Replace a map list only when its contents changed — same-content writes
 *  retarget the camera tween and churn every watcher downstream. */
const writeIfChanged = (
  key: 'focus' | 'ringed' | 'seaGlow' | 'pulsing' | 'landRoutes' | 'seaLinks',
  next: string[]
) => {
  if (gameStore.map[key].join('|') !== next.join('|')) gameStore.map[key] = next as never
}

let paintedGroupings = ''
const writeGroupings = (groupings: CountryColorGrouping[]) => {
  const key = groupings.map(g => `${g.color}:${g.countries.join(',')}`).join('|')
  if (key === paintedGroupings) return
  paintedGroupings = key
  gameStore.map.countryGroupings = groupings
}

/** Ground legs as routes, water legs as arcs; a beat lying low draws nothing. */
const trailLegs = (walk: ISOCountryCode[]) => {
  const routes: string[] = []
  const sea: string[] = []
  for (let index = 1; index < walk.length; index++) {
    const [a, b] = [walk[index - 1], walk[index]]
    const shape = manhuntHopShape(a, b)
    if (shape === 'stay') continue
    if (shape === 'ground' && !isStraitHop(a, b)) routes.push(`${a}>${b}`)
    else sea.push(`${a}>${b}`)
  }
  return { routes, sea }
}

/** The beat whose favour wash already ran. */
let washedTurn = -1

const paintPursuit = () => {
  if (finished.value) return
  const groupings: CountryColorGrouping[] = []
  const painted = paintedSet.value
  const washing =
    favourThisBeat.value && painted.length > 0 && washedTurn !== state.value.turn && live.value
  if (washing) washedTurn = state.value.turn
  if (rippling.value) {
    groupings.push(...rippleGroupings(true))
  } else if (painted.length) {
    const fill = analysed.value ? CANDIDATE_FILL : POSSIBLE_FILL
    if (washing)
      for (const isoCode of painted) groupings.push({ color: fill, countries: [isoCode] })
    else groupings.push({ color: fill, countries: [...painted] })
  } else if (!challenge.value?.showCandidates) {
    groupings.push(...rippleGroupings(false))
  }

  const knowledge =
    challenge.value?.showCandidates && possibleBefore.value.length
      ? possibleBefore.value
      : playableCountries(rules)

  if (isDespot.value && despotAt.value) {
    const { routes, sea } = trailLegs(trail.value)
    const destination = hovered.value ?? chosenMove.value
    const preview =
      destination &&
      manhuntHopShape(despotAt.value, destination) !== 'stay' &&
      (manhuntHopShape(despotAt.value, destination) === 'sea' ||
        isStraitHop(despotAt.value, destination))
        ? [`${despotAt.value}>${destination}`]
        : []
    if (chosenMove.value && chosenMove.value !== despotAt.value) {
      groupings.push({ color: PLANNED_FILL, countries: [chosenMove.value] })
    }
    groupings.push({ color: walkColor(1, 1, true), countries: [despotAt.value] })
    writeIfChanged(
      'ringed',
      planning.value && plan.value?.leak === undefined
        ? shownMoves.value.map(option => option.isoCode).filter(iso => iso !== despotAt.value)
        : []
    )
    writeIfChanged('seaGlow', planning.value && legalMoves.value.sea.length ? [despotAt.value] : [])
    writeIfChanged('pulsing', [despotAt.value])
    writeIfChanged('landRoutes', routes)
    const fan = seaFanOpen.value
      ? legalMoves.value.sea.map(isoCode => `${despotAt.value}>${isoCode}`)
      : preview
    writeIfChanged('seaLinks', [...sea, ...fan])
    writeIfChanged('focus', [
      ...new Set([
        despotAt.value,
        ...shownMoves.value.map(option => option.isoCode),
        ...Object.values(state.value.claims),
        ...Object.values(state.value.pings),
      ]),
    ])
  } else {
    writeIfChanged('ringed', staged.value ? [staged.value] : [])
    writeIfChanged('seaGlow', [])
    writeIfChanged('pulsing', [])
    writeIfChanged('landRoutes', [])
    writeIfChanged('seaLinks', [])
    writeIfChanged('focus', [...knowledge])
  }

  gameStore.map.staggered = washing || rippling.value
  writeGroupings(groupings)
}

watch(
  [
    challenge,
    trail,
    plan,
    pendingMove,
    hovered,
    staged,
    analysed,
    live,
    seaFanOpen,
    readings,
    rippling,
  ],
  () => paintPursuit(),
  { immediate: true, deep: true }
)

const scheduleReplay = createViewTimer()

// The reveal replay: the whole escape trail re-arrives hop by hop for the
// entire table. Immediate, so a reconnecting client still gets the replay.
watch(
  finished,
  done => {
    if (!done) return
    const walk = state.value.outcome?.trail ?? []
    gameStore.map.countryGroupings = undefined
    gameStore.map.tints = {}
    gameStore.map.pulsing = []
    gameStore.map.ringed = []
    gameStore.map.landRoutes = []
    gameStore.map.seaGlow = []
    scheduleReplay(() => {
      const { routes, sea } = trailLegs(walk)
      gameStore.map.staggered = true
      gameStore.map.countryGroupings = walk.map((isoCode, index) => ({
        color: walkColor(index, walk.length, index === walk.length - 1),
        countries: [isoCode],
      }))
      gameStore.map.seaLinks = sea
      gameStore.map.landRoutes = routes
      gameStore.map.focus = [...new Set(walk)]
    }, REPLAY_REDRAW_MS)
  },
  { immediate: true }
)

// --- Layout -----------------------------------------------------------------

const caseFileOpen = ref(false)
const dock = ref<HTMLElement>()
const promptHost = ref<InstanceType<typeof ChallengePrompt>>()
useFooterBerth(dock)
usePromptBerth(
  computed(() => promptHost.value?.$el as HTMLElement | undefined),
  () => !briefing.value
)

const briefingParticipants = computed(() =>
  challenge.value ? [challenge.value.despotId, ...state.value.detectives] : []
)
const { sent: sentReady, send: sendReady } = useAckOnce(() => ({ event: 'manhunt-ready' }))

const { secondsOnClock } = useDeadlineClock(() => state.value.deadline)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

header .hint {
  padding: 0.5rem 1.6rem;
  font-weight: bold;
}

header .headline-line {
  gap: 1rem;
  display: inline-flex;
  align-items: center;

  .despot-hat {
    width: 3.6rem;
    flex-shrink: 0;
  }

  .beat-clock {
    --clock-size: 3.6rem;
    --clock-seconds-size: 1.3rem;
  }

  @media screen and (max-width: $phone) {
    gap: 0.7rem;

    .despot-hat {
      width: 2.6rem;
    }

    .beat-clock {
      --clock-size: 3rem;
      --clock-seconds-size: 1.1rem;
    }
  }
}

// The leak IS the beat — a dispatch card, so the eye lands on it before the map.
header .intel-card {
  gap: 0.2rem;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
  max-width: min(46rem, calc(100vw - 2.4rem));
  padding: 0.7rem 1.8rem;
  border-width: 0.15rem;
  border-color: ink(0.55, 41%);
  box-shadow: 0 0.3rem 1.2rem ink(0.18);

  .intel-eyebrow {
    margin: 0;
  }

  .intel-line {
    font-size: 1.25em;
    font-weight: bold;
    line-height: 1.2;
  }

  .intel-analysis {
    font-size: 0.85em;
    opacity: 0.7;
  }

  @media screen and (max-width: $phone), screen and (max-height: $short) {
    padding: 0.4rem 1.2rem;

    .intel-line {
      font-size: 1.05em;
    }

    .intel-analysis {
      display: none;
    }
  }
}

.hunt-dock {
  gap: 0.6rem;

  @media screen and (max-height: $short) {
    gap: 0.35rem;
  }

  display: flex;
  margin: 0 auto;
  align-items: center;
  flex-flow: column nowrap;
  width: min(52rem, calc(100vw - 2.4rem));
}

.dock-status {
  gap: 0.6rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.6rem 0.45rem 1.2rem;
  pointer-events: auto;

  .chip {
    width: 0.75rem;
    height: 0.75rem;
    flex-shrink: 0;
    border-radius: 50%;
  }

  .status-main {
    gap: 0.6rem;
    display: inline-flex;
    align-items: center;
  }

  .status-text {
    font-weight: bold;
  }

  .favour-pips span {
    color: ink(1, 41%);

    &.spent {
      opacity: 0.25;
    }
  }

  .hideout-count {
    opacity: 0.7;
    font-size: 0.9em;
  }
}

.dock-actions {
  gap: 0.4rem;
  display: inline-flex;
}

.dock-button {
  font: inherit;
  gap: 0.2rem;
  min-width: 3.4rem;
  min-height: 3.4rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dark-blue);
  padding: 0.2rem 0.8rem;
  border-radius: 1.7rem;
  border: 0.1rem solid ink(0.35, 41%);
  background: none;
  pointer-events: auto;

  &.open {
    border-color: ink(0.55, 41%);
    background: hsla(212, 58%, 62%, 0.18);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .button-icon {
    width: 1.8rem;
    height: 1.8rem;
  }

  .button-count {
    font-size: 0.8em;
    font-weight: bold;
  }
}

.served {
  margin: 0;
  font-size: 0.95em;
  padding: 0.3rem 1.2rem;
  color: ink(1, 41%);
}

.topic-row {
  gap: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;

  .topic-chip {
    font: inherit;
    gap: 0.45rem;
    display: inline-flex;
    cursor: pointer;
    align-items: center;
    min-height: 3.6rem;
    padding: 0.3rem 1rem;
    color: var(--dark-blue);
    pointer-events: auto;

    .chip-icon {
      width: 1.6rem;
      height: 1.6rem;
    }
  }
}

// This beat's one action, as a two-way switch: a ping by default.
.action-switch {
  gap: 0.4rem;
  display: flex;
  pointer-events: auto;

  .switch-option {
    font: inherit;
    gap: 0.4rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    min-height: 3.8rem;
    padding: 0.3rem 1.4rem;
    color: var(--dark-blue);

    small {
      opacity: 0.7;
    }

    &.active {
      font-weight: bold;
      border-width: 0.18rem;
      border-color: var(--dark-blue);
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
}

.stage-row {
  gap: 0.6rem;
  display: flex;
  align-items: center;
  pointer-events: auto;

  .staged {
    font-weight: bold;
  }
}

.chip-tag {
  opacity: 0.75;
  font-size: 0.85em;
  font-weight: bold;
}

// The flee rail: one row on every width — the legal hops are a handful, and
// a wrapping block of them would bury the map they are pinned to.
.flee {
  flex-wrap: nowrap;
  max-width: 100%;
  overflow-x: auto;
  justify-content: safe center;
  scrollbar-width: none;

  .fan-toggle {
    font: inherit;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.4rem 1.2rem;
    color: ink(1, 41%);
    font-weight: bold;

    &.open {
      border-color: ink(0.55, 41%);
    }
  }

  .flee-option {
    font: inherit;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    color: var(--dark-blue);

    &.chosen {
      font-weight: bold;
      border-width: 0.15rem;
      border-color: hsl(20, 80%, 44%);
    }
  }
}

.leak-pick {
  gap: 0.5rem;
  width: 100%;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .eyebrow {
    margin: 0;
  }

  .card-options {
    width: 100%;
    grid-template-columns: 1fr 1fr;

    &.single {
      grid-template-columns: minmax(0, 28rem);
      justify-content: center;
    }

    @media screen and (max-width: $phone) {
      gap: 0.8rem;
    }
  }

  .leak-option {
    gap: 0.4rem;

    @media screen and (max-height: $short) {
      padding: 0.5rem 0.8rem;

      .leak-icon {
        display: none;
      }
    }

    padding: 0.8rem 1rem;
    text-align: center;

    .leak-icon {
      width: 2rem;
      height: 2rem;
    }

    .leak-text {
      font-weight: bold;
      line-height: 1.2;
    }

    .leak-width {
      opacity: 0.7;
      font-size: 0.85em;
    }
  }
}

.case-file {
  gap: 0.4rem;
  width: 100%;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .case-toggle {
    font: inherit;
    cursor: pointer;
    font-size: 0.95em;
    padding: 0.3rem 1.2rem;
    color: var(--dark-blue);
    pointer-events: auto;

    .toggle-mark {
      margin-left: 0.3rem;
    }
  }
}

.leak-list {
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
  max-height: 24dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  pointer-events: auto;

  .leak-row {
    gap: 0.6rem;
    display: flex;
    align-items: center;
    padding: 0.35rem 1rem;
    text-align: left;
  }

  .row-icon {
    width: 1.6rem;
    height: 1.6rem;
    flex-shrink: 0;
  }

  .row-hop {
    opacity: 0.6;
    font-weight: bold;
    min-width: 1.2rem;
  }

  .row-text {
    flex: 1;
  }

  .reading {
    --sonar-color: var(--warmth);
    box-shadow: inset 0.3rem 0 0 var(--warmth);
  }
}

// Layout and scrolling come from the shared .briefing-card template; only
// the Despot flavour lives here.
.briefing {
  &.despotic {
    color: #fff;
    border-color: hsl(18, 75%, 34%);
    background: hsl(20, 80%, 44%);

    :deep(.briefing-waiting) {
      opacity: 0.9;
    }

    :deep(.seat-name) {
      color: #fff;
    }
  }

  .briefing-hat {
    width: 5.2rem;
    transform: rotate(-9deg);
  }
}

.ready-seat .seat-hat {
  width: 2.4rem;
  z-index: 1;
  // Seated ON the pawn's head, tipped — not hovering in the air above it.
  margin-bottom: -1.15rem;
  transform: rotate(-10deg);
}
</style>
