<template>
  <div v-if="challenge" class="border-chain challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — Border Chain`"
      :title="`The chain starts in ${countryName(getCountry(seed))}`"
      :stakes="stakes"
      @done="begin()"
    />

    <!-- Walk-order numbers pinned over the chain — the gradient shows the
         journey's age, the numbers make the sequence unambiguous. -->
    <MapYearLabels v-if="!showInterstitial" :entries="sequenceEntries" :min-gap-px="26" />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">
        {{ headline }}
      </h1>
      <span v-if="!finished && !briefing" class="map-caption sub turn-line">
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

    <!-- On your turn the shot clock lives inside the guess console; between
         turns the header's turn-line chip carries the countdown. -->
    <section v-if="myTurn && !finished && !briefing" class="guess-box">
      <ChallengeConsole class="console" :value="secondsOnClock" :total="challenge.turnSeconds">
        <CountryGuessInput
          ref="guessInput"
          :disabled="pending"
          :excluded="walked"
          @guess="submitGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </ChallengeConsole>
    </section>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.playerId"
    />

    <footer>
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
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { activePlayerId, isStraitHop, liveChain, openMoves, walkColor } from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import { unplayableCountries } from '~~/lib/game-rules'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsCoarsePointer } from '~~/lib/use-viewport'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import type { CountryColorGrouping } from '~~/types/map.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

// The whole world stays visible — the walked path needs the map for context.
const {
  challenge,
  currentRound,
  showInterstitial,
  begin: beginRound,
  hint,
  announce,
  gameStore,
  update,
} = useGroupChallenge('border-chain-challenge', { solo: false })

const state = computed(() => challenge.value?.state)
const briefing = computed(() => !!state.value?.briefing)
const iAmReady = computed(() => !!state.value?.ready.includes(gameStore.playerId))
const readySent = ref(false)
const sendReady = () => {
  if (readySent.value) return
  readySent.value = true
  update({ event: 'chain-ready' })
}
const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.playerId)

const chain = computed(() => (state.value ? liveChain(state.value) : []))
const chainCount = computed(() => state.value?.chains.length ?? 0)
const seed = computed(() => state.value?.chains[0]?.[0] as ISOCountryCode)
const finished = computed(() => !!state.value?.finished)
const iAmOut = computed(() => !!state.value?.eliminated.includes(gameStore.playerId))
const activeId = computed(() => (state.value ? activePlayerId(state.value) : undefined))
const activePlayer = computed(() =>
  activeId.value ? gameStore.game?.players[activeId.value] : undefined
)
const myTurn = computed(() => !finished.value && activeId.value === gameStore.playerId)
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
const isCoarsePointer = useIsCoarsePointer()

// Touch devices skip autofocus — a self-raising keyboard would bury the map.
const focusMyTurn = () => {
  if (!myTurn.value || isCoarsePointer.value) return
  nextTick(() => guessInput.value?.focus())
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
  gameStore.map.focus = current.chains.flat()
  const head = current.finished ? undefined : liveChain(current).at(-1)
  gameStore.map.pulsing = head ? [head] : []
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
      const outs = state.value?.missedOuts[gameStore.playerId] ?? []
      gameStore.map.tints = Object.fromEntries(outs.map(isoCode => [isoCode, 'optimal']))
    }, 400)
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
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

.guess-box {
  z-index: 2;
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
