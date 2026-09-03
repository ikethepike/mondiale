<template>
  <div v-if="challenge" class="terra-incognita challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      kind="terra-incognita"
      title="The atlas is failing"
      stakes="Borders are about to dissolve. Notice which country melted away — or which one grew — and name it to put the line back."
      @done="brief"
    />

    <!-- The card stands alone while it is up — the prompt and the console
         would share its column and squeeze it into a scroller. -->
    <TerraBriefing
      v-if="briefing"
      :challenge="challenge"
      :ready="state.ready"
      :participants="state.order"
      :sent="iAmReady"
      :spectating="gameStore.watching"
      @ready="sendReady"
    />

    <Transition name="veil">
      <div v-if="collapsing" class="collapse-veil" />
    </Transition>

    <ChallengePrompt v-if="!briefing" :hint="hint" :hint-tone="hintTone">
      <h1 class="map-caption">{{ revealed ? 'What you never noticed' : "What's missing?" }}</h1>
      <span class="map-caption sub">
        <template v-if="revealed">
          {{ restored.length }} of {{ deck.length }} restored{{
            missed.length ? ` · ${missed.length} still gone, named on the map` : ' · a clean world'
          }}
        </template>
        <template v-else-if="!started"
          >Name the country that vanished, or the one it melted into</template
        >
        <template v-else>
          {{ found.length }} restored · {{ outstanding.length }} still gone · either name counts
        </template>
      </span>

      <!-- The state of the world, as a bar of slots rather than a number: the
           mode's tension is how many holes stand open at once, and a row
           filling toward the collapse line says that at a glance. It rides
           the header rather than the shell's column — the shell centres a
           stray middle child, which put the gauge out in the South Atlantic
           reading as a map annotation. -->
      <ul
        v-if="!revealed"
        class="collapse-gauge"
        :class="{ alarm: collapsing }"
        :aria-label="`${outstanding.length} countries missing`"
      >
        <li
          v-for="slot in challenge.collapseThreshold"
          :key="slot"
          class="slot"
          :class="{ lost: slot <= outstanding.length }"
        />
      </ul>
    </ChallengePrompt>

    <footer v-if="!revealed && !briefing" ref="consoleFooter" class="suggest-berth">
      <TransitionGroup ref="trail" tag="ol" name="chain" class="country-chip-list rail">
        <CountryChip
          v-for="(isoCode, index) in guesses"
          :key="isoCode"
          class="map-caption"
          :class="{ stray: !answerSet.has(claims[index] ?? isoCode) }"
          :country="getCountry(isoCode)"
        />
      </TransitionGroup>
      <div class="guess-box">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started"
            :excluded="guesses"
            placeholder="Name the missing country…"
            @guess="onGuess"
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
import TerraBriefing from '~/components/challenge/TerraBriefing.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { MOTION } from '~~/lib/motion'
import { terraFrame, terraRestoredHoles, terraVanishedBy } from '~~/lib/terra-incognita'
import { useAckOnce } from '~~/lib/use-ack-once'
import { useChipTrail } from '~~/lib/use-chip-trail'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { TerraBriefingState } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Terra Incognita: the world map, minus pieces of itself.
 *
 * The whole round is a function of the clock. The challenge carries the deck
 * and the cadence, so the view never learns which country went from the wire —
 * it derives the failing atlas from elapsed time through `terraVanishedBy`,
 * the same way the reveal and the scorecard later replay it.
 *
 * That clock is the server's. The round opens on a briefing card, and the
 * classic deadline stamps only when the whole table is ready (or the cap
 * forces it), so nothing fails under anyone's card and every seat — and the
 * booth — derives the SAME world from the one stamp.
 *
 * The answer set GROWS with the clock: only countries that have actually gone
 * can be named — by their own name or by the neighbour they melted into. A
 * country still sitting on the map is a plain wrong guess with a plain wrong
 * guess's cost — never a bounce, because a bounce that said "not yet" would
 * tell the player it was coming.
 */
const {
  challenge,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  elapsedFraction,
  begin: beginRound,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
  currentRound,
} = useGroupChallenge('terra-incognita-challenge', { solo: false })

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

// Total fallback: watchers keep evaluating for a beat after the round
// advances past this mode, so the state must never dereference undefined.
const EMPTY_STATE: TerraBriefingState = { ready: [], order: [] }
const state = computed(() => challenge.value?.state ?? EMPTY_STATE)
const briefingOpen = computed(() => !!state.value.briefing)

