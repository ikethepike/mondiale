<template>
  <div v-if="challenge" class="border-chain challenge-shell">
    <!-- A trap outranks the round's own opening sign: a client still holding
         its interstitial when the dead end springs must see the newer beat,
         not two overlays stacked on one another. -->
    <Interstitial
      v-if="showInterstitial && !trap"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — Border Chain`"
      :title="`The chain starts in ${countryName(getCountry(seed))}`"
      :stakes="stakes"
      @done="begin()"
    />

    <!-- The dead-end hold. Server-timed: this only fades the sign, the next
         chain-updated deals the fresh ground. -->
    <TrapSprung
      v-if="trap"
      :trap="trap"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.seatId"
    />

    <!-- Walk-order numbers pinned over the chain — the gradient shows the
         journey's age, the numbers make the sequence unambiguous. -->
    <MapYearLabels v-if="!showInterstitial" :entries="sequenceEntries" :min-gap-px="26" />

    <ChallengePrompt
      :hint="hint"
      :hint-tone="hintTone"
      :attributions="promptSources"
      attribution-label="Sources"
    >
      <h1 class="map-caption">
        {{ headline }}
      </h1>
      <span v-if="!finished && !briefing && !trap" class="map-caption sub turn-line">
        <span class="chip" :style="{ background: activePlayer?.color }" />
        <span>{{ turnLabel }}</span>
        <ChallengeTimerRadial
          class="turn-clock"
          :value="secondsOnClock"
          :total="challenge.turnSeconds"
        />
      </span>
      <span v-if="!finished && iAmOut" class="map-caption sub out"> You're out — spectating </span>
    </ChallengePrompt>

    <!-- The briefing: a rules card each player dismisses explicitly (The
         Despot's gate). The opening shot clock only starts when the whole
         table is ready — or the server's reading cap forces it. -->
    <section v-if="briefing" class="briefing briefing-card pane tr decorator-bottom">
      <!-- Two linked rings — the mode's mark, in the stroke language the
           stat glyphs speak (The Despot's hat, Unique's letter badge). -->
      <svg class="briefing-mark" viewBox="0 0 48 24" aria-hidden="true">
        <rect x="3" y="7" width="18" height="10" rx="5" />
        <rect x="27" y="7" width="18" height="10" rx="5" />
        <path d="M21 12h6" />
      </svg>
      <h2>Border Chain</h2>
      <ul class="briefing-points">
        <li>
          One chain, in turns: name a country that borders the head —
          {{ challenge.turnSeconds }} seconds a move.
        </li>
        <li>〜 Named strait crossings count as borders.</li>
        <li>No repeats — every country walks once.</li>
        <li v-if="challenge.strikes > 0">
          A wrong name or a dead clock burns your strike; the next puts you out.
        </li>
        <li v-else>A wrong name or a dead clock puts you out — sudden death.</li>
        <li>Dead ends trap whoever holds them. Outlast the table.</li>
      </ul>
      <div class="ready-row">
        <div
          v-for="playerId in state!.order"
          :key="playerId"
          class="ready-seat"
          :class="{ waiting: !state!.ready.includes(playerId) }"
        >
          <PlayerPawn class="ready-pawn" :player="gameStore.game?.players[playerId]" />
          <span class="seat-name">{{ seatName(playerId) }}</span>
        </div>
      </div>
      <ButtonFilled v-if="!iAmReady" @click="sendReady">Link me in</ButtonFilled>
      <p v-else class="briefing-waiting">Waiting for the rest of the table…</p>
    </section>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.seatId"
    />

    <!-- Berth only while the console stands — the reserve would shove the
         spectators' route chips up a hand's width between turns. -->
    <footer ref="consoleFooter" :class="{ 'suggest-berth': myTurn && !finished && !briefing }">
      <ol class="route country-chip-list">
        <template v-for="(isoCode, index) in chain" :key="`${chainCount}-${isoCode}`">
          <li v-if="index > 0 && isStraitHop(chain[index - 1], isoCode)" class="sea-hop">〜</li>
          <CountryChip
            class="walked map-caption"
            :class="{ head: index === chain.length - 1 && !finished }"
            :style="{ '--stop-color': stopColor(index) }"
            :country="getCountry(isoCode)"
          />
        </template>
      </ol>
      <!-- On your turn the shot clock lives inside the guess console; between
           turns the header's turn-line chip carries the countdown. -->
      <div v-if="myTurn && !finished && !briefing" class="guess-box">
        <ChallengeConsole class="console" :value="secondsOnClock" :total="challenge.turnSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="pending"
            :excluded="walked"
            @guess="submitGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChainReveal from '~/components/challenge/ChainReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import TrapSprung from '~/components/feedback/TrapSprung.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { activePlayerId, isStraitHop, liveChain, openMoves, walkColor } from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import { unplayableCountries } from '~~/lib/game-rules'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import type { CountryColorGrouping } from '~~/types/map.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const promptSources = dedupeAttributions([
  ...datasetAttribution('borders'),
  ...datasetAttribution('straits'),
])

// The whole world stays visible — the walked path needs the map for context.
const {
  challenge,
  currentRound,
  showInterstitial,
  begin: beginRound,
  hint,
  hintTone,
  announce,
  gameStore,
  update,
} = useGroupChallenge('border-chain-challenge', { solo: false })

const state = computed(() => challenge.value?.state)
const briefing = computed(() => !!state.value?.briefing)
const iAmReady = computed(() => !!state.value?.ready.includes(gameStore.seatId))
const readySent = ref(false)
const sendReady = () => {
  if (readySent.value) return
  readySent.value = true
  update({ event: 'chain-ready' })
}
const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.seatId)

const chain = computed(() => (state.value ? liveChain(state.value) : []))
const chainCount = computed(() => state.value?.chains.length ?? 0)
const seed = computed(() => state.value?.chains[0]?.[0] as ISOCountryCode)
const finished = computed(() => !!state.value?.finished)
const trap = computed(() => state.value?.trap)
const iAmOut = computed(() => !!state.value?.eliminated.includes(gameStore.seatId))
const activeId = computed(() => (state.value ? activePlayerId(state.value) : undefined))
const activePlayer = computed(() =>
  activeId.value ? gameStore.game?.players[activeId.value] : undefined
)
// Nobody is on the clock during a dead-end hold — the console stands down with
// the turn line so no one types into a paused table.
const myTurn = computed(() => !finished.value && !trap.value && activeId.value === gameStore.seatId)
const walked = computed(() => chain.value)

// Countries out of this game — off a continental board, or benched
// micro-nations — are illegal moves; fade them so the rule is visible
// before someone walks Spain → Morocco into it.
const rules = gameStore.game ?? { variant: 'world' as const, difficulty: 'normal' as const }
gameStore.map.dimmed = unplayableCountries(rules)

/** Walk-order badges over the live chain (1 = seed). On easy, the head's open
 *  connections also carry their ISO code — the legal moves, spelled out. */
const sequenceEntries = computed(() => {
  const numbered = chain.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
  if (gameStore.game?.difficulty !== 'easy' || finished.value || !state.value) return numbered
  return [
    ...numbered,
    ...openMoves(state.value, rules).map(isoCode => ({ isoCode, label: isoCode })),
  ]
})

// Easy mode's open moves also get the shared action ring (the stroke channel
// manhunt speaks) — the ISO chips name them, the rings place them. Harder
// difficulties stay unassisted: revealing legal moves is the assist itself.
watch(
  [chain, finished],
  () => {
    gameStore.map.ringed =
      gameStore.game?.difficulty === 'easy' && !finished.value && state.value
        ? openMoves(state.value, rules)
        : []
  },
  { immediate: true }
)

const stakes = computed(() => {
  const grace =
    (challenge.value?.strikes ?? 0) > 0
      ? 'One slip is forgiven — the second is not.'
      : 'Sudden death: one slip and you are out.'
  return `Take turns naming a country the chain connects to — by land border or across a strait. No repeats. ${grace} Outlast everyone.`
})

const headline = computed(() => {
  if (finished.value) return 'The chain is broken'
  const head = chain.value[chain.value.length - 1]
  return head ? `The chain stands at ${countryName(getCountry(head))}` : 'Border Chain'
})

const turnLabel = computed(() => {
  if (myTurn.value) return 'Your move'
  return `${playerDisplayName(activePlayer.value)} is on the clock`
})

const { secondsOnClock } = useDeadlineClock(
  () => state.value?.deadline,
  () => challenge.value?.turnSeconds
)

// --- Submitting a move -------------------------------------------------------
const pending = ref(false)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The camera frames the walked chain above the console (and the keyboard)
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)
// The input home owns the touch gate: auto focus is desktop-only.
const focusMyTurn = () => {
  if (!myTurn.value) return
  nextTick(() => guessInput.value?.focus({ auto: true }))
}

// The turn watcher never fires for the round's opener (turn stays 0), so the
// interstitial's dismissal carries the first focus.
const begin = () => {
  beginRound()
  focusMyTurn()
}

const submitGuess = (country: Country) => {
  const active = challenge.value
  if (!active || !myTurn.value || pending.value) return
  // A repeat is a slip of the finger, not a claim of knowledge — free hint.
  if (liveChain(active.state).includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already walked` })
  }
  pending.value = true
  update({ event: 'submit-chain-move', isoCode: country.isoCode, turn: active.state.turn })
}

