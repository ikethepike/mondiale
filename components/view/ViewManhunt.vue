<template>
  <div v-if="challenge" class="manhunt">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — The Despot`"
      :title="interstitialTitle"
      :stakes="stakes"
      @done="begin()"
    >
      <template #emblem>
        <DespotHat />
      </template>
    </Interstitial>

    <!-- Chips over the map: the despot's numbered trail (their eyes only)
         and last turn's dragnet misses as ✕ marks for everyone — a marker
         is a mark, never a country recoloured. -->
    <MapYearLabels
      v-if="!showInterstitial && mapChipEntries.length"
      :entries="mapChipEntries"
      :min-gap-px="26"
    />

    <!-- The shared round clock, re-swept on every beat handoff. -->
    <ChallengeTimerRadial
      v-if="!showInterstitial && !finished && !briefing"
      :key="`turn-${state.turn}`"
      class="round-clock"
      :value="secondsOnClock"
      :total="beatTotalSeconds"
    />

    <!-- The despot's action dock, moored by the clock: resources, never
         intel — the rail below stays pure knowledge. Pressing it fans out
         every reachable shore (the touch path to sea reach). -->
    <aside v-if="isDespot && !showInterstitial && !finished && !briefing" class="despot-dock">
      <button
        class="dock-line"
        :class="{ open: seaFanOpen }"
        :disabled="state.beat !== 'move' || !state.seaPassagesLeft"
        :aria-pressed="seaFanOpen"
        @click="seaFanOpen = !seaFanOpen"
      >
        <span
          v-for="index in challenge.seaPassages"
          :key="index"
          class="passage-pip"
          :class="{ spent: index > state.seaPassagesLeft }"
        >⚓</span>
      </button>
      <span class="dock-caption">
        {{
          !state.seaPassagesLeft
            ? 'no passages left'
            : seaFanOpen
              ? 'sea reach shown'
              : 'show sea reach'
        }}
      </span>
    </aside>

    <header>
      <div class="prompt">
        <h1 class="map-caption headline-line">
          <DespotHat class="despot-hat" />
          <span>{{ headline }}</span>
        </h1>
        <!-- One status line: the sea-passage announcement IS the beat's
             statement while it's live, so it replaces the turn line rather
             than stacking on it. Still, no motion — the wash on the map
             carries the drama. -->
        <Transition name="caption" mode="out-in">
          <span v-if="!finished && seaPassageAnnounced" class="map-caption sub sea-banner">
            ⚓ The Despot has taken sea passage!
          </span>
          <span v-else-if="!finished" :key="beatLabel" class="map-caption sub turn-line">
            <span class="chip" :style="{ background: despotPlayer?.color }" />
            <span>{{ beatLabel }}</span>
          </span>
        </Transition>
        <Transition name="caption" mode="out-in">
          <span v-if="clueLine" :key="clueLine" class="map-caption intel-card">
            {{ clueLine }}
          </span>
        </Transition>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <!-- The briefing: role cards each player dismisses explicitly. No clock
         runs until the whole table is ready (or the server's cap forces it). -->
    <section v-if="briefing" class="briefing pane tr decorator-bottom">
      <DespotHat class="briefing-hat" />
      <h2>{{ isDespot ? 'Your escape plan' : 'Your case file' }}</h2>
      <ul class="briefing-points">
        <template v-if="isDespot">
          <li>Each turn, hop to a neighbouring country — across a border or a strait.</li>
          <li>⚓ Sea passages jump a whole shared sea, but the crossing is announced.</li>
          <li>Every turn the hunt learns one true fact about your hideout.</li>
          <li>Survive {{ challenge.turnCount }} turns and the treasury is yours.</li>
        </template>
        <template v-else>
          <li>Each turn brings one true intel report on the Despot's hideout.</li>
          <li>Click the map to drop your marker — land on the Despot to capture.</li>
          <li>⚖ Subpoenas force the next clue onto a topic of your choosing.</li>
          <li>The closer your final marker, the bigger your share of the bounty.</li>
        </template>
      </ul>
      <ButtonFilled v-if="!iAmReady" @click="sendReady">
        {{ isDespot ? 'Start running' : 'Open the hunt' }}
      </ButtonFilled>
      <p v-else class="briefing-waiting">
        {{ state.ready.length }} of {{ tableSize }} ready…
      </p>
    </section>

    <ManhuntReveal
      v-if="finished"
      class="reveal"
      :challenge="challenge"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.playerId"
    />

    <footer>
      <!-- One dock, one surface: the intel dossier (Stat Detective's card
           language) with the round's actions in a single row above it. -->
      <div v-if="!finished && !briefing && !showInterstitial" class="hunt-dock">
        <div v-if="canSubpoena || isDespot || iAmDetective" class="dock-actions map-caption">
          <template v-if="canSubpoena">
            <span class="subpoena-lead">
              ⚖
              <span
                v-for="index in challenge.subpoenas"
                :key="index"
                class="token-pip"
                :class="{ spent: index > mySubpoenas }"
              />
            </span>
            <button
              v-for="topic in MANHUNT_SUBPOENA_TOPICS"
              :key="topic.id"
              class="topic-chip"
              :disabled="subpoenaPending"
              @click="sendSubpoena(topic.id)"
            >
              <StatTopicIcon
                class="chip-icon"
                :topic="topic.icon.topic"
                :accessor="topic.icon.accessor"
              />
              <span>{{ topic.label }}</span>
            </button>
            <span class="dock-divider" />
          </template>
          <button class="topic-chip" :disabled="tauntCooling" @click="sendTaunt">
            <StatTopicIcon class="chip-icon" topic="society.protest" />
            <span>Taunt</span>
          </button>
        </div>
        <ol v-if="recentClues.length" class="intel">
          <li v-if="isDespot" class="rail-label map-caption">What the hunt knows</li>
          <StatCard
            v-for="clue in recentClues"
            :key="clue.text"
            tag="li"
            class="intel-row"
            :accessor="clue.accessorId"
            :topic="clue.topic"
            :label="clue.askedBy ? `Turn ${clue.hop} · ⚖ ${nameOf(clue.askedBy)}` : `Turn ${clue.hop}`"
          >
            <span class="intel-text">{{ clue.text }}</span>
          </StatCard>
        </ol>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import StatCard from '~/components/challenge/StatCard.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import DespotHat from '~/components/challenge/DespotHat.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ManhuntReveal from '~/components/challenge/ManhuntReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import { countryName, getCountry } from '~~/lib/country'
import { isStraitHop } from '~~/lib/chain'
import {
  legalManhuntMoves,
  MANHUNT_SUBPOENA_TOPICS,
  MANHUNT_TAUNTS,
  type ManhuntSubpoenaTopicId,
} from '~~/lib/manhunt'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { isCountryPlayable, playableCountries } from '~~/lib/game-rules'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { CountryColorGrouping } from '~~/types/map.type'
import { isMapClickEvent, isMapHoverEvent } from '~~/types/events.types'
import type { ManhuntState } from '~~/types/challenges/group-modes.type'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

// The whole world stays visible — the pursuit needs the map for context.
const {
  challenge,
  currentRound,
  showInterstitial,
  begin,
  hint,
  announce,
  entries,
  registerCleanup,
  gameStore,
  update,
} = useGroupChallenge('manhunt-challenge', { solo: false })

// Total fallback: timers and watchers keep evaluating for a beat after the
// round advances past manhunt, so the state must never dereference undefined.
const EMPTY_STATE: ManhuntState = {
  ready: [],
  turn: 0,
  hop: 1,
  beat: 'move',
  deadline: 0,
  detectives: [],
  clues: [],
  moves: [],
  seaPassagesLeft: 0,
  subpoenasLeft: {},
  candidates: [],
  dragnets: [],
  committed: [],
}

const state = computed(() => challenge.value?.state ?? EMPTY_STATE)
const finished = computed(() => !!state.value.finished)
const isDespot = computed(() => challenge.value?.despotId === gameStore.playerId)
const despotPlayer = computed(() =>
  challenge.value ? gameStore.game?.players[challenge.value.despotId] : undefined
)
const despotName = computed(() => despotPlayer.value?.name || 'Anonymous')

/** The despot's own trail, from the targeted position channel — empty for
 *  everyone else, always. */
const trail = computed(() => (isDespot.value ? (gameStore.manhunt?.trail ?? []) : []))
const despotAt = computed(() => trail.value[trail.value.length - 1])

// The despot re-asks for their trail on mount — covers reveal AND reconnect.
onMounted(() => {
  if (isDespot.value) update({ event: 'fetch-manhunt-position' })
})

// Off-board and benched (micro-nation) countries both fade — the despot can
// reach neither, so the rule is visible before a hop is attempted.
const rules = gameStore.game ?? { variant: 'world' as const, difficulty: 'normal' as const }
gameStore.map.dimmed = ISOCountryCodes.filter(isoCode => !isCountryPlayable(rules, isoCode))

const trailEntries = computed(() =>
  trail.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
)

const playerColor = (playerId: string): string | undefined =>
  gameStore.game?.players[playerId]?.color

/** Trail numbers (despot only), the last dragnet's misses as ✕ marks wearing
 *  each detective's colour (several markers on one country fall back to a
 *  neutral ✕N), and — while a hunt beat is live — your own locked marker in
 *  your colour. On easy, the despot's legal hops carry their ISO chips too:
 *  border chain's exact assist, same gating. */
const mapChipEntries = computed(() => {
  const entries: { isoCode: ISOCountryCode; label: string; color?: string }[] = [
    ...trailEntries.value,
  ]
  if (finished.value) return entries
  const taken = new Set(trail.value)

  const byCountry = new Map<ISOCountryCode, string[]>()
  for (const [playerId, isoCode] of Object.entries(lastDragnet.value?.markers ?? {})) {
    const list = byCountry.get(isoCode as ISOCountryCode) ?? []
    list.push(playerId)
    byCountry.set(isoCode as ISOCountryCode, list)
  }
  for (const [isoCode, playerIds] of byCountry) {
    if (taken.has(isoCode)) continue
    entries.push(
      playerIds.length === 1
        ? { isoCode, label: '✕', color: playerColor(playerIds[0]) }
        : { isoCode, label: `✕${playerIds.length}` }
    )
  }

  if (iAmDetective.value && state.value.beat === 'hunt' && myMarker.value) {
    entries.push({ isoCode: myMarker.value, label: '✕', color: playerColor(gameStore.playerId) })
  }

  if (isDespot.value && state.value.beat === 'move' && gameStore.game?.difficulty === 'easy') {
    for (const isoCode of [...legalMoves.value.ground, ...legalMoves.value.sea]) {
      if (!taken.has(isoCode)) entries.push({ isoCode, label: isoCode })
    }
  }
  return entries
})

const interstitialTitle = computed(() =>
  isDespot.value
    ? 'You are the Despot — run'
    : `${despotName.value} is the deposed Despot — hunt them down`
)

const stakes = computed(() => {
  const hops = challenge.value?.turnCount ?? 0
  if (isDespot.value) {
    return `Slip across borders one hop per turn — survive ${hops} turns and the treasury is yours. Every turn Interpol leaks one true fact about your hideout, and every detective drops a marker. ${challenge.value?.seaPassages ?? 0} sea passages let you jump across a shared sea, but the fleet's movements are announced.`
  }
  return `The Despot flees one country per turn. Each turn brings one true intel report on their hideout — then every detective drops a marker. Land yours on the Despot to capture them; the closer your final marker, the bigger your share of the bounty.`
})

