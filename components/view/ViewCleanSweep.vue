<template>
  <div v-if="challenge" class="clean-sweep challenge-shell" :class="{ 'last-call': lastCall }">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Clean Sweep`"
      title="First to say it, owns it"
      :stakes="`One list, one clock, and everyone racing the same board. A name you get is a name nobody else can have — and a name you get wrong benches you while they keep going.`"
      @done="beginRound"
    />

    <ChallengePrompt :hint="hint" :hint-tone="hintTone">
      <template v-if="!finished">
        <!-- The set stays sealed through the briefing: it drops for the whole
             table at once, when the clock starts. -->
        <h1 v-if="briefing" class="map-caption">Clean Sweep</h1>
        <h1 v-else class="map-caption">{{ set?.prompt }}</h1>
        <span v-if="!briefing" class="map-caption sub" :class="{ urgent: lastCall }">
          {{ statusLine }}
        </span>
      </template>
      <template v-else>
        <h1 class="map-caption">{{ swept ? 'Board swept' : "Time — that's the board" }}</h1>
        <span class="map-caption sub">{{ verdictLine }}</span>
      </template>

      <!-- The live scoreboard, during play: who is eating the pool, leader
           first. A TransitionGroup so an overtake SLIDES — the standings
           reorder on nearly every claim, and a rail that snaps turns the
           round's best moment (being passed) into a flicker you miss. -->
      <TransitionGroup v-if="!briefing && !finished" tag="ul" name="chain" class="standings">
        <li
          v-for="seat in standings"
          :key="seat.playerId"
          class="standings-seat chip player-accent"
          :class="{ mine: seat.playerId === gameStore.seatId, leading: leaders.has(seat.playerId) }"
          :style="{ '--player-color': gameStore.game?.players[seat.playerId]?.color }"
        >
          <PlayerPawn class="standings-pawn" :player="gameStore.game?.players[seat.playerId]" />
          <span class="standings-count">{{ seat.claimed.length }}</span>
        </li>
      </TransitionGroup>

      <GuessTicker
        v-if="!briefing && !finished"
        :entries="entries"
        :players="gameStore.game?.players ?? {}"
      />
    </ChallengePrompt>

    <!-- The briefing: a rules card each player dismisses explicitly. In a mode
         where tempo is the currency, nobody starts typing while another still
         reads. -->
    <section v-if="briefing" class="briefing briefing-card pane tr decorator-bottom">
      <h2>Clean Sweep</h2>
      <ul class="briefing-points">
        <li>One list drops when everyone's ready. Name as much of it as you can.</li>
        <li>
          Everyone races the same board on one clock, {{ challenge.durationSeconds }} seconds.
        </li>
        <li>A name you get is yours — nobody else can claim it.</li>
        <li>A wrong name benches you for a few seconds while the rest keep going.</li>
        <li>Clear the whole board and every seat banks the sweep bonus.</li>
      </ul>
      <div class="ready-row">
        <div
          v-for="playerId in state.order"
          :key="playerId"
          class="ready-seat"
          :class="{ waiting: !state.ready.includes(playerId) }"
        >
          <PlayerPawn class="ready-pawn" :player="gameStore.game?.players[playerId]" />
          <span class="seat-name">{{ seatName(playerId) }}</span>
        </div>
      </div>
      <ButtonFilled v-if="!iAmReady" @click="sendReady">Ready</ButtonFilled>
      <p v-else class="briefing-waiting">Waiting for the rest of the table…</p>
    </section>

    <!-- The board. The question is the shape of the empty slots, so unclaimed
         ones stay blank and nothing ever re-sorts under a racing eye. -->
    <section v-else-if="!finished && !showInterstitial" class="board">
      <ul class="slot-grid">
        <li
          v-for="slot in slots"
          :key="slot.key"
          class="slot"
          :class="{ taken: slot.taken, mine: slot.holder?.id === gameStore.seatId }"
          :style="{ '--player-color': slot.holder?.color }"
        >
          <template v-if="slot.country">
            <CountryChip class="slot-chip" compact tag="span" :country="slot.country" />
            <PlayerPawn v-if="slot.holder" class="slot-pawn" :player="slot.holder" />
          </template>
          <span v-else class="slot-blank" aria-hidden="true" />
        </li>
      </ul>
    </section>

    <footer
      v-if="!briefing && !finished && !showInterstitial"
      ref="consoleFooter"
      class="suggest-berth"
    >
      <div class="guess-box">
        <!-- The bench IS the penalty, so it has to be watchable: the console
             goes dead on its own clock while the board keeps taking claims. -->
        <ChallengeConsole
          v-if="!benchedSeconds"
          class="console"
          :value="secondsOnClock"
          :total="challenge.durationSeconds"
        >
          <CountryGuessInput
            ref="guessInput"
            :excluded="excluded"
            placeholder="Name one…"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
        <p v-else class="benched map-caption">
          <span class="benched-clock">{{ benchedSeconds }}</span>
          <span class="benched-copy">Benched — they're still going</span>
        </p>
      </div>
    </footer>

    <SweepRevealCard
      v-if="finished"
      class="reveal"
      :challenge="challenge"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.seatId"
    />
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import SweepRevealCard from '~/components/challenge/SweepRevealCard.vue'
import { countryName, getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import {
  SWEEP_LAST_CALL,
  SWEEP_SETS,
  sweepClaimedBy,
  sweepIsComplete,
  sweepLeaders,
  sweepStandings,
  sweepUnclaimed,
} from '~~/lib/clean-sweep'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { CleanSweepState } from '~~/types/challenges/group-modes.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/**
 * Clean Sweep — the contested checklist. The board is the stage: N slots, one
 * per member of the set, flipping into the claimant's colour as the room eats
 * the pool. The world map behind it fills in with the same colours, so the
 * round's picture is territory changing hands.
 *
 * Nothing here decides anything. The claim, the collision and the bench are
 * all the server's calls, arriving as snapshots — this view only types, paints
 * and reconciles. The one piece of local state is the in-flight pick, which
 * exists so that LOSING a race can be announced: the slot comes back held by
 * somebody else, and that is the collision.
 */
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  hint,
  hintTone,
  announce,
  entries,
  gameStore,
  update,
} = useGroupChallenge('clean-sweep-challenge')

// Total fallback: timers and watchers keep evaluating for a beat after the
// round advances past this mode, so the state must never dereference undefined.
const EMPTY_STATE: CleanSweepState = {
  ready: [],
  deadline: 0,
  order: [],
  claims: [],
  strays: [],
  benched: {},
}
const state = computed(() => challenge.value?.state ?? EMPTY_STATE)
const finished = computed(() => !!state.value.finished)
const briefing = computed(
  () => !!state.value.briefing && !finished.value && !showInterstitial.value
)

const set = computed(() => (challenge.value ? SWEEP_SETS[challenge.value.setId] : undefined))

// The server owns the one deadline — this only repaints it. The composable's
// begin() is deliberately not called: it would arm a second, local countdown
// off durationSeconds.
const { secondsOnClock } = useDeadlineClock(
  () => state.value.deadline,
  () => challenge.value?.durationSeconds
)

const beginRound = () => {
  showInterstitial.value = false
  started.value = true
}

const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.seatId)

const iAmReady = computed(() => state.value.ready.includes(gameStore.seatId))
const readySent = ref(false)
const sendReady = () => {
  if (readySent.value) return
  readySent.value = true
  update({ event: 'sweep-ready' })
}

const claimedBy = computed(() => (challenge.value ? sweepClaimedBy(challenge.value) : {}))
const standings = computed(() => (challenge.value ? sweepStandings(challenge.value) : []))
const unclaimed = computed(() => (challenge.value ? sweepUnclaimed(challenge.value) : []))

/**
 * Position already says who leads — the rail is sorted leader-first — but a
 * slide is exactly when position is hardest to read, so the count carries it
 * too. `sweepLeaders` owns the "is anyone actually ahead" question.
 */
const leaders = computed(
  () => new Set<string>(challenge.value ? sweepLeaders(challenge.value) : [])
)
const swept = computed(() => !!challenge.value && sweepIsComplete(challenge.value))

/**
 * The board, in deal order. A slot the room has taken shows its country; an
 * open one is a blank the player has to fill from memory — so the grid's
 * geometry never moves, and "three left" is legible without counting.
 */
const slots = computed(() =>
  (challenge.value?.members ?? []).map((isoCode, index) => {
    const holderId = claimedBy.value[isoCode]
    return {
      key: `${isoCode}:${index}`,
      taken: !!holderId,
      country: holderId ? getCountry(isoCode) : undefined,
      holder: holderId ? gameStore.game?.players[holderId] : undefined,
    }
  })
)

/** The final gasp, derived rather than announced — no wire, no drift. */
const lastCall = computed(
  () => !briefing.value && !finished.value && unclaimed.value.length <= SWEEP_LAST_CALL
)

/** The bench is a server-stamped deadline like any other, so it repaints
 *  through the shared clock — a second hand-rolled interval beside the round's
 *  own would tick on its own cadence. An absent stamp reads 0: not benched. */
const { secondsOnClock: benchedSeconds } = useDeadlineClock(
  () => state.value.benched[gameStore.seatId]
)

/** Slots already gone — the suggestion list stops offering what the board can
 *  no longer give. Deliberately NOT including our own in-flight pick: a claim
 *  the server silently refuses would strike that country off our list for the
 *  rest of the round, and `onGuess` already guards the double-submit. */
const excluded = computed<ISOCountryCode[]>(() => Object.keys(claimedBy.value) as ISOCountryCode[])

/**
 * Our own un-acked claim. The server is the authority on who got there first,
 * so a pick is held here until a snapshot resolves it: ours (claimed), theirs
 * (the collision — the mode's signature beat), or gone with the round.
 */
const inFlight = ref<ISOCountryCode>()

// Being benched retires any claim still in flight: the server refuses a
// benched seat silently, so nothing else would ever resolve it — and a latch
// left standing would fire a false "they got there first" the moment a rival
// took that country, for a claim that was never live.
watch(benchedSeconds, seconds => {
  if (seconds) inFlight.value = undefined
})

watch(claimedBy, held => {
  const pending = inFlight.value
  if (!pending) return
  const holder = held[pending]
  if (!holder) return
  inFlight.value = undefined
  if (holder === gameStore.seatId) return
  // Right name, one beat late. Named to the room on purpose: the board already
  // shows the slot is gone, and the chip says who took it out from under you.
  announce({
    kind: 'taken',
    isoCode: pending,
    hint: `${countryName(getCountry(pending))} — ${seatName(holder)} got there first`,
  })
})

// A spent bench frees the box; put the cursor back in it so the player is not
// punished twice. Bare focus(), not focus({ auto: true }) — this is a
// mid-round refocus, which is exactly what the distinction exists for.
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
watch(benchedSeconds, (seconds, previous) => {
  if (previous && !seconds) nextTick(() => guessInput.value?.focus())
})

const onGuess = (country: Country) => {
  if (!challenge.value || finished.value || briefing.value) return
  if (benchedSeconds.value) return
  if (claimedBy.value[country.isoCode] || inFlight.value === country.isoCode) {
    return announce({ hint: `${countryName(country)} is already taken` })
  }

  const onBoard = challenge.value.members.includes(country.isoCode)
  if (onBoard) inFlight.value = country.isoCode
  else {
    // The bench is the server's to stamp; the chip is this seat's own account
    // of what it just did, and it goes to the room under the label policy.
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: `${countryName(country)} isn't on this list`,
      tone: 'alert',
    })
  }

  update({ event: 'submit-sweep-claim', isoCode: country.isoCode })
}

