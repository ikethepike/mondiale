<template>
  <div v-if="challenge" class="atlas-round challenge-shell">
    <!-- A trap outranks the round's own opening sign: a client still holding
         its interstitial when the dead end springs must see the newer beat,
         not two overlays stacked on one another. -->
    <Interstitial
      v-if="showInterstitial && !trap"
      tone="alert"
      kind="atlas"
      :title="`The chain starts in ${playedName(seed)}`"
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
      :rescued="trapRescued"
      :walked-by="walkedBy"
      :spellings="spellings"
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
        :label="turnLabel(needs)"
        :color="activePlayer?.color"
        :seconds="secondsOnClock"
        :total="consoleShown ? undefined : turnTotal"
        :seats="seats"
      />
      <span v-if="!finished && iAmOut" class="map-caption sub out"> You're out — spectating </span>
    </ChallengePrompt>

    <!-- The tutorial: every seat confirms it understands the rules before the
         opening shot clock starts (the server's cap only covers a seat that
         walked away). -->
    <BriefingCard
      v-if="briefing"
      :participants="state!.order"
      :ready="state!.ready"
      cta="I understand — chain me in"
      :sent="sentReady"
      @ready="sendReady"
    >
      <AtlasTutorial :challenge="challenge" />
    </BriefingCard>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="viewerId"
      :attributions="promptSources"
      wrong-fate="named a country that doesn't chain"
      outs-lead="You still had:"
      :stats="revealStats"
      :fates="revealFates"
      :outs="teachingOuts"
    >
      <!-- The round's story: every chain walked, ties and all — and between
           stanzas, the dead end or cord that ended one and seeded the next. -->
      <div class="reveal-chains">
        <template v-for="(stanza, index) in revealStanzas" :key="index">
          <span v-if="index > 0" class="chain-start eyebrow">Fresh chain</span>
          <AtlasChainRail :chain="stanza.chain" :spellings="spellings" finished compact />
          <p v-if="stanza.line" class="chain-break">{{ stanza.line }}</p>
        </template>
      </div>
    </ChainReveal>

    <!-- Berth only on easy, where the console's dropdown returns. The console
         stays up between turns, so the footer holds one height all round. -->
    <footer ref="consoleFooter" :class="{ 'suggest-berth': isEasyGame && consoleShown }">
      <div v-if="!finished" class="rail-stage">
        <AtlasChainRail
          class="route"
          :class="{ parked: parachute }"
          :chain="chain"
          :spellings="spellings"
          :next-openers="briefing ? undefined : openers"
          :options-left="briefing || isHardGame ? undefined : openNames.length"
          :tail="LIVE_RAIL_TAIL"
          live
        />
        <RipCordDeploy
          v-if="parachute"
          :key="parachute.seed"
          :parachute="parachute"
          :spellings="spellings"
          @done="parachute = undefined"
        />
      </div>
      <div v-if="consoleShown" class="guess-box">
        <ChallengeConsole class="console" :value="secondsOnClock" :total="trap ? 0 : turnTotal">
          <!-- Pure recall — except on easy, where suggestions return from the
               third typed character (lib/atlas-chain's one constant). -->
          <CountryGuessInput
            ref="guessInput"
            :suggest="isEasyGame"
            :suggest-from="ATLAS_EASY_SUGGEST_FROM"
            :disabled="!myTurn || pending"
            :excluded="walked"
            :placeholder="placeholder"
            @guess="submitGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
          <template v-if="holdsCord" #aside>
            <RipCordHandle :head-name="headName" :disabled="!canPullCord" @pull="pullCord" />
          </template>
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import AtlasChainRail from '~/components/challenge/AtlasChainRail.vue'
import AtlasTutorial from '~/components/challenge/AtlasTutorial.vue'
import ChainReveal from '~/components/challenge/ChainReveal.vue'
import ChainTurnLine from '~/components/challenge/ChainTurnLine.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import RipCordDeploy from '~/components/challenge/RipCordDeploy.vue'
import RipCordHandle from '~/components/challenge/RipCordHandle.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import TrapSprung from '~/components/feedback/TrapSprung.vue'
import {
  ATLAS_EASY_RINGS,
  ATLAS_EASY_SUGGEST_FROM,
  atlasFollowSpelling,
  atlasLinkTie,
  atlasLiveMoves,
  atlasNeedsLabel,
  atlasOpeners,
  atlasOpenersLabel,
  atlasPlayedName,
  atlasRoundStats,
  atlasTeachingPicks,
  atlasTurnSeconds,
  atlasWalked,
} from '~~/lib/atlas-chain'
import { sampleMany } from '~~/lib/arrays'
import { datasetAttribution } from '~~/lib/attribution'
import { chainMovers, deadEndRescued, liveChain } from '~~/lib/chain'
import { playableWorldCountries } from '~~/lib/game-rules'
import { useChainTurnView } from '~~/lib/use-chain-turn-view'
import type { ChainBreak } from '~~/types/challenges/group-modes.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const promptSources = datasetAttribution('countries')

/** The live rail folds a marathon chain to its last links — only the head is
 *  playable, and the reveal card carries the full ledger. */
const LIVE_RAIL_TAIL = 10

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
  holdsCord,
  canPullCord,
  pullCord,
  parachute,
} = useChainTurnView('atlas-challenge', {
  turnSeconds: atlasTurnSeconds,
  fate: outcome => (outcome === 'timeout' ? 'the clock ran dry' : "the name didn't chain"),
  move: (name, to, from, current) => {
    const tie = atlasLinkTie(from, to, current.spellings)
    const flourish =
      tie?.kind === 'overlap'
        ? ` — ${tie.overlap} letters deep`
        : tie?.kind === 'consonant'
          ? ` off the ${tie.fragment.toUpperCase()}`
          : ''
    return `${name} chained ${atlasPlayedName(to, current.spellings)}${flourish}`
  },
  links: current => {
    const live = liveChain(current)
    return { hopLinks: live.slice(1).map((isoCode, index) => `${live[index]}>${isoCode}`) }
  },
  frame: current => liveChain(current).slice(-2),
  trapProof: sprung => sprung.spent,
})