const headline = computed(() => {
  if (finished.value) {
    const outcome = state.value.outcome
    if (outcome?.kind === 'captured') {
      return `Captured in ${countryName(getCountry(outcome.country))}`
    }
    return 'The Despot escaped'
  }
  return `The hunt — turn ${state.value.hop} of ${challenge.value?.turnCount}`
})

const beatLabel = computed(() => {
  if (state.value.beat === 'move') {
    return isDespot.value ? 'Your move — pick your next hideout' : 'The Despot is on the move…'
  }
  const locked = state.value.committed.length
  const total = state.value.detectives.length
  if (isDespot.value) return `The dragnet closes — ${locked} of ${total} markers locked`
  return iCommitted.value
    ? `Marker locked — ${locked} of ${total} in`
    : 'Drop your marker on the hideout'
})

const clueLine = computed(() => {
  if (finished.value || state.value.beat !== 'hunt') return ''
  const clue = state.value.clues[state.value.clues.length - 1]
  return clue ? `Intel: ${clue.text}` : ''
})

/** The last hop was an announced sea passage — shown through its hunt beat. */
const seaPassageAnnounced = computed(() => {
  if (finished.value || state.value.beat !== 'hunt') return false
  const lastMove = state.value.moves[state.value.moves.length - 1]
  return lastMove?.kind === 'sea' && lastMove.hop === state.value.hop
})