const statusLine = computed(() => {
  const total = challenge.value?.members.length ?? 0
  const left = unclaimed.value.length
  if (!left) return 'Board swept'
  const mine = standings.value.find(seat => seat.playerId === gameStore.seatId)?.claimed.length ?? 0
  const taken = total - left
  return `${taken} of ${total} taken · ${left} left · you have ${mine}`
})

const verdictLine = computed(() => {
  const mine = standings.value.find(seat => seat.playerId === gameStore.seatId)?.claimed.length ?? 0
  const left = unclaimed.value.length
  if (swept.value) return `You took ${mine} — the table cleared it`
  return `You took ${mine} · ${left} nobody reached`
})

// The world map is the second stage: one grouping per claimant, in that
// player's own colour, so the round reads as territory changing hands. The
// verdict tints (MapTint) stay untouched — these fills mean OWNERSHIP, and
// borrowing the right/wrong palette for them would say something false.
watchEffect(() => {
  const byPlayer = new Map<string, ISOCountryCode[]>()
  for (const claim of state.value.claims) {
    const colour = gameStore.game?.players[claim.playerId]?.color
    if (!colour) continue
    byPlayer.set(colour, [...(byPlayer.get(colour) ?? []), claim.isoCode])
  }
  gameStore.map.countryGroupings = byPlayer.size
    ? [...byPlayer.entries()].map(([color, countries]) => ({ color, countries }))
    : undefined
})