const spellings = computed(() => state.value?.spellings)
const playedName = (isoCode: ISOCountryCode | undefined) =>
  isoCode ? atlasPlayedName(isoCode, spellings.value) : ''

const rules = computed(() => gameStore.game ?? { regions: [], difficulty: 'normal' as const })
const isEasyGame = computed(() => rules.value.difficulty === 'easy')
const isHardGame = computed(() => rules.value.difficulty === 'hard')

const walked = computed(() => (state.value ? atlasWalked(state.value) : []))
const headName = computed(() => playedName(head.value))
const openers = computed(() => (head.value ? atlasOpeners(head.value, spellings.value) : []))
const needs = computed(() => (head.value ? atlasNeedsLabel(head.value, spellings.value) : ''))
const openersLabel = computed(() =>
  head.value ? atlasOpenersLabel(head.value, spellings.value) : ''
)
const trapRescued = computed(() => (state.value ? deadEndRescued(state.value) : false))

/** The head's legal continuations — the same function the server grades with. */
const openNames = computed(() => {
  if (finished.value || !state.value) return []
  return atlasLiveMoves(state.value, rules.value)
})

const placeholder = computed(() => {
  if (trap.value) return 'Dead end…'
  if (myTurn.value) return `${openersLabel.value}, or an ending…`
  return activeId.value ? `${seatName(activeId.value)} is on the clock…` : ''
})

// Easy mode's map assist: a fresh handful of legal moves each turn, ringed and
// labelled — never the same alphabetical few.
const easyRings = ref<ISOCountryCode[]>([])
watch(
  () => [state.value?.turn, state.value?.chains.length, finished.value],
  () => {
    easyRings.value =
      isEasyGame.value && !finished.value ? sampleMany(openNames.value, ATLAS_EASY_RINGS) : []
    gameStore.map.ringed = easyRings.value
  },
  { immediate: true }
)

/** Walk-order badges over the live chain (1 = seed), newest first: where two
 *  collide on the map, the head's number is the one that stays. */
const sequenceEntries = computed(() => {
  const numbered = chain.value
    .map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
    .reverse()
  if (finished.value) return numbered
  return [...numbered, ...easyRings.value.map(isoCode => ({ isoCode, label: isoCode }))]
})

const stakes = computed(() => {
  const payLine = challenge.value?.placementOnly ? ' Only your placement pays.' : ''
  return `Name a country that starts where the last one ended, in turns.${payLine} Outlast the table.`
})

const headline = computed(() => (head.value ? `The chain stands at ${headName.value}` : 'Atlas'))

const submitGuess = (country: Country, typed: string) => {
  if (!myTurn.value || pending.value || !head.value) return
  // A repeat is a slip of the finger, not a claim of knowledge — free hint.
  if (walked.value.includes(country.isoCode)) {
    return announce({ hint: `${playedName(country.isoCode)} is already in the chain` })
  }
  // The courtesy check — the server re-validates through the same function.
  // A broken link never leaves the client: it costs only the clock.
  const follows = atlasFollowSpelling(head.value, country.isoCode, spellings.value, typed)
  if (!follows) {
    return announce({
      tone: 'alert',
      hint: `${typed.trim() || playedName(country.isoCode)} doesn't chain from ${headName.value} — try ${needs.value}`,
    })
  }
  void submitMove(country.isoCode, typed)
}