const recentClues = computed(() => [...state.value.clues].slice(-4).reverse())

const iCommitted = computed(() => state.value.committed.includes(gameStore.playerId))
const iAmDetective = computed(() => state.value.detectives.includes(gameStore.playerId))

const briefing = computed(() => !!state.value.briefing && !finished.value && !showInterstitial.value)
const iAmReady = computed(() => state.value.ready.includes(gameStore.playerId))
const tableSize = computed(() => state.value.detectives.length + 1)
const readySent = ref(false)
const sendReady = () => {
  if (readySent.value) return
  readySent.value = true
  update({ event: 'manhunt-ready' })
}

const tauntCooling = ref(false)
let tauntTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => tauntTimer && clearTimeout(tauntTimer))
const sendTaunt = () => {
  if (tauntCooling.value) return
  const lines = MANHUNT_TAUNTS[isDespot.value ? 'despot' : 'detective']
  update({ event: 'manhunt-taunt', index: Math.floor(Math.random() * lines.length) })
  tauntCooling.value = true
  tauntTimer = setTimeout(() => (tauntCooling.value = false), 6000)
}

const nameOf = (playerId: string) =>
  playerId === gameStore.playerId ? 'you' : gameStore.game?.players[playerId]?.name || 'Anonymous'

// --- Subpoenas ---------------------------------------------------------------
const mySubpoenas = computed(() => state.value.subpoenasLeft[gameStore.playerId] ?? 0)
const canSubpoena = computed(
  () =>
    !finished.value &&
    !showInterstitial.value &&
    iAmDetective.value &&
    state.value.beat === 'hunt' &&
    mySubpoenas.value > 0
)
/** One in flight at a time; unlocks when the answer lands (clue count grows). */
const subpoenaPending = ref(false)
watch(
  () => state.value.clues.length,
  () => (subpoenaPending.value = false)
)
const sendSubpoena = (topic: ManhuntSubpoenaTopicId) => {
  if (!canSubpoena.value || subpoenaPending.value) return
  subpoenaPending.value = true
  update({ event: 'submit-manhunt-subpoena', topic, turn: state.value.turn })
}

