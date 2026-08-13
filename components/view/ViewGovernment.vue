<template>
  <section class="challenge-shell government">
    <ChallengePrompt :attributions="promptSources">
      <h1 class="map-caption">{{ heading }}</h1>
      <span v-if="!finished" class="map-caption sub">{{ prompt }}</span>
    </ChallengePrompt>

    <p v-if="challenge && !finished && beat !== 'party'" class="chamber-facts">
      <span class="fact"
        ><strong>{{ challenge.totalSeats }}</strong> seats</span
      >
      <span class="fact"
        ><strong>{{ majority }}</strong> for a majority</span
      >
      <span class="fact"
        ><strong>{{ challenge.benches.length }}</strong> parties seated</span
      >
    </p>

    <!-- Said plainly, not only washed: beat 3 has no cards to tint, and a
         wash alone never tells a player WHAT the answer was.
         The band is always in the layout and only its contents fade, so the
         question below never jumps when a verdict arrives or leaves. -->
    <div v-if="!finished" class="verdict-band">
      <!-- The banner is absolutely positioned over a ghost copy of itself, so
           the band is exactly as tall as the verdict WILL be — including when
           a long bench name wraps to three lines on a phone. A fixed height
           cannot track wrapping text, and reserving one line's worth put the
           shift straight back. -->
      <p class="beat-verdict ghost" aria-hidden="true">
        <span class="verdict-mark">✓</span>
        <span class="verdict-line">{{ placeholderLine }}</span>
      </p>
      <Transition name="verdict">
        <p
          v-if="verdict"
          class="beat-verdict live"
          :class="myScore > 0 ? 'right' : 'wrong'"
          aria-live="polite"
        >
          <span class="verdict-mark">{{ myScore > 0 ? '✓' : '✗' }}</span>
          <span class="verdict-line">{{ verdictLine }}</span>
          <span v-if="myScore > 0" class="verdict-points">+{{ myScore }}</span>
        </p>
      </Transition>
    </div>

    <!-- Beat 1: the logos rise, one governs. -->
    <Transition name="beat" mode="out-in">
      <GovernmentReveal
        v-if="finished && challenge && answers"
        key="reveal"
        :challenge="challenge"
        :answers="answers"
        :players="gameStore.game?.players ?? {}"
        :player-id="gameStore.seatId"
        :scores="revealScores"
        :group-answers="revealAnswers"
      />

      <div v-else-if="beat === 'party'" key="party" class="card-options logos">
        <button
          v-for="(option, index) in challenge?.options ?? []"
          :key="option.name"
          type="button"
          class="card-option logo-option"
          :class="[
            optionVerdict(option.name),
            {
              chosen: myParty === option.name,
              dimmed: !verdict && !!myParty && myParty !== option.name,
            },
          ]"
          :disabled="!!myParty || !!verdict"
          :style="{ '--rise-delay': `${index * 70}ms` }"
          @click="pickParty(option.name)"
        >
          <img v-if="option.logo" class="option-logo" :src="option.logo" alt="" />
          <span v-else class="option-swatch" :style="{ background: option.color }" />
          <span class="option-name">{{ option.name }}</span>
        </button>
      </div>

      <!-- Beat 2: the chamber sweeps in colourless; pick the block it holds. -->
      <div v-else-if="beat === 'seats'" key="seats" class="seats-beat">
        <!-- WHOSE seats. Beat 2 grades against the real government, so a
             player who picked wrong in beat 1 would otherwise be answering
             about a party nobody named — the prompt's "it" had no antecedent
             on screen at all. -->
        <header v-if="subject" class="beat-subject">
          <img v-if="subject.logo" class="subject-logo" :src="subject.logo" alt="" />
          <span v-else class="subject-swatch" :style="{ background: subject.color }" />
          <span class="subject-name">{{ subject.name }}</span>
        </header>
        <div class="arc">
          <span
            v-for="(seat, index) in arcSeats"
            :key="index"
            class="seat"
            :class="{ lit: seat.lit }"
            :style="{
              left: `${seat.x}%`,
              top: `${seat.y}%`,
              '--sweep-delay': `${index * 4}ms`,
            }"
          />
        </div>
        <div class="card-options blocks">
          <button
            v-for="block in challenge?.blocks ?? []"
            :key="block"
            type="button"
            class="card-option block-option"
            :class="[
              blockVerdict(block),
              {
                chosen: mySeats === block,
                dimmed: !verdict && mySeats !== undefined && mySeats !== block,
              },
            ]"
            :disabled="mySeats !== undefined || !!verdict"
            @click="pickSeats(block)"
          >
            <strong>{{ block }}</strong>
            <span class="block-share">{{ shareLabels[block] }}</span>
          </button>
        </div>
      </div>

      <!-- Beat 3: sort the rest — with the government, or against it. -->
      <div v-else key="sides" class="sides-beat">
        <header v-if="subject" class="beat-subject">
          <img v-if="subject.logo" class="subject-logo" :src="subject.logo" alt="" />
          <span v-else class="subject-swatch" :style="{ background: subject.color }" />
          <span class="subject-name">{{ subject.name }} governs</span>
        </header>
        <p class="sides-lede">
          Sort the rest of the house: is each bench with the government, or against it?
        </p>
        <div class="bench-rows">
          <div
            v-for="(name, index) in challenge?.sorted ?? []"
            :key="name"
            class="bench-row"
            :style="{ '--row-delay': `${index * 60}ms` }"
          >
            <span class="bench-name">
              <img v-if="logoFor(name)" class="bench-logo" :src="logoFor(name)" alt="" />
              <span v-else class="bench-swatch" :style="{ background: colorFor(name) }" />
              {{ name }}
              <em class="bench-seats">{{ seatsFor(name) }}</em>
            </span>
            <!-- A rocker, not two buttons: one control with two ends, so the
                 choice reads as a position rather than a pair of taps. -->
            <span
              class="rocker"
              :class="{ picked: !!mySides[name], locked: sidesLocked }"
              role="radiogroup"
              :aria-label="`${name}: with or against the government`"
            >
              <span class="rocker-thumb" :class="mySides[name] ?? 'unset'" aria-hidden="true" />
              <button
                type="button"
                role="radio"
                class="rocker-end"
                :class="{ chosen: mySides[name] === 'government' }"
                :aria-checked="mySides[name] === 'government'"
                :disabled="sidesLocked"
                @click="fileBench(name, 'government')"
              >
                With
              </button>
              <button
                type="button"
                role="radio"
                class="rocker-end"
                :class="{ chosen: mySides[name] === 'opposition' }"
                :aria-checked="mySides[name] === 'opposition'"
                :disabled="sidesLocked"
                @click="fileBench(name, 'opposition')"
              >
                Against
              </button>
            </span>
          </div>
        </div>
        <footer class="shell-footer sides-footer">
          <!-- The label shrinks from "Lock it in (0/4)" to "Locked in", and on
               a phone the shell re-centres its column — so a button free to
               resize walked the whole round up the screen. It keeps the wider
               label's width for both states. -->
          <div class="lock-row">
            <ButtonFilled class="lock-button" :disabled="sidesLocked || !allFiled" @click="submitSides">
              {{ sidesLocked ? 'Locked in' : `Lock it in${filedCount}` }}
            </ButtonFilled>
          </div>
        </footer>
      </div>
    </Transition>

    <ChallengeTimerRadial
      v-if="!finished"
      class="footer-clock"
      :value="secondsOnClock"
      :total="BEAT_SECONDS[beat]"
    />
  </section>