const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

// The briefing card's layout comes from the shared .briefing-card template.
.briefing h2 {
  margin: 0;
}

// The live scoreboard: pawns and counts, nothing else. Small on purpose — it
// must be readable at a glance without competing with the board.
.standings {
  gap: 0.6rem;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.standings-seat {
  gap: 0.4rem;
  display: flex;
  align-items: center;
  padding: 0.15rem 0.7rem;

  .standings-pawn {
    width: 1.3rem;
    height: 1.7rem;
  }

  .standings-count {
    opacity: 0.6;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--dark-blue);
  }

  // The count carries the lead, not a badge: full-strength ink out front,
  // muted behind. One property, legible mid-slide, no new chrome.
  &.leading .standings-count {
    opacity: 1;
    font-size: 1.6rem;
  }

  &.mine {
    outline: 0.15rem solid var(--warm-sand);
    outline-offset: 0.15rem;
  }
}

.board {
  margin: auto 0;
  pointer-events: auto;
  max-height: calc(var(--viewport-height) - 26rem);
  overflow-y: auto;
  scrollbar-width: thin;
}

// The shell's column stretches its children, so the grid centres ITSELF rather
// than the section carrying a width and drifting to the left edge.
.slot-grid {
  margin: 0 auto;
  padding: 0;
  gap: 0.4rem;
  display: grid;
  list-style: none;
  width: min(64rem, calc(100vw - 3.2rem));
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
}