// --- Shot clock (server-owned deadline; local repaint only) ------------------
const secondsOnClock = ref(0)
const clock = setInterval(() => {
  const remaining = (state.value.deadline ?? 0) - Date.now()
  secondsOnClock.value = Math.max(0, Math.ceil(remaining / 1000))
}, 200)
registerCleanup(() => clearInterval(clock))

const beatTotalSeconds = computed(() =>
  state.value.beat === 'move'
    ? (challenge.value?.moveSeconds ?? 0)
    : (challenge.value?.huntSeconds ?? 0)
)

// --- Acting ------------------------------------------------------------------
const pending = ref(false)
watch(
  () => state.value.turn,
  () => (pending.value = false)
)

const legalMoves = computed(() => {
  if (!isDespot.value || !despotAt.value) return { ground: [], sea: [] }
  return legalManhuntMoves(despotAt.value, state.value.seaPassagesLeft, rules)
})

/** My locked marker this beat — client-side memory; the snapshot never names it. */
const myMarker = ref<ISOCountryCode | undefined>()
watch(
  () => state.value.hop,
  () => (myMarker.value = undefined)
)

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || finished.value || pending.value || briefing.value) return
  const active = challenge.value
  if (!active) return
  const isoCode = event.detail.isoCode
  if (!isValidISOCode(isoCode)) return

  if (isDespot.value && state.value.beat === 'move') {
    const { ground, sea } = legalMoves.value
    if (!ground.includes(isoCode) && !sea.includes(isoCode)) {
      return announce({ hint: `You can't reach ${countryName(getCountry(isoCode))} from here` })
    }
    pending.value = true
    update({ event: 'submit-manhunt-move', isoCode, turn: state.value.turn })
    return
  }

  if (iAmDetective.value && state.value.beat === 'hunt' && !iCommitted.value) {
    myMarker.value = isoCode
    pending.value = true
    update({ event: 'submit-manhunt-marker', isoCode, turn: state.value.turn })
    // Presence only — a named marker would be a bearing on the hideout.
    announce({ kind: 'locked' })
  }
}

onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))

// --- Sea reach, on demand ----------------------------------------------------
// The despot's own sailed legs stay drawn (their journey); prospective sea
// reach appears only on demand — a hover previews one passage, the dock's ⚓
// fans out all of them (the touch path). Never a standing wash.
const hoveredSea = ref<ISOCountryCode | undefined>()
const hoveredGround = ref<ISOCountryCode | undefined>()
const seaFanOpen = ref(false)