</template>

<script setup lang="ts">
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import GovernmentReveal from '~/components/challenge/GovernmentReveal.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
import { BEAT_SECONDS, MAX_SEAT_DOTS } from '~~/lib/government'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { GovernmentState } from '~~/types/challenges/group-modes.type'

/**
 * The Government round: three questions about one chamber, each with its own
 * visualisation.
 *
 * The view DRIVES NOTHING. It renders `challenge.state`, sends intent with the
 * `turn` it answered against, and repaints the deadline through
 * `useDeadlineClock`. The server's beat flip is what ends a beat — a local
 * timer here would eventually disagree with the grade.
 */

const { challenge, gameStore, update } = useGroupChallenge('government-challenge')

// Timers keep evaluating for a beat after the round advances, so the state
// must never dereference undefined.
const EMPTY_STATE: GovernmentState = {
  beat: 'party',
  turn: 0,
  deadline: 0,
  picks: { party: {}, seats: {}, sides: {} },
  scores: {},
}
const state = computed(() => challenge.value?.state ?? EMPTY_STATE)
const beat = computed(() => state.value.beat)
const finished = computed(() => !!state.value.finished)

const { secondsOnClock } = useDeadlineClock(() => state.value.deadline)

const seatId = computed(() => gameStore.seatId)
const myParty = computed(() => state.value.picks.party[seatId.value])
const mySeats = computed(() => state.value.picks.seats[seatId.value])
const sidesLocked = computed(() => state.value.picks.sides[seatId.value] !== undefined)