// Each server turn unlocks the input and refocuses it for whoever's up next.
watch(
  () => state.value?.turn,
  () => {
    pending.value = false
    focusMyTurn()
  }
)

// --- Ephemeral narration -----------------------------------------------------
// Mirrors ViewAtlas: table beats derive from consecutive snapshots — nothing
// rides the wire and nothing is stored. The first snapshot has no diff base,
// so a rejoiner lands on the current state silently instead of replaying stale
// toasts. Own moves stay silent: the chain rail already tells the player.
let seenBeats: { links: number; eliminated: number; strikes: string } | undefined
watch(
  challenge,
  current => {
    const s = current?.state
    if (!s) return
    const snapshot = {
      links: s.chains.reduce((total, walkedChain) => total + walkedChain.length, 0),
      eliminated: s.eliminated.length,
      strikes: JSON.stringify(s.strikesLeft),
    }
    const before = seenBeats
    seenBeats = snapshot
    if (!before || s.briefing || s.finished || s.trap) return

    if (snapshot.eliminated > before.eliminated) {
      const outId = s.eliminated[s.eliminated.length - 1]
      if (outId === gameStore.seatId) return // the turn line already says so
      const fate = s.outcomes[outId] === 'timeout' ? 'the clock ran dry' : 'walked off the map'
      return announce({ hint: `${seatName(outId)} is out — ${fate}` })
    }
    if (snapshot.strikes !== before.strikes) {
      const prior: Record<string, number> = JSON.parse(before.strikes)
      const burner = Object.keys(s.strikesLeft).find(
        playerId => (s.strikesLeft[playerId] ?? 0) < (prior[playerId] ?? 0)
      )
      if (!burner || burner === gameStore.seatId) return
      return announce({ hint: `${seatName(burner)} burns a strike` })
    }
    if (snapshot.links > before.links && s.lastMoverId && s.lastMoverId !== gameStore.seatId) {
      const moved = liveChain(s)
      const [from, to] = [moved[moved.length - 2], moved[moved.length - 1]]
      const flourish = from && to && isStraitHop(from, to) ? ' — across the strait' : ''
      if (to) {
        announce({ hint: `${seatName(s.lastMoverId)} walks on to ${countryName(to)}${flourish}` })
      }
    }
  },
  { immediate: true, deep: true }
)

