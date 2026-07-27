<template>
  <div v-if="challenge" class="manhunt">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — The Despot`"
      :title="interstitialTitle"
      :stakes="stakes"
      @done="begin()"
    />

    <!-- Walk-order numbers over the trail — despot's eyes only. -->
    <MapYearLabels
      v-if="!showInterstitial && isDespot && trail.length"
      :entries="trailEntries"
      :min-gap-px="26"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">{{ headline }}</h1>
        <span
          v-if="!finished"
          class="map-caption sub turn-line"
          :style="{ '--ring': `${fractionLeft * 360}deg`, '--clock-warmth': clockWarmth }"
        >
          <span class="chip" :style="{ background: despotPlayer?.color }" />
          <span>{{ beatLabel }}</span>
          <span class="clock">{{ secondsOnClock }}s</span>
        </span>
        <Transition name="caption">
          <span v-if="seaPassageAnnounced" class="map-caption sub sea-banner">
            ⚓ The Despot has taken sea passage!
          </span>
        </Transition>
        <Transition name="caption" mode="out-in">
          <span v-if="clueLine" :key="clueLine" class="map-caption clue">
            {{ clueLine }}
          </span>
        </Transition>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <ManhuntReveal
      v-if="finished"
      class="reveal"
      :challenge="challenge"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.playerId"
    />

    <footer>
      <ol v-if="!finished" class="intel">
        <li v-if="isDespot && !finished" class="entry map-caption charges">
          ⚓ {{ state.seaPassagesLeft }} sea
          {{ state.seaPassagesLeft === 1 ? 'passage' : 'passages' }} left
        </li>
        <li v-for="clue in recentClues" :key="clue.hop" class="entry map-caption">
          <span class="hop-badge">{{ clue.hop }}</span>
          <span>{{ clue.text }}</span>
        </li>
      </ol>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ManhuntReveal from '~/components/challenge/ManhuntReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import { countryName, getCountry } from '~~/lib/country'
import { isStraitHop } from '~~/lib/chain'
import { legalManhuntMoves } from '~~/lib/manhunt'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { countryInVariant } from '~~/lib/variant'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { CountryColorGrouping } from '~~/types/map.type'
import { isMapClickEvent } from '~~/types/events.types'
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
  turn: 0,
  hop: 1,
  beat: 'move',
  deadline: 0,
  detectives: [],
  clues: [],
  moves: [],
  seaPassagesLeft: 0,
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

const variant = gameStore.game?.variant ?? 'world'
gameStore.map.dimmed =
  variant === 'world'
    ? []
    : ISOCountryCodes.filter(isoCode => !countryInVariant(isoCode, variant))

const trailEntries = computed(() =>
  trail.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
)

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

// --- Shot clock (server-owned deadline; local repaint only) ------------------
const secondsOnClock = ref(0)
const fractionLeft = ref(1)
const clock = setInterval(() => {
  const active = challenge.value
  if (!active) return
  const remaining = (state.value.deadline ?? 0) - Date.now()
  secondsOnClock.value = Math.max(0, Math.ceil(remaining / 1000))
  const total =
    (state.value.beat === 'move' ? active.moveSeconds : active.huntSeconds) * 1000
  fractionLeft.value = total ? Math.min(1, Math.max(0, remaining / total)) : 1
}, 200)
registerCleanup(() => clearInterval(clock))

const clockWarmth = computed(() => Math.round(Math.max(0, 0.5 - fractionLeft.value) * 200))

// --- Acting ------------------------------------------------------------------
const pending = ref(false)
watch(
  () => state.value.turn,
  () => (pending.value = false)
)

const legalMoves = computed(() => {
  if (!isDespot.value || !despotAt.value) return { ground: [], sea: [] }
  return legalManhuntMoves(despotAt.value, state.value.seaPassagesLeft, variant)
})

/** My locked marker this beat — client-side memory; the snapshot never names it. */
const myMarker = ref<ISOCountryCode | undefined>()
watch(
  () => state.value.hop,
  () => (myMarker.value = undefined)
)

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return
  if (showInterstitial.value || finished.value || pending.value) return
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

// --- Painting the map --------------------------------------------------------
/** Candidates in one quiet blue; the despot's trail deepens along the walk. */
const CANDIDATE_FILL = 'hsla(212, 58%, 62%, 0.4)'
const DRAGNET_FILL = 'hsla(345, 60%, 52%, 0.5)'
const trailColor = (index: number, count: number, head: boolean): string => {
  if (head) return 'hsla(24, 80%, 55%, 0.92)'
  const t = count <= 1 ? 1 : index / (count - 1)
  return `hsla(212, 58%, ${72 - t * 30}%, ${0.5 + t * 0.35})`
}

const lastDragnet = computed(() => state.value.dragnets[state.value.dragnets.length - 1])

const paintPursuit = () => {
  if (finished.value) return
  const groupings: CountryColorGrouping[] = []

  // Everyone: the painted candidate set (empty on hard) and the last dragnet.
  if (state.value.candidates.length) {
    groupings.push({ color: CANDIDATE_FILL, countries: [...state.value.candidates] })
  }
  const dragnetCountries = Object.keys(lastDragnet.value?.markers ?? {}) as ISOCountryCode[]
  if (dragnetCountries.length) {
    groupings.push({ color: DRAGNET_FILL, countries: dragnetCountries })
  }

  // Despot: their own trail over the top, head pulsing; legal outs on a move
  // beat as tints (sea options distinct from ground).
  const tints: (typeof gameStore.map)['tints'] = {}
  if (isDespot.value && trail.value.length) {
    trail.value.forEach((isoCode, index) => {
      const head = index === trail.value.length - 1
      groupings.push({
        color: trailColor(index, trail.value.length, head),
        countries: [isoCode],
      })
    })
    if (state.value.beat === 'move') {
      for (const isoCode of legalMoves.value.ground) tints[isoCode] = 'optimal'
      for (const isoCode of legalMoves.value.sea) tints[isoCode] = 'endpoint'
    }
    gameStore.map.pulsing = despotAt.value ? [despotAt.value] : []
  } else {
    gameStore.map.pulsing = []
  }

  // A committed detective keeps sight of their own marker.
  if (myMarker.value) tints[myMarker.value] = 'optimal'

  gameStore.map.staggered = false
  gameStore.map.countryGroupings = groupings
  gameStore.map.tints = tints
}

watch([challenge, trail, myMarker], () => paintPursuit(), { immediate: true, deep: true })

/** Sea-arc keys for the reveal walk: strait hops and sea passages both. */
const revealSeaLinks = (walk: ISOCountryCode[]): string[] => {
  const keys: string[] = []
  const seaHops = new Set(
    state.value.moves.filter(move => move.kind === 'sea').map(move => move.hop)
  )
  for (let index = 1; index < walk.length; index++) {
    const [a, b] = [walk[index - 1], walk[index]]
    if (seaHops.has(index) || isStraitHop(a, b)) keys.push(a < b ? `${a}-${b}` : `${b}-${a}`)
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
    setTimeout(() => {
      const groupings: CountryColorGrouping[] = walk.map((isoCode, index) => ({
        color: trailColor(index, walk.length, index === walk.length - 1),
        countries: [isoCode],
      }))
      gameStore.map.staggered = true
      gameStore.map.countryGroupings = groupings
      gameStore.map.seaLinks = revealSeaLinks(walk)
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

  .sub,
  .hint,
  .clue {
    padding: 0.4rem 1.4rem;
  }

  .hint {
    color: var(--hior-ange);
  }

  .clue {
    font-weight: bold;
  }

  .sea-banner {
    font-weight: bold;
    color: hsl(215.7, 76.4%, 41%);
  }

  .prompt {
    gap: 1rem;
    display: flex;
    position: relative;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.turn-line {
  gap: 0.6rem;
  display: inline-flex;
  align-items: center;

  .chip {
    width: 0.75rem;
    height: 0.75rem;
    position: relative;
    border-radius: 50%;

    &::before {
      content: '';
      inset: -0.35rem;
      position: absolute;
      border-radius: 50%;
      background: conic-gradient(hsl(24, 80%, 55%) var(--ring, 360deg), transparent 0);
      mask: radial-gradient(
        farthest-side,
        transparent calc(100% - 0.2rem),
        #000 calc(100% - 0.18rem)
      );
    }
  }

  .clock {
    font-weight: bold;
    font-variant-numeric: tabular-nums;
    color: color-mix(
      in oklab,
      hsl(24, 80%, 55%) calc(var(--clock-warmth, 0) * 1%),
      var(--dark-blue)
    );
  }
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

.intel {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  align-items: center;
  justify-content: center;
}

.entry {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;

  &.charges {
    font-weight: bold;
    color: hsl(215.7, 76.4%, 41%);
  }
}

.hop-badge {
  width: 1.4rem;
  height: 1.4rem;
  display: grid;
  font-size: 0.8em;
  font-weight: bold;
  place-items: center;
  border-radius: 50%;
  background: hsla(212, 58%, 52%, 0.18);
}

@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }
  .intel {
    max-height: 22dvh;
    overflow-y: auto;
    pointer-events: auto;
    overscroll-behavior: contain;
  }
}
</style>
