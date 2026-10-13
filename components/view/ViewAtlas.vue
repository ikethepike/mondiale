<template>
  <div v-if="challenge" class="atlas-round challenge-shell">
    <!-- A trap outranks the round's own opening sign: a client still holding
         its interstitial when the dead end springs must see the newer beat,
         not two overlays stacked on one another. -->
    <Interstitial
      v-if="showInterstitial && !trap"
      tone="alert"
      kind="atlas"
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
      :rescued="trapRescued"
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
        <ChallengeTimerRadial class="turn-clock" :value="secondsOnClock" :total="turnTotal" />
      </span>
      <span v-if="!finished && iAmOut" class="map-caption sub out"> You're out — spectating </span>
    </ChallengePrompt>

    <!-- The briefing: a rules card each player dismisses explicitly (Border
         Chain's gate). The opening shot clock only starts when the whole
         table is ready — or the server's reading cap forces it. -->
    <BriefingCard
      v-if="briefing"
      :participants="state!.order"
      :ready="state!.ready"
      cta="Chain me in"
      :sent="sentReady"
      @ready="sendReady"
    >
      <!-- Two name chips joined by the letter tie — the rail's own motif, in
           the stroke language the mode marks speak. -->
      <svg class="briefing-mark" viewBox="0 0 48 24" aria-hidden="true">
        <rect x="2" y="7" width="16" height="10" rx="5" />
        <circle cx="24" cy="12" r="4" />
        <rect x="30" y="7" width="16" height="10" rx="5" />
      </svg>
      <h2>Atlas</h2>
      <ul class="briefing-points">
        <li>
          One chain, in turns: name a country that begins with the last letter of the head — Nepal →
          Laos.
        </li>
        <li>
          A name ending in vowels also offers the consonant before them: Albania → Nigeria, Germany
          → Norway. Any longer shared ending chains too: Poland → Andorra.
        </li>
        <li>
          {{ challenge.turnSeconds }} seconds a move, and the clock tightens as the chain grows. No
          repeats — every country is named once.
        </li>
        <li v-if="challenge.strikes > 0">A dead clock burns your strike; the next puts you out.</li>
        <li v-else>A dead clock puts you out — sudden death.</li>
        <li>
          One rip cord each: swap the head for a fresh country on your turn — or it fires by itself
          when a dead end would knock you out.
        </li>
        <li v-if="challenge.placementOnly">
          A spent ending traps whoever holds it. Only your placement pays. Outlast the table.
        </li>
        <li v-else>
          A spent ending traps whoever holds it, and pays whoever sealed it. Outlast the table.
        </li>
      </ul>
    </BriefingCard>

    <ChainReveal
      v-if="finished"
      class="reveal"
      :state="state!"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.seatId"
      :attributions="promptSources"
      wrong-fate="broke the chain"
      outs-lead="You still had:"
      :stats="revealStats"
      :fates="revealFates"
    >
      <!-- The round's story: every chain walked, ties and all — and between
           stanzas, the dead end that ended one and seeded the next. -->
      <div class="reveal-chains">
        <template v-for="(stanza, index) in revealStanzas" :key="index">
          <span v-if="index > 0" class="chain-start eyebrow">Fresh chain</span>
          <AtlasChainRail :chain="stanza.chain" finished compact />
          <p v-if="stanza.line" class="chain-break">{{ stanza.line }}</p>
        </template>
      </div>
    </ChainReveal>

    <!-- Berth only on easy, where the console's dropdown returns — below
         easy there is no downward suggestion list to reserve for. -->
    <footer
      ref="consoleFooter"
      :class="{ 'suggest-berth': isEasyGame && myTurn && !finished && !briefing }"
    >
      <!-- The live rail stands down at the reveal — the card carries the
           full story (every chain, ties and all) from there. -->
      <AtlasChainRail
        v-if="!finished"
        class="route"
        :chain="chain"
        :next-openers="briefing ? undefined : openers"
        :options-left="briefing || isHardGame ? undefined : openNames.length"
        :tail="LIVE_RAIL_TAIL"
      />
      <div v-if="myTurn && !briefing && canPullCord" class="hint-row">
        <button class="hint-button rip-cord" type="button" :disabled="pending" @click="pullCord">
          Pull the rip cord — swap {{ headName }} for a fresh country
        </button>
      </div>
      <!-- On your turn the shot clock lives inside the guess console; between
           turns the header's turn-line chip carries the countdown. -->
      <div v-if="myTurn && !finished && !briefing" class="guess-box">
        <ChallengeConsole class="console" :value="secondsOnClock" :total="turnTotal">
          <!-- Pure recall — except on easy, where suggestions return from the
               third typed character (lib/atlas-chain's one constant). -->
          <CountryGuessInput
            ref="guessInput"
            :suggest="isEasyGame"
            :suggest-from="ATLAS_EASY_SUGGEST_FROM"
            :disabled="pending"
            :excluded="walked"
            :placeholder="`Starts with ${openersLabel}…`"
            @guess="submitGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import AtlasChainRail from '~/components/challenge/AtlasChainRail.vue'
import ChainReveal from '~/components/challenge/ChainReveal.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import MapYearLabels from '~/components/challenge/MapYearLabels.vue'
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import TrapSprung from '~/components/feedback/TrapSprung.vue'
import {
  ATLAS_EASY_SUGGEST_FROM,
  atlasHeadLetter,
  atlasLinkTie,
  atlasLiveMoves,
  atlasOpeners,
  atlasOpenersLabel,
  atlasTurnSeconds,
  isAtlasLink,
} from '~~/lib/atlas-chain'
import { datasetAttribution } from '~~/lib/attribution'
import {
  activePlayerId,
  type ChainBeats,
  canPullRipCord,
  chainBeats,
  chainNarration,
  deadEndRescued,
  liveChain,
  walkColor,
} from '~~/lib/chain'
import { countryName, getCountry } from '~~/lib/country'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useAckOnce } from '~~/lib/use-ack-once'
import { REPLAY_REDRAW_MS } from '~~/lib/motion'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { CountryColorGrouping } from '~~/types/map.type'
import type { ChainBreak } from '~~/types/challenges/group-modes.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const promptSources = datasetAttribution('countries')

/** The live rail folds a marathon chain to its last links — only the head is
 *  playable, and the reveal card carries the full ledger. */
const LIVE_RAIL_TAIL = 10

// The whole world stays visible — a letters game is played over the map's
// names, and the walked path needs it for context.
const {
  challenge,
  showInterstitial,
  begin: beginRound,
  hint,
  hintTone,
  announce,
  gameStore,
  update,
  createViewTimer,
} = useGroupChallenge('atlas-challenge', { solo: false })

const state = computed(() => challenge.value?.state)
const briefing = computed(() => !!state.value?.briefing)
const { sent: sentReady, send: sendReady } = useAckOnce(() => ({ event: 'chain-ready' }))
const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.seatId)