/** The only local state: beat 3's in-flight sort, cleared when the beat turns. */
const mySides = ref<Record<string, 'government' | 'opposition'>>({})
watch(
  () => state.value.turn,
  () => {
    mySides.value = {}
  }
)

const allFiled = computed(() =>
  (challenge.value?.sorted ?? []).every(name => mySides.value[name] !== undefined)
)

/** " (2/4)" until the row is complete — what is left to do, not a scold. */
const filedCount = computed(() => {
  const total = challenge.value?.sorted.length ?? 0
  const filed = Object.keys(mySides.value).length
  return !total || filed >= total ? '' : ` (${filed}/${total})`
})

const send = (pick: { party?: string; seats?: number; sides?: typeof mySides.value }) =>
  update({ event: 'submit-government-pick', turn: state.value.turn, pick })

const pickParty = (name: string) => {
  if (myParty.value) return
  void send({ party: name })
}
const pickSeats = (block: number) => {
  if (mySeats.value !== undefined) return
  void send({ seats: block })
}
const fileBench = (name: string, side: 'government' | 'opposition') => {
  if (sidesLocked.value) return
  mySides.value = { ...mySides.value, [name]: side }
}
const submitSides = () => {
  if (sidesLocked.value || !allFiled.value) return
  void send({ sides: mySides.value })
}

/**
 * The party beats 2 and 3 are about — named on screen from beat 2 on.
 *
 * It is the real government, which beat 1 was asking a player to identify. The
 * round moves on whether they got it right or not, so naming it here is the
 * answer to beat 1 as well: withholding it would leave the later beats asking
 * about a party the player may have guessed wrong and can no longer see.
 */
/**
 * The beat just graded, held on screen before the next question.
 *
 * Every wash below reads from it: the card the player chose wears its verdict,
 * and the right answer lights up whether or not they found it. The server owns
 * the hold — a view timer would eventually disagree with the grade.
 */
const verdict = computed(() => state.value.verdict)
const myScore = computed(() => verdict.value?.scored[seatId.value] ?? 0)

/** Beat 1's cards: what you picked, and what governed. */
const optionVerdict = (name: string) => {
  if (verdict.value?.beat !== 'party') return undefined
  if (name === verdict.value.truth) return 'was-truth'
  return name === myParty.value ? 'was-wrong' : undefined
}

/** Beat 2's blocks, the same. */
const blockVerdict = (block: number) => {
  if (verdict.value?.beat !== 'seats') return undefined
  if (`${block}` === verdict.value.truth) return 'was-truth'
  return block === mySeats.value ? 'was-wrong' : undefined
}

/** What the verdict says, in one line a player can read in the hold. */
const verdictLine = computed(() => {
  const current = verdict.value
  if (!current) return ''
  const right = myScore.value > 0
  if (current.beat === 'party') {
    return right ? `${current.truth} governs` : `It was ${current.truth}`
  }
  if (current.beat === 'seats') {
    return right ? `${current.truth} seats` : `They hold ${current.truth} seats`
  }
  // Beat 3 is per-bench, so "right" is a partial score rather than a verdict.
  const backers = current.truth === 'nobody' ? 'nobody else' : current.truth
  return right ? `With the government: ${backers}` : `The government's own side: ${backers}`
})