// --- The reveal ---------------------------------------------------------------
const movers = computed(() => (state.value ? chainMovers(state.value) : new Map()))
const walkedBy = computed(() =>
  Object.fromEntries([...movers.value].map(([isoCode, playerId]) => [isoCode, seatName(playerId)]))
)

const revealStats = computed<{ label: string; value: string }[]>(() => {
  const current = state.value
  if (!current?.finished) return []
  const facts = atlasRoundStats(current, movers.value)
  const stats = [{ label: 'Links', value: String(facts.links) }]
  if (facts.chains > 1) stats.push({ label: 'Chains', value: String(facts.chains) })
  if (facts.longestRun && facts.longestRun.run >= 2) {
    stats.push({
      label: 'Longest run',
      value: `${seatName(facts.longestRun.playerId)} · ${facts.longestRun.run}`,
    })
  }
  if (facts.deepest) {
    stats.push({
      label: 'Deepest link',
      value: `${facts.deepest.tie.fragment.toUpperCase()} · ${playedName(facts.deepest.to)}`,
    })
  }
  if (facts.busiest && facts.busiest.count >= 3) {
    stats.push({
      label: 'Busiest letter',
      value: `${facts.busiest.letter} · ${facts.busiest.count} of ${facts.links}`,
    })
  }
  if (facts.cords) stats.push({ label: 'Rip cords', value: String(facts.cords) })
  return stats
})

/** The ledger's stanzas: each chain walked, plus the break that retired it
 *  (`state.breaks` is index-aligned with `chains`). */
const revealStanzas = computed<{ chain: ISOCountryCode[]; line?: string }[]>(() => {
  const current = state.value
  if (!current?.finished) return []
  return current.chains.map((walkedChain, index) => ({
    chain: walkedChain,
    line: breakLine(current.breaks?.[index], walkedChain.at(-1)),
  }))
})

const breakLine = (sealed: ChainBreak | undefined, deadHead: ISOCountryCode | undefined) => {
  if (!sealed) return undefined
  const who = seatName(sealed.playerId)
  if (sealed.kind === 'rip-cord') return `${who} pulled the rip cord`
  const where = deadHead ? `Dead end at ${playedName(deadHead)}` : 'Dead end'
  if (sealed.rescued) return `${where} — ${who}'s rip cord opened`
  const verb = sealed.playerId === viewerId.value ? 'were' : 'was'
  return `${where} — ${who} ${verb} knocked out`
}

/** Fate lines that count what was still open when the player fell. */
const revealFates = computed<{ [playerId: string]: string } | undefined>(() => {
  const current = state.value
  if (!current?.finished) return undefined
  const fates: { [playerId: string]: string } = {}
  for (const playerId of current.eliminated) {
    const open = current.missedOuts[playerId]?.length ?? 0
    if (!open || current.outcomes[playerId] !== 'timeout') continue
    fates[playerId] = `ran out of clock with ${open} ${open === 1 ? 'name' : 'names'} open`
  }
  return fates
})

/** The viewer's missed outs, the ones that would have carried on first. */
const teachingOuts = computed(() => {
  const outs = state.value?.missedOuts[viewerId.value]
  if (!outs?.length || !state.value) return undefined
  return atlasTeachingPicks(
    outs,
    atlasWalked(state.value),
    playableWorldCountries(rules.value),
    outs.length
  )
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.out {
  opacity: 0.75;
}

// Walked chain over the console — the input holds the bottom edge.
footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.rail-stage {
  max-width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
}

// The parachute lands where the rail stands; the rail waits, keeping its room.
.parked {
  visibility: hidden;
}

.reveal {
  z-index: 2;
  max-width: min(46rem, calc(100% - 2.4rem));
}

.reveal-chains {
  gap: 0.7rem;
  display: flex;
  flex-flow: column nowrap;
}

// The stanza break: the dead end gets said out loud where it happened, and
// the next rail opens under a fresh-chain label rather than running on.
.chain-break {
  margin: 0;
  gap: 0.8rem;
  display: flex;
  align-items: center;
  font-size: 1.25rem;
  color: var(--hior-ange);

  &::before,
  &::after {
    content: '';
    height: 0;
    flex: 1 1 1.2rem;
    border-top: 0.1rem dashed flame(0.4);
  }
}

.chain-start {
  margin: 0;
  font-size: 1.05rem;
}
</style>