const chain = computed(() => (state.value ? liveChain(state.value) : []))
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
// The classic rule: no repeats for the whole round, across every chain walked.
const walked = computed(() => state.value?.chains.flat() ?? [])

const rules = gameStore.game ?? { regions: [], difficulty: 'normal' as const }
const isEasyGame = computed(() => gameStore.game?.difficulty === 'easy')
const isHardGame = computed(() => gameStore.game?.difficulty === 'hard')

const head = computed(() => chain.value[chain.value.length - 1])
const headName = computed(() => (head.value ? countryName(head.value) : ''))
const openers = computed(() => (head.value ? atlasOpeners(head.value) : []))
const openersLabel = computed(() => (head.value ? atlasOpenersLabel(head.value) : ''))
const trapRescued = computed(() => (state.value ? deadEndRescued(state.value) : false))
const turnTotal = computed(() => (challenge.value ? atlasTurnSeconds(challenge.value) : 0))

/** The head's legal continuations — the same function the server grades with. */
const openNames = computed(() => {
  if (finished.value || !state.value) return []
  return atlasLiveMoves(state.value, rules)
})

/** Walk-order badges over the live chain (1 = seed). On easy, a hand of valid
 *  continuations also carries their ISO code — some legal moves, spelled out. */
const sequenceEntries = computed(() => {
  const numbered = chain.value.map((isoCode, index) => ({ isoCode, label: String(index + 1) }))
  if (gameStore.game?.difficulty !== 'easy' || finished.value) return numbered
  return [...numbered, ...openNames.value.slice(0, 6).map(isoCode => ({ isoCode, label: isoCode }))]
})

// Easy mode's sampled continuations also get the shared action ring. Harder
// difficulties stay unassisted: revealing legal moves is the assist itself.
watch(
  [chain, finished],
  () => {
    gameStore.map.ringed =
      gameStore.game?.difficulty === 'easy' && !finished.value ? openNames.value.slice(0, 6) : []
  },
  { immediate: true }
)

const stakes = computed(() => {
  const grace =
    (challenge.value?.strikes ?? 0) > 0
      ? 'One slip is forgiven — the second is not.'
      : 'Sudden death: one slip and you are out.'
  const payLine = challenge.value?.placementOnly ? ' Only your placement pays.' : ''
  return `Take turns naming a country that begins where the last one ended — its last letter, the consonant before its final vowels, or any shared ending. No repeats, one rip cord each. ${grace}${payLine} Outlast everyone.`
})

const headline = computed(() => {
  if (finished.value) return 'The chain is broken'
  return head.value ? `The chain stands at ${countryName(getCountry(head.value))}` : 'Atlas'
})