/** The trail's own water legs (sea passages and strait hops), directed. */
const trailSeaKeys = computed(() => {
  if (!isDespot.value) return [] as string[]
  const keys: string[] = []
  for (let index = 1; index < trail.value.length; index++) {
    const [a, b] = [trail.value[index - 1], trail.value[index]]
    if (state.value.moves[index - 1]?.kind === 'sea' || isStraitHop(a, b)) keys.push(`${a}>${b}`)
  }
  return keys
})

const previewSeaKeys = computed(() => {
  if (finished.value || !isDespot.value || state.value.beat !== 'move') return [] as string[]
  const from = despotAt.value
  if (!from) return []
  if (seaFanOpen.value) return legalMoves.value.sea.map(isoCode => `${from}>${isoCode}`)
  if (hoveredSea.value) return [`${from}>${hoveredSea.value}`]
  // A hovered strait neighbour is a FREE water crossing — without the arc it
  // reads as a plain land border (the Italy→Greece mystery).
  if (hoveredGround.value && isStraitHop(from, hoveredGround.value)) {
    return [`${from}>${hoveredGround.value}`]
  }
  return []
})

const onMapHover = (event: Event) => {
  if (!isMapHoverEvent(event)) return
  if (finished.value || !isDespot.value || state.value.beat !== 'move') return
  const hovered = event.detail.isoCode
  const legal = isValidISOCode(hovered)
  hoveredSea.value = legal && legalMoves.value.sea.includes(hovered) ? hovered : undefined
  hoveredGround.value = legal && legalMoves.value.ground.includes(hovered) ? hovered : undefined
}
onBeforeMount(() => document.addEventListener('mapHover', onMapHover))
registerCleanup(() => document.removeEventListener('mapHover', onMapHover))
// A beat handoff clears every under-the-cursor answer; the fan is always
// an explicit request, never a default.
watch(
  () => state.value.beat,
  () => {
    hoveredSea.value = undefined
    hoveredGround.value = undefined
    seaFanOpen.value = false
  }
)

// --- Painting the map --------------------------------------------------------
/** Candidates in one quiet blue; the despot's trail deepens along the walk. */
const CANDIDATE_FILL = 'hsla(212, 58%, 62%, 0.4)'
const trailColor = (index: number, count: number, head: boolean): string => {
  if (head) return 'hsla(24, 80%, 55%, 0.92)'
  const t = count <= 1 ? 1 : index / (count - 1)
  return `hsla(212, 58%, ${72 - t * 30}%, ${0.5 + t * 0.35})`
}

const lastDragnet = computed(() => state.value.dragnets[state.value.dragnets.length - 1])

/** The beat whose sea-passage wash already ran (staggered arrival is a
 *  once-per-announcement moment, not a repaint effect). */
let washedTurn = -1

/** Replace a map list only when its contents changed — same-content writes
 *  churn watchers downstream (worst of all the camera tween). */
const writeIfChanged = (
  key: 'focus' | 'ringed' | 'seaGlow' | 'pulsing' | 'landRoutes' | 'seaLinks',
  next: string[]
) => {
  if (gameStore.map[key].join('|') !== next.join('|')) gameStore.map[key] = next as never
}