/**
 * The widest verdict this round could print, for the band's invisible ghost.
 * Built from the round's OWN parties rather than a lorem string: the phrasing
 * that wraps is a long bench name ("Swedish Social Democratic Party"), so a
 * generic placeholder would reserve the wrong number of lines on a phone.
 */
const placeholderLine = computed(() => {
  const longest = [...(challenge.value?.sorted ?? []), ...(challenge.value?.options ?? []).map(o => o.name)]
    .sort((a, b) => b.length - a.length)[0]
  return `The government's own side: ${longest ?? 'the opposition benches'}`
})

const subject = computed(() => {
  const name = state.value.subject ?? answers.value?.governingParty
  if (!name) return undefined
  return challenge.value?.options.find(option => option.name === name)
})

const majority = computed(() => Math.floor((challenge.value?.totalSeats ?? 0) / 2) + 1)

/** The answers only exist once the server has spent them onto the state. */
const answers = computed(() => state.value.answers)

/** The settled round, which is where the per-beat breakdown lands. */
const settledRound = computed(() => {
  const rounds = gameStore.game?.rounds ?? []
  return rounds[rounds.length - 1]
})
const revealScores = computed(() =>
  Object.fromEntries(
    Object.entries(settledRound.value?.playerTurns ?? {}).map(([playerId, turn]) => [
      playerId,
      turn.points,
    ])
  )
)
const revealAnswers = computed(() => settledRound.value?.groupAnswers ?? {})

const benchOf = (name: string) => challenge.value?.benches.find(bench => bench.name === name)
const logoFor = (name: string) => benchOf(name)?.logo
const colorFor = (name: string) => benchOf(name)?.color ?? 'currentColor'
const seatsFor = (name: string) => `${benchOf(name)?.seats ?? 0}`

/**
 * The block as a share of the house. Two blocks a few seats apart round to the
 * same whole percent in a big chamber — and two options reading "19%" makes
 * the pair look like a bug or a trick. Where that happens the labels gain a
 * decimal, so every option on screen is visibly its own number.
 */
const shareLabels = computed<Record<number, string>>(() => {
  const total = challenge.value?.totalSeats ?? 0
  const blocks = challenge.value?.blocks ?? []
  if (!total) return {}
  const whole = blocks.map(block => Math.round((block / total) * 100))
  const collides = new Set(whole).size < whole.length
  return Object.fromEntries(
    blocks.map(block => [
      block,
      `${((block / total) * 100).toFixed(collides ? 1 : 0)}% of the house`,
    ])
  )
})

/**
 * Beat 2's arc, drawn COLOURLESS — the shape of the chamber without the
 * answer painted onto it. Seats are scaled the same way Parliament's are, so
 * a 630-seat Bundestag and a 60-seat chamber draw at one size.
 */
const arcSeats = computed(() => {
  const total = challenge.value?.totalSeats ?? 0
  if (!total) return []
  const dots = Math.min(MAX_SEAT_DOTS, total)
  return hemicycleSeats(dots).map(seat => ({ ...seat, lit: false }))
})

const heading = computed(() => {
  const country = challenge.value?.country
  if (!country) return 'The chamber'
  const chamber = challenge.value?.chamber
  return chamber
    ? `${countryName(country)} — the ${chamber}`
    : `The ${countryName(country)} chamber`
})

const prompt = computed(() => {
  if (beat.value === 'party') return 'Which party governs?'
  if (beat.value === 'seats')
    return subject.value
      ? `How many seats does ${subject.value.name} hold?`
      : 'How many seats does it hold?'
  return subject.value
    ? `Who else is with ${subject.value.name}?`
    : 'Who else is with the government?'
})

const promptSources = computed(() => datasetAttribution('elections'))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;

