<template>
  <div v-if="challenge" class="border-chain challenge-shell">
    <!-- A trap outranks the round's own opening sign: a client still holding
         its interstitial when the dead end springs must see the newer beat,
         not two overlays stacked on one another. -->
    <Interstitial
      v-if="showInterstitial && !trap"
      tone="alert"
      kind="border-chain"
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
      :player-id="viewerId"
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
      <h1 v-if="!finished" class="map-caption">
        {{ headline }}
      </h1>
      <ChainTurnLine
        v-if="!finished && !briefing && !trap"
        :label="turnLabel()"
        :color="activePlayer?.color"
        :seconds="secondsOnClock"
        :total="consoleShown ? undefined : turnTotal"
        :seats="seats"
      />
      <span v-if="!finished && iAmOut" class="map-caption sub out"> You're out — spectating </span>
    </ChallengePrompt>

    <!-- The briefing: a rules card each player dismisses explicitly (The
         Despot's gate). The opening shot clock only starts when the whole
         table is ready — or the server's reading cap forces it. -->
    <BriefingCard
      v-if="briefing"
      :participants="state!.order"
      :ready="state!.ready"
      cta="Link me in"
      :sent="sentReady"
      @ready="sendReady"
    >
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
    </BriefingCard>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="viewerId"
    />

    <!-- The console stays up between turns, so the footer holds one height. -->
    <footer ref="consoleFooter" :class="{ 'suggest-berth': consoleShown }">
      <ol class="route country-chip-list">
        <template v-for="(isoCode, index) in chain" :key="`${chainCount}-${isoCode}`">
          <li v-if="index > 0 && isStraitHop(chain[index - 1], isoCode)" class="sea-hop">〜</li>
          <CountryChip
            class="walked map-caption"
            :class="{ head: index === chain.length - 1 && !finished }"
            :style="{ '--stop-color': walkColor(index, chain.length) }"
            :country="getCountry(isoCode)"
          />
        </template>
      </ol>
      <div v-if="consoleShown" class="guess-box">
        <ChallengeConsole class="console" :value="secondsOnClock" :total="trap ? 0 : turnTotal">
          <CountryGuessInput
            ref="guessInput"
            :disabled="!myTurn || pending"
            :excluded="chain"
            :placeholder="placeholder"
            @guess="submitGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChainTurnLine from '~/components/challenge/ChainTurnLine.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChainReveal from '~/components/challenge/ChainReveal.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import TrapSprung from '~/components/feedback/TrapSprung.vue'
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { isStraitHop, liveChain, openMoves, walkColor } from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import { unplayableCountries } from '~~/lib/game-rules'
import { useChainTurnView } from '~~/lib/use-chain-turn-view'
import type { Country } from '~~/types/geography.types'

const promptSources = dedupeAttributions([
  ...datasetAttribution('borders'),
  ...datasetAttribution('straits'),
])

const {
  challenge,
  state,
  showInterstitial,
  begin,
  hint,
  hintTone,
  announce,
  gameStore,
  viewerId,
  seatName,
  sentReady,
  sendReady,
  briefing,
  finished,
  trap,
  chain,
  seed,
  head,
  activeId,
  activePlayer,
  iAmOut,
  consoleShown,
  myTurn,
  turnTotal,
  secondsOnClock,
  turnLabel,
  seats,
  pending,
  guessInput,
  consoleFooter,
  submitMove,
} = useChainTurnView('border-chain-challenge', {
  turnSeconds: challenge => challenge.turnSeconds,
  fate: outcome => (outcome === 'timeout' ? 'the clock ran dry' : 'walked off the map'),
  move: (name, to, from) =>
    `${name} walks on to ${countryName(to)}${isStraitHop(from, to) ? ' — across the strait' : ''}`,
  links: current => {
    const seaLinks: string[] = []
    for (const walkedChain of current.chains) {
      for (let index = 1; index < walkedChain.length; index++) {
        const [a, b] = [walkedChain[index - 1], walkedChain[index]]
        // Directed: the arc's dash drift follows the walk.
        if (isStraitHop(a, b)) seaLinks.push(`${a}>${b}`)
      }
    }
    return { seaLinks }
  },
  frame: current => current.chains.flat(),
  trapProof: sprung => sprung.doors.map(door => door.isoCode),
})

const chainCount = computed(() => state.value?.chains.length ?? 0)

// Countries out of this game — off a continental board, or benched
// micro-nations — are illegal moves; fade them so the rule is visible
// before someone walks Spain → Morocco into it.
const rules = computed(() => gameStore.game ?? { regions: [], difficulty: 'normal' as const })
gameStore.map.dimmed = unplayableCountries(rules.value)

/** The head's open connections — easy mode rings and labels them. */
const easyOpen = computed(() =>
  rules.value.difficulty === 'easy' && !finished.value && challenge.value
    ? openMoves(challenge.value.state, rules.value)
    : []
)

/** Walk-order badges over the live chain (1 = seed), newest first so the
 *  head's number survives a collision; on easy the open moves carry their
 *  ISO code — the legal moves, spelled out. */
const sequenceEntries = computed(() => [
  ...chain.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) })).reverse(),
  ...easyOpen.value.map(isoCode => ({ isoCode, label: isoCode })),
])

// Easy mode's open moves also get the shared action ring (the stroke channel
// manhunt speaks). Harder difficulties stay unassisted.
watch(easyOpen, open => (gameStore.map.ringed = open), { immediate: true })

const stakes = computed(() => {
  const grace =
    (challenge.value?.strikes ?? 0) > 0
      ? 'One slip is forgiven — the second is not.'
      : 'Sudden death: one slip and you are out.'
  return `Take turns naming a country the chain connects to — by land border or across a strait. No repeats. ${grace} Outlast everyone.`
})

const headline = computed(() =>
  head.value ? `The chain stands at ${countryName(getCountry(head.value))}` : 'Border Chain'
)

const placeholder = computed(() => {
  if (trap.value) return 'Dead end…'
  if (myTurn.value) return 'Type a country…'
  return activeId.value ? `${seatName(activeId.value)} is on the clock…` : ''
})

const submitGuess = (country: Country) => {
  const active = challenge.value
  if (!active || !myTurn.value || pending.value) return
  // A repeat is a slip of the finger, not a claim of knowledge — free hint.
  if (liveChain(active.state).includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already walked` })
  }
  void submitMove(country.isoCode)
}
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