const paintPursuit = () => {
  if (finished.value) return
  const groupings: CountryColorGrouping[] = []

  // Everyone: the painted candidate set (empty on hard) and the last dragnet.
  // An announced sea passage gets the full beat moment: the set arrives as a
  // staggered wash, one country after another — the net visibly blowing open.
  // Once per beat: mid-beat repaints (marker commits) must not re-run it.
  const washing =
    seaPassageAnnounced.value && state.value.candidates.length > 0 && washedTurn !== state.value.turn
  if (washing) washedTurn = state.value.turn
  if (washing) {
    for (const isoCode of state.value.candidates) {
      groupings.push({ color: CANDIDATE_FILL, countries: [isoCode] })
    }
  } else if (state.value.candidates.length) {
    groupings.push({ color: CANDIDATE_FILL, countries: [...state.value.candidates] })
  }
  // Dragnet misses render as ✕ chips (mapChipEntries), never as fills — a
  // pink country reads as state about the COUNTRY, not about a marker.

  // The camera frames the live knowledge: the candidate set where painted,
  // else the playable board — a Europe game plays on Europe, not a world map
  // with a postage stamp of action. Written ONLY on real change: a fresh
  // array identity per paint retargets GameMap's camera tween, the map
  // glides under the resting cursor, hover exits fire, and the repaint loop
  // keeps the camera restless forever (the bug that ate the hover rings).
  writeIfChanged(
    'focus',
    state.value.candidates.length ? [...state.value.candidates] : playableCountries(rules)
  )

  // Despot: fills stay the knowledge channel — only the hideout itself gets
  // the ember fill. The journey is a route line, the options are rings, and
  // sea reach appears on demand (hover, or the dock's fan) — never a wash.
  const tints: (typeof gameStore.map)['tints'] = {}
  const routes: string[] = []
  if (isDespot.value && trail.value.length) {
    for (let index = 1; index < trail.value.length; index++) {
      const [a, b] = [trail.value[index - 1], trail.value[index]]
      const sailed = state.value.moves[index - 1]?.kind === 'sea' || isStraitHop(a, b)
      if (!sailed) routes.push(`${a}>${b}`)
    }
    if (despotAt.value) {
      groupings.push({ color: trailColor(1, 1, true), countries: [despotAt.value] })
    }
    const hovered = hoveredGround.value ?? hoveredSea.value
    writeIfChanged('ringed', state.value.beat === 'move' && hovered ? [hovered] : [])
    writeIfChanged(
      'seaGlow',
      state.value.beat === 'move' && state.value.seaPassagesLeft > 0 && legalMoves.value.sea.length
        ? [despotAt.value].filter(Boolean)
        : []
    )
    writeIfChanged('pulsing', despotAt.value ? [despotAt.value] : [])
  } else {
    writeIfChanged('ringed', [])
    writeIfChanged('seaGlow', [])
    writeIfChanged('pulsing', [])
  }

  // The detective's own marker renders as their coloured chip (mapChipEntries),
  // not a fill — fills stay the knowledge channel.

  writeIfChanged('landRoutes', routes)
  writeIfChanged('seaLinks', trailSeaKeys.value.concat(previewSeaKeys.value))
  gameStore.map.staggered = washing
  gameStore.map.countryGroupings = groupings
  gameStore.map.tints = tints
}

watch([challenge, trail, myMarker, hoveredSea, hoveredGround, seaFanOpen], () => paintPursuit(), {
  immediate: true,
  deep: true,
})

/** Overland legs of the reveal walk — the escape route's solid strokes. */
const revealLandRoutes = (walk: ISOCountryCode[]): string[] => {
  const seaHops = new Set(
    state.value.moves.filter(move => move.kind === 'sea').map(move => move.hop)
  )
  const keys: string[] = []
  for (let index = 1; index < walk.length; index++) {
    const [a, b] = [walk[index - 1], walk[index]]
    if (!seaHops.has(index) && !isStraitHop(a, b)) keys.push(`${a}>${b}`)
  }
  return keys
}

/** Sea-arc keys for the reveal walk: strait hops and sea passages both. */
const revealSeaLinks = (walk: ISOCountryCode[]): string[] => {
  const keys: string[] = []
  const seaHops = new Set(
    state.value.moves.filter(move => move.kind === 'sea').map(move => move.hop)
  )
  for (let index = 1; index < walk.length; index++) {
    const [a, b] = [walk[index - 1], walk[index]]
    // Directed: the reveal's arcs drift the way the despot actually fled.
    if (seaHops.has(index) || isStraitHop(a, b)) keys.push(`${a}>${b}`)
  }
  return keys
}

// The reveal replay: the whole escape trail re-arrives hop by hop for the
// entire table — the trail is finally public inside state.outcome. Immediate,
// so a reconnecting client still gets the replay.
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
    setTimeout(() => {
      const groupings: CountryColorGrouping[] = walk.map((isoCode, index) => ({
        color: trailColor(index, walk.length, index === walk.length - 1),
        countries: [isoCode],
      }))
      gameStore.map.staggered = true
      gameStore.map.countryGroupings = groupings
      gameStore.map.seaLinks = revealSeaLinks(walk)
      gameStore.map.landRoutes = revealLandRoutes(walk)
      gameStore.map.focus = [...walk]
    }, 400)
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.manhunt {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
  }

  .sub {
    padding: 0.4rem 1.4rem;
  }

  .hint {
    padding: 0.5rem 1.6rem;
    font-weight: bold;
    color: var(--hior-ange);
    border-color: var(--hior-ange);
  }

  // The intel line IS the round each turn — dressed as a dispatch card
  // rather than a sub-caption, so the eye lands on it before the map.
  .intel-card {
    font-size: 1.25em;
    font-weight: bold;
    padding: 0.8rem 2rem;
    border-width: 0.15rem;
    border-color: hsla(215.7, 76.4%, 41%, 0.55);
    box-shadow: 0 0.3rem 1.2rem hsla(215.7, 76.4%, 21.6%, 0.18);
  }

  .sea-banner {
    font-weight: bold;
    color: hsl(215.7, 76.4%, 41%);
    border-color: hsla(215.7, 76.4%, 41%, 0.55);
  }
}