/**
 * NOTE ON SCALE: `_reset.scss` puts the document on a 62.5% root, so 1rem is
 * 10px and the house writes 1.6rem where it means 16px. The lengths in this
 * file were authored against a 16px rem, which is why the round rendered small
 * — 0.82rem rocker labels came out as 8px type, with the touch targets to
 * match. The controls a player actually hits are restated in px below; the
 * rest is left alone rather than rewritten wholesale.
 */

/**
 * Whose party the beat is about. Sized like a subject, not a caption — it is
 * the thing the question refers to, and the prompt says "it".
 */
.beat-subject {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: fit-content;
  min-width: min(70vw, 15rem);
  margin: 0 auto 0.35rem;
  padding: 0.45rem 1.1rem;
  border: 1px solid ink(0.14);
  border-radius: 999px;
  background: milk(0.72);
  pointer-events: auto;
}

.subject-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.subject-swatch {
  width: 1.1rem;
  aspect-ratio: 1;
  border-radius: 50%;
}

.subject-name {
  font-size: 19px;
  font-weight: 600;
}

/**
 * The beat's verdict, held between questions. Loud on purpose — this is the
 * only moment a player learns whether they were right before the reveal.
 */
// The band holds the verdict's room whether or not one is showing. Letting the
// banner enter the flow shoved the whole question down mid-round, which reads
// as the layout breaking rather than as an answer arriving.
.verdict-band {
  position: relative;
  display: grid;
  place-items: center;
  margin: 6px 0 0;
}

.beat-verdict {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: min(94vw, 34rem);
  margin: 0;
  padding: 11px 19px;
  border-radius: 999px;
  font-size: 18px;
  pointer-events: auto;

  &.right {
    border: 1px solid hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.16);
  }

  &.wrong {
    border: 1px solid var(--hior-ange);
    background: flame(0.16);
  }

  // The ghost holds the room; the live banner floats over it.
  &.ghost {
    visibility: hidden;
    border: 1px solid transparent;
  }

  &.live {
    position: absolute;
    inset: 0;
  }
}

.verdict-mark {
  font-size: 22px;
  line-height: 1;
}

.verdict-points {
  font-weight: 600;
}

// The verdict drops in and settles rather than cross-fading: it is the one
// moment the round answers back, and it has to read as an arrival. The mark
// and the points land a beat later than the banner, so the eye reaches the
// sentence before the score.
.verdict-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);

  .verdict-mark,
  .verdict-points {
    animation: chip-in var(--motion-base) var(--ease-out-expressive) 120ms backwards;
  }
}

.verdict-leave-active {
  transition:
    opacity var(--motion-quick) linear,
    transform var(--motion-quick) var(--ease-smooth);
}

.verdict-enter-from {
  opacity: 0;
  transform: translateY(-0.7rem) scale(0.96);
}

.verdict-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .verdict-enter-active,
  .verdict-leave-active {
    transition-duration: 1ms;

    .verdict-mark,
    .verdict-points {
      animation: none;
    }
  }
}

.chamber-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  width: min(94vw, 34rem);
  margin: 0.35rem auto 0.9rem;
  padding: 0;
  pointer-events: auto;

  // The seat maths IS the round's subject from beat 2 on, so it gets card
  // weight rather than a caption's. It stays off beat 1, where a player has
  // nothing to relate the numbers to yet.
  .fact {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05rem;
    flex: 1 1 6rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid ink(0.12);
    border-radius: 0.6rem;
    background: milk(0.55);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    text-transform: lowercase;
    opacity: 0.9;

    strong {
      font-size: 1.35rem;
      line-height: 1.05;
      letter-spacing: -0.01em;
    }
  }
}

.beat-enter-active,
.beat-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.beat-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.beat-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.logos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.75rem;
  width: min(100%, 44rem);
  margin-inline: auto;
  pointer-events: auto;

  .logo-option {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    animation: rise 320ms both;
    animation-delay: var(--rise-delay);

    &.dimmed {
      opacity: 0.4;
    }
  }

  .option-logo {
    width: clamp(3rem, 12vw, 5.5rem);
    height: clamp(3rem, 12vw, 5.5rem);
    object-fit: contain;
  }

  .option-swatch {
    width: clamp(3rem, 12vw, 5.5rem);
    aspect-ratio: 1;
    border-radius: 50%;
  }

  .option-name {
    font-size: 0.8rem;
    text-align: center;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}