// --- Painting the map --------------------------------------------------------
const stopColor = (index: number, count = chain.value.length, head = false): string =>
  walkColor(index, count, head)
const RETIRED_FILL = 'hsla(215.7, 15%, 55%, 0.32)'

const seaLinkKeys = (): string[] => {
  const keys: string[] = []
  for (const walkedChain of state.value?.chains ?? []) {
    for (let index = 1; index < walkedChain.length; index++) {
      const [a, b] = [walkedChain[index - 1], walkedChain[index]]
      // Directed: the arc's dash drift follows the walk.
      if (isStraitHop(a, b)) keys.push(`${a}>${b}`)
    }
  }
  return keys
}

const paintChain = (staggered: boolean) => {
  const current = state.value
  if (!current) return
  const groupings: CountryColorGrouping[] = []
  current.chains.forEach((walkedChain, chainIndex) => {
    const live = chainIndex === current.chains.length - 1
    walkedChain.forEach((isoCode, index) => {
      const head = live && !current.finished && index === walkedChain.length - 1
      groupings.push({
        color: live ? stopColor(index, walkedChain.length, head) : RETIRED_FILL,
        countries: [isoCode],
      })
    })
  })
  gameStore.map.staggered = staggered
  gameStore.map.countryGroupings = groupings
  gameStore.map.seaLinks = seaLinkKeys()
  const head = current.finished ? undefined : liveChain(current).at(-1)
  gameStore.map.pulsing = head ? [head] : []

  // During the dead-end hold the map carries the proof: the shut doors take
  // the miss wash and the camera frames them with the head that closed them,
  // so the overlay's claim is visibly true behind it.
  const sprung = current.trap
  if (sprung) {
    gameStore.map.tints = Object.fromEntries(
      sprung.doors.map(door => [door.isoCode, 'stray' as const])
    )
    gameStore.map.focus = [sprung.head, ...sprung.doors.map(door => door.isoCode)]
    gameStore.map.pulsing = [sprung.head]
    return
  }
  gameStore.map.tints = {}
  gameStore.map.focus = current.chains.flat()
}

