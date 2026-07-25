<template>
  <div v-if="challenge" class="border-chain">
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

    <header>
      <div class="prompt">
        <h1 class="map-caption">
          {{ headline }}
        </h1>
        <span
          v-if="!finished"
          class="map-caption sub turn-line"
          :style="{ '--ring': `${fractionLeft * 360}deg`, '--clock-warmth': clockWarmth }"
        >
          <span class="chip" :style="{ background: activePlayer?.color }" />
          <span>{{ turnLabel }}</span>
          <span class="clock">{{ secondsOnClock }}s</span>
        </span>
        <ChallengeTimer
          v-if="!finished"
          class="shot-clock"
          :value="secondsOnClock"
          :total="challenge.turnSeconds"
        />
        <span v-if="!finished && iAmOut" class="map-caption sub out">
          You're out — spectating
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section v-if="myTurn && !finished" class="guess-box">
      <CountryGuessInput
        ref="guessInput"
        :disabled="pending"
        :excluded="walked"
        @guess="submitGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </section>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.playerId"
    />

    <footer>
      <ol class="route">
        <template v-for="(isoCode, index) in chain" :key="`${chainCount}-${isoCode}`">
          <li v-if="index > 0 && isStraitHop(chain[index - 1], isoCode)" class="sea-hop">〜</li>
          <li
            class="stop map-caption"
            :class="{ head: index === chain.length - 1 && !finished }"
            :style="{ '--stop-color': stopColor(index) }"
          >
            <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
            <span>{{ countryName(getCountry(isoCode)) }}</span>
          </li>
        </template>
      </ol>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChainReveal from '~/components/challenge/ChainReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { activePlayerId, isStraitHop, liveChain, openMoves } from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsCoarsePointer } from '~~/lib/use-viewport'
import { countryInVariant } from '~~/lib/variant'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
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

// On a continental board, countries off the board are illegal moves — fade
// them so the rule is visible before someone walks Spain → Morocco into it.
const variant = gameStore.game?.variant ?? 'world'
gameStore.map.dimmed =
  variant === 'world'
    ? []
    : ISOCountryCodes.filter(isoCode => !countryInVariant(isoCode, variant))

/** Walk-order badges over the live chain (1 = seed). On easy, the head's open
 *  connections also carry their ISO code — the legal moves, spelled out. */
const sequenceEntries = computed(() => {
  const numbered = chain.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
  if (gameStore.game?.difficulty !== 'easy' || finished.value || !state.value) return numbered
  return [
    ...numbered,
    ...openMoves(state.value, variant).map(isoCode => ({ isoCode, label: isoCode })),
  ]
})

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
  return `${activePlayer.value?.name || 'Anonymous'} is on the clock`
})

// --- Shot clock (server-owned deadline; local repaint only) ------------------
const secondsOnClock = ref(0)
const fractionLeft = ref(1)
const clock = setInterval(() => {
  const deadline = state.value?.deadline ?? 0
  const remaining = deadline - Date.now()
  secondsOnClock.value = Math.max(0, Math.ceil(remaining / 1000))
  const total = (challenge.value?.turnSeconds ?? 0) * 1000
  fractionLeft.value = total ? Math.min(1, Math.max(0, remaining / total)) : 1
}, 200)
onBeforeUnmount(() => clearInterval(clock))

/** 0 (calm ink) through the turn's first half, 100 (ember) as the clock dies. */
const clockWarmth = computed(() => Math.round(Math.max(0, 0.5 - fractionLeft.value) * 200))

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
/** One blue, deepening along the walk — a ramp reads as sequence where a
 *  rainbow reads as categories. The head alone burns ember. */
const stopColor = (index: number, count = chain.value.length, head = false): string => {
  if (head) return 'hsla(24, 80%, 55%, 0.92)'
  const t = count <= 1 ? 1 : index / (count - 1)
  return `hsla(212, 58%, ${72 - t * 30}%, ${0.5 + t * 0.35})`
}
const RETIRED_FILL = 'hsla(215.7, 15%, 55%, 0.32)'

const seaLinkKeys = (): string[] => {
  const keys: string[] = []
  for (const walkedChain of state.value?.chains ?? []) {
    for (let index = 1; index < walkedChain.length; index++) {
      const [a, b] = [walkedChain[index - 1], walkedChain[index]]
      if (isStraitHop(a, b)) keys.push(a < b ? `${a}-${b}` : `${b}-${a}`)
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
@use '~/assets/scss/rules/breakpoints' as *;
.border-chain {
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
  .hint {
    padding: 0.4rem 1.4rem;
  }

  .hint {
    color: var(--hior-ange);
  }

  .prompt {
    gap: 1rem;
    display: flex;
    position: relative;
    align-items: center;
    flex-flow: column nowrap;
  }

  .prompt .hint {
    top: 100%;
    left: 0;
    right: 0;
    z-index: 3;
    width: max-content;
    max-width: 100%;
    position: absolute;
    margin: 0.4rem auto 0;
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

    // The shot clock as a sweeping ring — full at the deal, gone at zero.
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
    // Ink through the calm half, warming to the chain head's ember as it dies.
    color: color-mix(
      in oklab,
      hsl(24, 80%, 55%) calc(var(--clock-warmth, 0) * 1%),
      var(--dark-blue)
    );
  }
}

.shot-clock {
  width: 18rem;
  max-width: 100%;
}

.out {
  opacity: 0.75;
}

.guess-box {
  z-index: 2;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
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

.route {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  align-items: center;
  justify-content: center;
}

.stop {
  gap: 0.7rem;
  display: flex;
  align-items: center;
  padding: 0.4rem 1.2rem;
  border-color: var(--stop-color);

  &.head {
    font-weight: bold;
    border-width: 0.15rem;
  }
}

.sea-hop {
  opacity: 0.6;
  font-weight: bold;
  color: hsl(215.7, 76.4%, 41%);
}

.stop-flag {
  width: 2.6rem;
  height: 1.8rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }
  // Long chains scroll instead of swallowing the map and input.
  .route {
    max-height: 22dvh;
    overflow-y: auto;
    // .main-board kills pointer events — restore them or the chain can't be
    // touch-scrolled at all.
    pointer-events: auto;
    overscroll-behavior: contain;
  }
}
</style>