const turnLabel = computed(() => {
  const needs = openersLabel.value ? ` — needs ${openersLabel.value}` : ''
  if (myTurn.value) return `Your move${needs}`
  return `${playerDisplayName(activePlayer.value)} is on the clock${needs}`
})

/** The settled round's facts strip. Everything derives from the state the
 *  reveal already holds — links from the chains, runs from `named`, and the
 *  deepest overlap straight from `atlasLinkOverlap`, so the card can never
 *  disagree with the rule that graded the round. */
const revealStats = computed<{ label: string; value: string }[]>(() => {
  const current = state.value
  if (!current?.finished) return []
  const stats: { label: string; value: string }[] = []

  const links = current.chains.reduce((total, walkedChain) => total + walkedChain.length - 1, 0)
  stats.push({ label: 'Links', value: String(links) })
  if (current.chains.length > 1) {
    stats.push({ label: 'Chains', value: String(current.chains.length) })
  }

  // Longest run: consecutive links by one player — only possible while the
  // rest of the table burns strikes and clocks, which is what makes it a stat.
  const moverOf = (isoCode: ISOCountryCode) =>
    Object.keys(current.named).find(playerId => current.named[playerId]?.includes(isoCode))
  let bestRun = 0
  let bestRunner: string | undefined
  for (const walkedChain of current.chains) {
    let run = 0
    let previous: string | undefined
    for (let index = 1; index < walkedChain.length; index++) {
      const mover = moverOf(walkedChain[index])
      run = mover && mover === previous ? run + 1 : 1
      previous = mover
      if (mover && run > bestRun) {
        bestRun = run
        bestRunner = mover
      }
    }
  }
  if (bestRunner && bestRun >= 2) {
    stats.push({ label: 'Longest run', value: `${seatName(bestRunner)} · ${bestRun}` })
  }

  let deepest = 1
  let deepestLink: [ISOCountryCode, ISOCountryCode] | undefined
  const openedWith: { [letter: string]: number } = {}
  for (const walkedChain of current.chains) {
    for (let index = 1; index < walkedChain.length; index++) {
      const opener = atlasHeadLetter(walkedChain[index]).toUpperCase()
      openedWith[opener] = (openedWith[opener] ?? 0) + 1
      const tie = atlasLinkTie(walkedChain[index - 1], walkedChain[index])
      if (tie && tie.overlap > deepest) {
        deepest = tie.overlap
        deepestLink = [walkedChain[index - 1], walkedChain[index]]
      }
    }
  }
  if (deepestLink) {
    const tie = atlasLinkTie(deepestLink[0], deepestLink[1])!
    stats.push({
      label: 'Deepest link',
      value: `${tie.fragment.toUpperCase()} · ${countryName(deepestLink[1])}`,
    })
  }

  const [busiest, busiestCount] =
    Object.entries(openedWith).sort((one, two) => two[1] - one[1])[0] ?? []
  if (busiest && busiestCount && busiestCount >= 3) {
    stats.push({ label: 'Busiest letter', value: `${busiest} · ${busiestCount} of ${links}` })
  }

  const cords = (current.breaks ?? []).filter(
    sealed => sealed.kind === 'rip-cord' || sealed.rescued
  ).length
  if (cords) stats.push({ label: 'Rip cords', value: String(cords) })

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
  const where = deadHead ? `Dead end at ${countryName(deadHead)}` : 'Dead end'
  if (sealed.rescued) return `${where} — ${who} pulled the rip cord`
  const verb = sealed.playerId === gameStore.seatId ? 'were' : 'was'
  return `${where} — ${who} ${verb} knocked out`
}

/** Fate lines that count what was still open when the player fell. */
const revealFates = computed<{ [playerId: string]: string } | undefined>(() => {
  const current = state.value
  if (!current?.finished) return undefined
  const fates: { [playerId: string]: string } = {}
  for (const playerId of current.eliminated) {
    const outcome = current.outcomes[playerId]
    const open = current.missedOuts[playerId]?.length ?? 0
    if (!open) continue
    const names = `${open} ${open === 1 ? 'name' : 'names'} open`
    if (outcome === 'wrong') fates[playerId] = `broke the chain with ${names}`
    if (outcome === 'timeout') fates[playerId] = `ran out of clock with ${names}`
  }
  return fates
})

const { secondsOnClock } = useDeadlineClock(
  () => state.value?.deadline,
  () => turnTotal.value
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
  if (!active || !myTurn.value || pending.value || !head.value) return
  // A repeat is a slip of the finger, not a claim of knowledge — free hint.
  if (walked.value.includes(country.isoCode)) {
    return announce({ hint: `${countryName(country)} is already in the chain` })
  }
  // The courtesy check — the server re-validates through the same function.
  // A broken link never leaves the client: it costs only the clock.
  if (!isAtlasLink(head.value, country.isoCode)) {
    return announce({
      tone: 'alert',
      hint: `${countryName(country)} doesn't chain from ${headName.value} — try ${openersLabel.value}`,
    })
  }
  pending.value = true
  update({ event: 'submit-chain-move', isoCode: country.isoCode, turn: active.state.turn })
}

const canPullCord = computed(() =>
  state.value ? canPullRipCord(state.value, gameStore.seatId) : false
)

const pullCord = () => {
  const active = challenge.value
  if (!active || !canPullCord.value || pending.value) return
  pending.value = true
  update({ event: 'pull-rip-cord', turn: active.state.turn })
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
// Table beats derive from consecutive snapshots through lib/chain's shared
// beat-diff (Border Chain rides the same one) — nothing rides the wire and
// nothing is stored. The first snapshot has no diff base, so a rejoiner lands
// on the current state silently instead of replaying stale toasts. One
// channel, one message at a time: the rail is the durable record.
let seenBeats: ChainBeats | undefined
watch(
  challenge,
  current => {
    const s = current?.state
    if (!s) return
    const snapshot = chainBeats(s)
    const before = seenBeats
    seenBeats = snapshot
    if (!before) return

    const line = chainNarration(s, before, snapshot, {
      seatId: gameStore.seatId,
      seatName,
      fate: outcome => (outcome === 'timeout' ? 'the clock ran dry' : 'the chain broke'),
      move: (name, to, from) => {
        const tie = atlasLinkTie(from, to)
        const flourish =
          tie?.kind === 'overlap'
            ? ` — ${tie.overlap} letters deep`
            : tie?.kind === 'consonant'
              ? ` off the ${tie.fragment.toUpperCase()}`
              : ''
        return `${name} chained ${countryName(to)}${flourish}`
      },
    })
    if (line) announce({ hint: line })
  },
  { immediate: true, deep: true }
)

// --- Painting the map --------------------------------------------------------
const RETIRED_FILL = 'hsla(215.7, 15%, 55%, 0.32)'

/** Directed arcs junction to junction — the letter hops drawn as travel. */
const routeKeys = (): string[] => {
  const live = chain.value
  return live.slice(1).map((isoCode, index) => `${live[index]}>${isoCode}`)
}

const paintChain = (staggered: boolean) => {
  const current = state.value
  if (!current) return
  const groupings: CountryColorGrouping[] = []
  current.chains.forEach((walkedChain, chainIndex) => {
    const live = chainIndex === current.chains.length - 1
    walkedChain.forEach((isoCode, index) => {
      const isHead = live && !current.finished && index === walkedChain.length - 1
      groupings.push({
        color: live ? walkColor(index, walkedChain.length, isHead) : RETIRED_FILL,
        countries: [isoCode],
      })
    })
  })
  gameStore.map.staggered = staggered
  gameStore.map.countryGroupings = groupings
  gameStore.map.landRoutes = routeKeys()
  const liveHead = current.finished ? undefined : liveChain(current).at(-1)
  gameStore.map.pulsing = liveHead ? [liveHead] : []

  // During the dead-end hold the map carries the proof: the spent names take
  // the miss wash and the camera frames them with the sealed head, so the
  // overlay's claim is visibly true behind it.
  const sprung = current.trap
  if (sprung) {
    gameStore.map.tints = Object.fromEntries(
      sprung.spent.map(isoCode => [isoCode, 'stray' as const])
    )
    gameStore.map.focus = [sprung.head, ...sprung.spent]
    gameStore.map.pulsing = [sprung.head]
    return
  }
  gameStore.map.tints = {}
  gameStore.map.focus = current.chains.flat()
}

watch(challenge, () => !finished.value && paintChain(false), { immediate: true, deep: true })

const scheduleReplay = createViewTimer()

// The reveal replay: blank the path, then let it re-arrive hop by hop, with
// the local player's missed continuations glowing as the lesson. Immediate, so
// a client that arrives with the round already finished (reconnect, harness)
// still gets the replay.
watch(
  finished,
  done => {
    if (!done) return
    gameStore.map.countryGroupings = undefined
    gameStore.map.landRoutes = []
    gameStore.map.pulsing = []
    scheduleReplay(() => {
      paintChain(true)
      const outs = state.value?.missedOuts[gameStore.seatId] ?? []
      gameStore.map.tints = Object.fromEntries(outs.map(isoCode => [isoCode, 'optimal']))
    }, REPLAY_REDRAW_MS)
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.briefing-mark {
  width: 4.4rem;
  fill: none;
  stroke: var(--dark-blue);
  stroke-width: 2;
  stroke-linecap: round;
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

// Walked chain over the console — the input holds the bottom edge.
footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
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