.hunt-dock {
  gap: 0.6rem;
  display: flex;
  margin: 0 auto;
  align-items: center;
  flex-flow: column nowrap;
  max-width: calc(100vw - 2.4rem);
}

// One pill holds every action — the console language, not floating chips.
.dock-actions {
  gap: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 1rem;
  pointer-events: auto;

  .subpoena-lead {
    gap: 0.3rem;
    display: inline-flex;
    align-items: center;
    font-weight: bold;
    margin-right: 0.2rem;
  }

  .token-pip {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: hsl(215.7, 76.4%, 41%);

    &.spent {
      opacity: 0.25;
    }
  }

  .dock-divider {
    width: 0.1rem;
    height: 1.8rem;
    background: hsla(215.7, 76.4%, 21.6%, 0.25);
  }

  .topic-chip {
    font: inherit;
    gap: 0.45rem;
    display: inline-flex;
    cursor: pointer;
    align-items: center;
    color: var(--dark-blue);
    padding: 0.3rem 0.9rem;
    border-radius: 1rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 41%, 0.35);
    background: none;

    .chip-icon {
      width: 1.6rem;
      height: 1.6rem;
    }

    &:hover:not(:disabled) {
      background: hsla(212, 58%, 62%, 0.18);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}

.intel {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  align-items: stretch;
  justify-content: center;
}

.intel-row {
  max-width: 24rem;

  .intel-text {
    display: block;
  }
}

.rail-label {
  opacity: 0.75;
  font-weight: bold;
  align-self: center;
  padding: 0.4rem 1.2rem;
}

header .prompt {
  gap: 1rem;
  display: flex;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;
}

.turn-line {
  gap: 0.6rem;
  display: inline-flex;
  align-items: center;

  .chip {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }
}

// The despot's resources, moored under the shared round clock.
.despot-dock {
  top: calc(2rem + 7.2rem);
  right: 2rem;
  z-index: 5;
  gap: 0.2rem;
  display: flex;
  position: absolute;
  align-items: center;
  flex-flow: column nowrap;
  pointer-events: auto;

  .dock-line {
    gap: 0.3rem;
    display: flex;
    cursor: pointer;
    padding: 0.3rem 0.8rem;
    border-radius: 1rem;
    border: 0.1rem solid transparent;
    background: none;

    &.open {
      border-color: hsla(215.7, 76.4%, 41%, 0.55);
      background: hsla(212, 58%, 62%, 0.18);
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  }

  .passage-pip {
    font-size: 1.5rem;
    color: hsl(215.7, 76.4%, 41%);

    &.spent {
      opacity: 0.25;
    }
  }

  .dock-caption {
    font-size: 1.1rem;
    opacity: 0.7;
    color: var(--dark-blue);
  }

  @media screen and (max-width: $tablet) {
    top: auto;
    right: calc(1.2rem + var(--safe-right));
    bottom: calc(1.6rem + var(--safe-bottom) + 6rem);
  }
}

.briefing {
  gap: 1rem;
  z-index: 3;
  display: flex;
  margin: 0 auto;
  padding: 1.8rem 2.2rem;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
  pointer-events: auto;
  max-width: min(34rem, calc(100% - 2.4rem));

  .briefing-hat {
    width: 5.2rem;
    transform: rotate(-9deg);
  }

  h2 {
    margin: 0;
  }
}

.briefing-points {
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  text-align: left;
  gap: 0.55rem;
  flex-flow: column nowrap;
}

.briefing-waiting {
  margin: 0;
  opacity: 0.75;
}

.reveal {
  z-index: 2;
  margin: 0 auto;
  max-width: min(34rem, calc(100% - 2.4rem));
}

footer {
  z-index: 2;
  padding: 2rem;
}

@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }
  }
</style>