.arc {
  position: relative;
  width: min(100%, 46rem);
  margin-inline: auto;
  aspect-ratio: 2 / 1;

  .seat {
    position: absolute;
    width: 1.6%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: ink(0.28);
    transform: translate(-50%, -50%);
    animation: seat-in 260ms both;
    animation-delay: var(--sweep-delay);
  }
}

@keyframes seat-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
}

.blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.6rem;
  width: min(100%, 40rem);
  margin-inline: auto;
  pointer-events: auto;

  .block-option {
    display: grid;
    gap: 0.15rem;

    &.dimmed {
      opacity: 0.4;
    }
  }

  .block-share {
    font-size: 0.75rem;
    opacity: 0.65;
  }
}

.sides-lede {
  width: min(92vw, 36rem);
  margin-inline: auto;
  margin-block: 4px 16px;
  font-size: 15px;
  text-align: center;
  opacity: 0.75;
}

.bench-rows {
  display: grid;
  gap: 0.55rem;
  width: min(94vw, 38rem);
  margin-inline: auto;
  pointer-events: auto;
}

.bench-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem;
  background: milk(0.7);
  // The house arrives bench by bench rather than all at once — the same
  // staggered landing the reveal's rows use.
  animation: row-land var(--motion-base) var(--ease-out-expressive) var(--row-delay, 0ms) backwards;

  // On a phone the name and a full-size rocker cannot share a line without
  // squeezing one of them. The rocker takes its own row and spans the width,
  // which makes both ends bigger targets rather than smaller ones.
  @media (max-width: $phone) {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;

    .rocker {
      width: 100%;
    }

    .rocker-end {
      min-width: 0;
    }
  }
}

.bench-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 15px;
}

.bench-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex: none;
}

.bench-swatch {
  width: 1rem;
  aspect-ratio: 1;
  border-radius: 50%;
}

.bench-seats {
  font-style: normal;
  opacity: 0.6;
}

/**
 * The for/against rocker: ONE control with two ends and a thumb that slides
 * between them, so a bench's allegiance reads as a position rather than as two
 * unrelated taps. Ends are full-height and generously padded — these were
 * 0.3rem pills, which is under the comfortable touch target on a phone.
 */
.rocker {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: none;
  padding: 0.2rem;
  border: 1px solid ink(0.16);
  border-radius: 999px;
  background: milk(0.7);

  &.locked {
    opacity: 0.75;
  }
}

.rocker-thumb {
  position: absolute;
  // The thumb sits UNDER the ends and takes no pointer events — an absolutely
  // positioned sibling drawn after them would otherwise swallow every tap.
  pointer-events: none;
  inset: 0.15rem 50% 0.15rem 0.15rem;
  border-radius: 999px;
  background: ink(0.88);
  opacity: 0;
  transition:
    transform var(--motion-base) var(--ease-out-expressive),
    opacity var(--motion-quick) linear;

  &.government {
    opacity: 1;
    transform: translateX(0);
  }

  &.opposition {
    opacity: 1;
    // Its own width, so the travel is exact at any rocker size.
    transform: translateX(100%);
  }
}

// 44px is the floor for a comfortable touch target, and these ends were well
// under it — a phone tap kept landing between them.
.rocker-end {
  position: relative;
  z-index: 1;
  min-width: 86px;
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: color var(--motion-quick) linear;

  &.chosen {
    color: milk();
  }

  // The press itself answers, before the thumb finishes travelling.
  &:not(:disabled):active {
    transform: scale(0.95);
  }

  &:disabled {
    cursor: default;
  }
}

.sides-footer {
  display: flex;
  justify-content: center;
  pointer-events: auto;
}

// Wide enough for "Lock it in (0/4)", so locking in never resizes it.
.lock-button {
  min-width: 152px;
}
</style>