/** Milliseconds into the round. The clock ticks per second and the cadence is
 *  measured in whole seconds, so second-granularity is exact here. */
const elapsedMs = computed(() =>
  challenge.value ? elapsedFraction.value * challenge.value.durationSeconds * 1000 : 0
)

/** What the atlas has lost so far — the live answer set. Nothing while the
 *  table is still briefed: the booth's ambience clock runs from mount, and
 *  the world must not fail for a spectator before it fails for the table. */
const gone = computed(() =>
  challenge.value && !briefingOpen.value ? terraVanishedBy(challenge.value, elapsedMs.value) : []
)

const {
  guesses,
  claims,
  answerSet,
  found,
  start: begin,
  onGuess,
} = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers: gone,
    // True of every country still drawn, whether or not it is in the deck —
    // so the miss copy costs the player a point without telling them one is
    // on its way.
    wrongHint: country => `${countryName(country)} is still on the map`,
    // The ONE mapping the server grades with, scoped to what has ALREADY
    // gone: accepting the absorber of a country still on the map would tell
    // the player it is about to vanish.
    claims: list =>
      challenge.value ? terraRestoredHoles(challenge.value, list, gone.value) : [...list],
    // The answer set grows with the clock, so "everything found" means the
    // whole deck — not everything that has gone by now.
    complete: list => list.length === deck.value.length,
    focusInput: () => guessInput.value?.focus({ auto: true }),
  }
)

/**
 * The briefing. The interstitial hands over to the card; the card's click is
 * a `terra-ready` ack, and the server's close (the last ack, or the cap) is
 * what starts the round — never the click itself.
 */
const revealed = computed(() => submitted.value)
const briefing = computed(() => briefingOpen.value && !showInterstitial.value && !revealed.value)
const iAmReady = computed(() => state.value.ready.includes(gameStore.seatId))
const { send: sendReady } = useAckOnce(() => ({ event: 'terra-ready' }))

const startRound = () => {
  // The booth began on mount, before the stamp existed: re-enter so the
  // clock reads the deadline now (begin replaces its own interval).
  if (gameStore.watching) return beginRound()
  if (!started.value) begin()
}
const brief = () => {
  showInterstitial.value = false
  if (!briefingOpen.value) startRound()
}
watch(briefingOpen, (open, was) => {
  if (was && !open && !showInterstitial.value) startRound()
})

// The restored names ride the phone's one-row rail — it follows the newest.
const { trail } = useChipTrail(() => guesses.value.length)

/** Gone and not yet named back — what the collapse gauge counts. */
const outstanding = computed(() => gone.value.filter(isoCode => !found.value.includes(isoCode)))

/** The server's reveal hold (ROUND_BEATS) runs from the seat's own submit;
 *  everything below is display-only, and the server's flip ends the beat. */
const deck = computed(() => challenge.value?.vanishings ?? [])
/** What this seat put back, by the server's ledger once it holds one — a
 *  remount mid-reveal has no local guesses, and the banked list is what was
 *  actually graded. */
const restored = computed(() => {
  const banked = currentRound.value?.round.groupAnswers[gameStore.playerId]
  return banked ? banked.submitted.filter(isoCode => deck.value.includes(isoCode)) : found.value
})
const missed = computed(() => deck.value.filter(isoCode => !restored.value.includes(isoCode)))

/** The alarm is a verdict on the LIVE round: once the answer is banked the
 *  world is whatever it is, and a reveal read through a pulsing veil is a
 *  lesson nobody can concentrate on. */
const collapsing = computed(
  () =>
    !!challenge.value &&
    started.value &&
    !revealed.value &&
    outstanding.value.length >= challenge.value.collapseThreshold
)

/**
 * Paint the failing atlas. The vanished set is everything gone that the
 * player has not restored; `restoring` holds a country for one beat so its
 * outline draws itself back on rather than snapping back with the layer swap.
 */