// An open slot is a blank the player has to fill from memory. It is deliberately
// the loudest thing on the board — the empty ones ARE the question.
.slot {
  gap: 0.5rem;
  height: 3rem;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 0 0.6rem;
  border-radius: 0.8rem;
  background: milk(0.55);
  border: 0.15rem dashed ink(0.28);

  &.taken {
    background: milk(0.9);
    border: 0.15rem solid transparent;
    border-left-width: 0.35rem;
    border-left-color: var(--player-color, transparent);
    // Square the accented edge: a thick border through a 0.8rem radius renders
    // as a crescent, and the identity edge has to read as a bar.
    border-radius: 0 0.8rem 0.8rem 0;
    // row-land, NOT chip-in: chip-in ends on translate(-50%, -50%), which is
    // the centring transform a chip floating over the map needs and pure
    // damage to a grid item.
    animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  }

  &.mine :deep(.chip-name) {
    font-weight: 700;
  }
}

.slot-chip {
  flex: 1;
  padding: 0;
  min-width: 0;
}

.slot-pawn {
  flex: none;
  width: 1.2rem;
  height: 1.6rem;
}

.slot-blank {
  flex: 1;
  height: 0.15rem;
  border-radius: 0.1rem;
  background: ink(0.16);
}

// Last call: the final gasp the mode is built around, derived from the board
// rather than announced. The counter shouts and the open slots breathe.
.sub.urgent {
  font-weight: 700;
  color: var(--hior-ange);
}

.last-call .slot:not(.taken) {
  border-style: solid;
  background: flame(0.12);
  border-color: var(--hior-ange);
}

.benched {
  gap: 0.8rem;
  margin: 0;
  display: flex;
  align-items: center;
  pointer-events: auto;
  justify-content: center;
  padding: 0.6rem 1.4rem;
  border-radius: 1.2rem;
  background: flame(0.14);
  border: 0.1rem solid var(--hior-ange);
  width: min(42rem, calc(100vw - 3.2rem));

  .benched-clock {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 1;
    color: var(--hior-ange);
  }

  .benched-copy {
    font-size: 1.5rem;
    color: var(--dark-blue);
  }
}

.reveal {
  z-index: 2;
  margin: auto;
  overflow-y: auto;
  pointer-events: auto;
  max-height: calc(var(--viewport-height) - 16rem);
  max-width: min(76rem, calc(100% - 2.4rem));
}

@media screen and (max-width: $tablet) {
  .board {
    max-height: calc(var(--viewport-height) - 24rem);
  }

  .slot-grid {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  }

  .slot {
    height: 2.6rem;
    font-size: 1.3rem;
  }

  .reveal {
    max-height: calc(var(--viewport-height) - 14rem);
  }
}
</style>