watch(challenge, () => !finished.value && paintChain(false), { immediate: true, deep: true })

// The reveal replay: blank the path, then let it re-arrive hop by hop, with
// the local player's missed outs glowing as the lesson. Immediate, so a
// client that arrives with the round already finished (reconnect, harness)
// still gets the replay.
watch(
  finished,
  done => {
    if (!done) return
    gameStore.map.countryGroupings = undefined
    gameStore.map.seaLinks = []
    gameStore.map.pulsing = []
    setTimeout(() => {
      paintChain(true)
      const outs = state.value?.missedOuts[gameStore.seatId] ?? []
      gameStore.map.tints = Object.fromEntries(outs.map(isoCode => [isoCode, 'optimal']))
    }, 400)
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
.briefing-mark {
  width: 4.4rem;
  fill: none;
  stroke: var(--dark-blue);
  stroke-width: 2;
  stroke-linecap: round;
}

.briefing h2 {
  margin: 0;
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

  // The shared radial dial at subline scale — no bespoke text clocks.
  .turn-clock {
    --clock-size: 2.8rem;
    --clock-seconds-size: 1.1rem;
  }
}

.out {
  opacity: 0.75;
}

// Walked route over the console — the input holds the bottom edge.
footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.reveal {
  z-index: 2;
  margin: 0 auto;
  max-width: min(34rem, calc(100% - 2.4rem));
}

// Chip and route-list recipes come from templates/_country-chip.scss;
// only the walk's own accents live here.
.walked {
  border-color: var(--stop-color);

  &.head {
    font-weight: bold;
    border-width: 0.15rem;
  }
}

.sea-hop {
  opacity: 0.6;
  font-weight: bold;
  color: ink(1, 41%);
}
</style>