const restoring = ref<ISOCountryCode[]>([])
watch(found, (now, before = []) => {
  const fresh = now.filter(isoCode => !before.includes(isoCode))
  if (!fresh.length) return
  restoring.value = [...restoring.value, ...fresh]
  // Held exactly as long as the outline takes to draw itself (the same token
  // the map's `.atlas-restored` animation runs on), then dropped so the
  // country is plain map again.
  const settle = setTimeout(() => {
    restoring.value = restoring.value.filter(isoCode => !fresh.includes(isoCode))
  }, MOTION.slow * 1000)
  registerCleanup(() => clearTimeout(settle))
})

/**
 * The map IS the reveal. When the round resolves, the countries the player
 * saved stay whole and the ones they never noticed stay fused into their
 * neighbours — each one wearing its own name and a dashed ghost of its
 * outline, written across the hole where it should have been. A labelled
 * blank is the single most useful frame this mode can end on: it puts the
 * name and the place together at the exact moment the player has just proved
 * they had not connected them.
 */
watchEffect(() => {
  gameStore.map.vanished = revealed.value ? missed.value : outstanding.value
  gameStore.map.absorbedBy = challenge.value?.absorbedBy
  gameStore.map.restoring = restoring.value
  gameStore.map.traced = revealed.value ? missed.value : []
  gameStore.map.countryLabels = revealed.value
    ? Object.fromEntries(missed.value.map(isoCode => [isoCode, countryName(isoCode)]))
    : undefined
})

/**
 * The camera crops to the round's frame and STAYS there.
 *
 * A country vanishing must not move the camera — the pan would be a free
 * answer, pointing at the very thing the player is meant to notice for
 * themselves. The frame is a map-space box (`terraFrame`), not a list of
 * countries: framing by country boxes let one big neighbour blow a Balkan crop
 * out to the whole planet, and a box scales cleanly with the difficulty.
 *
 * The reveal is the one deliberate move: it pulls in to the losses that were
 * never named, which is the beat where pointing at them is the entire idea.
 */
const frame = computed(() =>
  challenge.value && gameStore.game
    ? terraFrame(challenge.value, gameStore.game.difficulty)
    : undefined
)

// The frame already carries the difficulty's margin, so the camera's own pad
// stays near zero — the default 35% would undo the easy crop.
gameStore.map.framePad = { scale: 0.04, floor: 10 }

// Deliberately NOT watching `missed`: it changes on every restore, and each
// change would re-aim the rig mid-round. Read inside the callback instead,
// where it is settled anyway — the reveal only runs once the answer is banked.
watch(
  [frame, revealed],
  ([box, isRevealed]) => {
    if (isRevealed && missed.value.length) {
      // The names sit at the countries' anchors, so the pull-in keeps air
      // around them — a tight fit hid the topmost name under the header.
      gameStore.map.framePad = { scale: 0.25, floor: 30 }
      gameStore.map.frame = undefined
      gameStore.map.focus = [...missed.value]
      return
    }
    gameStore.map.focus = []
    gameStore.map.frame = box
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The gauge sits under the prompt, centred: a row of slots that fill as the
// world empties out. It stands over open map, so it takes the same cream
// scrim every caption wears — without it the slots read as a dashed
// annotation drawn ON the world rather than chrome floating above it.
.collapse-gauge {
  @include caption-surface(999px);
  gap: 0.6rem;
  display: flex;
  list-style: none;
  align-items: center;
  pointer-events: none;
  margin: 0.8rem auto 0;
  padding: 0.6rem 1rem;
  transition: border-color var(--motion-base) var(--ease-smooth);

  &.alarm {
    border-color: ember(0.6);
  }
}

.slot {
  width: 1.6rem;
  height: 0.5rem;
  border-radius: 999px;
  background: ink(0.12);
  transition: background var(--motion-base) var(--ease-smooth);

  &.lost {
    background: ember(0.9);
  }
}

// Past the line the page takes on the clock's ember at its edges — a wash,
// not a banner, so nothing covers the map the player is scanning. It lives
// only while the round is live and leaves with a fade, never a cut.
.collapse-veil {
  inset: 0;
  position: absolute;
  pointer-events: none;
  box-shadow: inset 0 0 10rem ember(0.22);
  animation: collapse-breath 2.8s var(--ease-smooth) infinite;
}

.veil-enter-active,
.veil-leave-active {
  transition: opacity var(--motion-slow) var(--ease-smooth);
}

.veil-enter-from,
.veil-leave-to {
  opacity: 0;
}

@keyframes collapse-breath {
  50% {
    box-shadow: inset 0 0 14rem ember(0.34);
  }
}

footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
