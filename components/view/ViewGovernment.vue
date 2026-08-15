<template>
  <section class="challenge-shell government">
    <ChallengePrompt :attributions="promptSources">
      <h1 class="map-caption">{{ heading }}</h1>
      <span v-if="!finished" class="map-caption sub">{{ prompt }}</span>
    </ChallengePrompt>

    <!-- Beat 3 stows them on a phone: the seat maths is beat 2's subject, and
         by the roll it is background the round no longer asks about — while
         the roll itself is the tallest thing the round puts on a phone. -->
    <p
      v-if="challenge && !finished && beat !== 'party'"
      class="chamber-facts"
      :class="{ stowed: beat === 'sides' }"
    >
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
    <!-- A FIXED verdict: one word, one mark, one score, on a pill whose height
         never depends on how a party is named. The banner used to print the
         answer as a sentence, which meant a long bench name wrapped to two or
         three lines on a phone — so the band had to reserve its room from a
         ghost copy, and any drift between the two landed the verdict on the
         chip below. A constant-size indicator retires that whole mechanism:
         nothing to measure, nothing to keep in sync, and the beat below never
         moves. What the answer WAS is the reveal's job, and the subject chip
         under this already names the governing party. -->
    <div v-if="!finished" class="verdict-band">
      <Transition name="verdict">
        <p
          v-if="verdict"
          class="beat-verdict"
          :class="myScore > 0 ? 'right' : 'wrong'"
          aria-live="polite"
        >
          <span class="verdict-mark">{{ myScore > 0 ? '✓' : '✗' }}</span>
          <span class="verdict-word">{{ myScore > 0 ? 'Correct' : 'Not quite' }}</span>
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
        <div class="arc" :class="verdict ? (myScore > 0 ? 'right' : 'wrong') : undefined">
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
            @mouseenter="hoveredBlock = block"
            @mouseleave="hoveredBlock = undefined"
            @focus="hoveredBlock = block"
            @blur="hoveredBlock = undefined"
          >
            <strong>{{ block }}</strong>
            <span class="block-share">{{ shareLabels[block] }}</span>
            <span v-if="clearsMajority(block)" class="block-majority">carries the house</span>
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
        <!-- The reveal's panel: a hairline-ruled head over the list, so the
             benches read as a chamber's roll rather than as loose rows on
             bare cream. -->
        <div class="sides-panel">
          <header class="panel-head">
            <span class="eyebrow">The rest of the house</span>
          </header>
          <p class="sides-lede">With the government, or against it?</p>
          <!-- The roll is the round's one scroller on a phone, so it says so:
               the shared scroll-fade mists whichever edge still has benches
               past it (rules/_scroll-fade.scss). -->
          <div
            ref="benchRows"
            class="bench-rows"
            :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
            @scroll.passive="syncScrollEdges"
          >
            <div
              v-for="(name, index) in challenge?.sorted ?? []"
              :key="name"
              class="bench-row"
              :style="{ '--row-delay': `${index * 60}ms` }"
            >
              <span class="bench-name">
                <img v-if="logoFor(name)" class="bench-logo" :src="logoFor(name)" alt="" />
                <span v-else class="bench-swatch" :style="{ background: colorFor(name) }" />
                <span class="bench-label">{{ name }}</span>
              </span>
              <!-- Its own column, not trailing the name: under `space-between`
                   every seat count landed wherever its party's name happened to
                   end, so the numbers never read as a comparable set. -->
              <span class="bench-seats">{{ seatsFor(name) }}</span>
              <!-- The house segmented control, not a second hand-rolled copy of
                   it: one track, two bare-text segments and one solid thumb, so
                   a bench's allegiance reads as a POSITION rather than a pair of
                   taps. An unfiled bench leaves the thumb hidden, which is what
                   the "(2/4)" counter on the lock button is counting. -->
              <SegmentedControl
                class="bench-sides"
                :name="`side-${name}`"
                :options="SIDE_OPTIONS"
                :option-labels="SIDE_LABELS"
                :model-value="mySides[name] ?? ''"
                :label="`${name}: with or against the government`"
                :disabled="sidesLocked"
                @update:model-value="side => fileBench(name, side as BenchSide)"
              />
            </div>
          </div>
        </div>
        <footer class="shell-footer sides-footer">
          <!-- The label shrinks from "Lock it in (0/4)" to "Locked in", and on
               a phone the shell re-centres its column — so a button free to
               resize walked the whole round up the screen. It keeps the wider
               label's width for both states.
               The clock is DOCKED here rather than left to the shell's floating
               dial: as a bare last child of the column it took a band of its
               own below this footer, and the two overlapped on a phone. -->
          <div class="lock-row">
            <ButtonFilled
              class="lock-button"
              :disabled="sidesLocked || !allFiled"
              @click="submitSides"
            >
              {{ sidesLocked ? 'Locked in' : `Lock it in${filedCount}` }}
            </ButtonFilled>
            <ChallengeTimerRadial
              class="lock-clock"
              :value="secondsOnClock"
              :total="BEAT_SECONDS[beat]"
            />
          </div>
        </footer>
      </div>
    </Transition>

    <!-- Beats 1 and 2 carry no controls, but the dial still stands in the
         shell's FOOTER band rather than floating: as a bare last child of the
         column it was `position: static` with no berth of its own, so it
         landed hard in the bottom-left corner, under the home indicator, and
         jumped to beat 3's lock row at the next beat. In the footer it is
         centred, inherits `--bottom-clearance`, and sits where beat 3's dial
         sits — one place for the clock all round. -->
    <footer v-if="!finished && beat !== 'sides'" class="clock-footer">
      <ChallengeTimerRadial
        class="footer-clock"
        :value="secondsOnClock"
        :total="BEAT_SECONDS[beat]"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import GovernmentReveal from '~/components/challenge/GovernmentReveal.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import SegmentedControl from '~/components/input/SegmentedControl.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
import { BEAT_SECONDS, MAX_SEAT_DOTS } from '~~/lib/government'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
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

/**
 * Which way a bench is filed — DERIVED from the wire type rather than spelled
 * again, so the view cannot drift from what the server grades.
 */
type BenchSide = GovernmentState['picks']['sides'][string][string]

/** The segments, in reading order. */
const SIDE_OPTIONS: BenchSide[] = ['government', 'opposition']

/**
 * What the player reads. The question is "is this bench with the government,
 * or against it?", so the segments answer THAT — "Government"/"Opposition"
 * would restate the subject instead of taking a side.
 */
const SIDE_LABELS: Record<BenchSide, string> = {
  government: 'With',
  opposition: 'Against',
}

/** The only local state: beat 3's in-flight sort, cleared when the beat turns. */
const mySides = ref<Record<string, BenchSide>>({})
watch(
  () => state.value.turn,
  () => {
    mySides.value = {}
  }
)

/**
 * Beat 3's roll scrolls on a phone — a nine-bench chamber cannot stand in one
 * screen beside the lock row. The edges drive the shared fades, so a chamber
 * short enough to fit never wears a dimmed row. The scroller is behind the
 * beat's `v-else`, so it only exists once the beat is dealt; `useScrollEdges`
 * picks it up when it appears.
 */
const benchRows = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => benchRows.value)

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
const fileBench = (name: string, side: BenchSide) => {
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
  // Whichever block the player is considering lights that share of the house.
  // The arc was drawn inert (`lit: false` for every seat), which made it a
  // decorative rainbow — the whole point of a hemicycle is that a number like
  // "92 of 349" is a SHAPE, and an unlit one teaches nothing.
  const showing = previewBlock.value
  const litDots = showing === undefined ? 0 : Math.round((showing / total) * dots)
  return hemicycleSeats(dots).map((seat, index) => ({ ...seat, lit: index < litDots }))
})

/**
 * The block the arc is previewing: what the player has picked, else what they
 * are pointing at, else the truth once the verdict is in.
 */
const hoveredBlock = ref<number | undefined>()
const previewBlock = computed(() => {
  if (verdict.value) return answers.value?.governingSeats
  return mySeats.value ?? hoveredBlock.value
})

/**
 * Whether a block would carry the house. Said alongside the share rather than
 * instead of it — `shareLabels` already disambiguates two blocks that round to
 * the same percent, and dropping it for "a majority" would put that collision
 * back.
 */
const clearsMajority = (block: number) => block >= majority.value

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

const promptSources = computed(() => datasetAttribution('parties'))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;
@use '~/assets/scss/rules/_scroll-fade.scss' as *;

/**
 * NOTE ON SCALE: `_reset.scss` puts the document on a 62.5% root, so 1rem is
 * 10px and the house writes 1.6rem where it means 16px.
 *
 * The rule in this file: lengths a player perceives as a SIZE — type, touch
 * targets, logo boxes, grid track minimums — are written in px, where the root
 * cannot make them lie. Lengths proportional to the type around them (a pill's
 * inline padding, a radius, an inline gap) stay in rem. Nothing here is
 * authored against a 16px rem: the values that were (7px stat labels, 8px
 * party names, a 70px option track) are fixed.
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
  margin: 0 auto 16px;
  padding: 0.45rem 1.1rem;
  border: 1px solid ink(0.2);
  border-radius: 999px;
  background: milk(0.85);
  pointer-events: auto;
}

.subject-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

// Stands in for a 42px logo, so it is sized like one — at 11px the chip
// visibly changed shape between parties with and without a mark.
.subject-swatch {
  width: 26px;
  aspect-ratio: 1;
  border-radius: 50%;
}

// Fluid for the same reason as `.bench-name`: beat 3 prints "<party> governs",
// and a long name at a fixed 19px wrapped the chip to two lines on a phone —
// which cost the roll below a row it does not have to give.
.subject-name {
  font-size: clamp(15px, 4.6vw, 19px);
  font-weight: 600;
}

/**
 * The beat's verdict, held between questions. Loud on purpose — this is the
 * only moment a player learns whether they were right before the reveal.
 */
// The band holds the verdict's room whether or not one is showing. Letting the
// banner enter the flow shoved the whole question down mid-round, which reads
// as the layout breaking rather than as an answer arriving.
//
// One CONSTANT row is all it needs now that the verdict is a fixed indicator:
// no ghost to measure, and the reservation cannot drift from the thing it
// reserves for. The generous block margins are the round's main breathing
// room on a phone, where the pill sat flush against the subject chip below.
.verdict-band {
  display: grid;
  place-items: center;
  width: 100%;
  height: 52px;
  margin-block: 18px 20px;

  // A phone has no room to hold an empty band for the whole beat: the reserve
  // plus its margins cost 90px that beat 3's roll needs. The band collapses
  // while nothing is showing and takes its room back the moment a verdict
  // arrives — the beat below is a scroller, so what moves is its scroll
  // height, not the question.
  @media (max-width: $phone) {
    height: auto;
    min-height: 0;
    // Still a clear band between the numbers and the beat while it is empty —
    // just not the 90px a full reserve costs.
    margin-block: 10px 12px;

    &:has(.beat-verdict) {
      margin-block: 12px 14px;
    }
  }
}

.beat-verdict {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  // Hugs its own short label rather than spanning the column: a fixed
  // indicator has nothing to wrap, so a full-width pill only made the word
  // float in the middle of an empty band.
  margin: 0;
  padding: 11px 22px;
  border-radius: 999px;
  font-size: 18px;
  white-space: nowrap;
  pointer-events: auto;

  &.right {
    border: 1px solid hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.16);
  }

  &.wrong {
    border: 1px solid var(--hior-ange);
    background: flame(0.16);
  }
}

// Both glyphs are spans, and `transform` does not apply to an inline box —
// without this the pop either did nothing or snapped. `flex: none` keeps them
// from nudging the word beside them as they scale.
.verdict-mark {
  display: inline-block;
  flex: none;
  font-size: 22px;
  line-height: 1;
}

.verdict-word {
  font-weight: 600;
  letter-spacing: 0.01em;
}

// Divided from the word by a rule rather than a gap: the score is a separate
// fact from the verdict, and at a plain gap the two read as one phrase.
.verdict-points {
  display: inline-block;
  flex: none;
  padding-left: 0.7rem;
  border-left: 1px solid ink(0.18);
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

  // `chip-in` was the wrong keyframe: it is written for absolutely-positioned
  // MAP chips and animates translate(-50%, -20%) → translate(-50%, -50%). On
  // an inline flex child that -50% drags the glyph half its own width sideways
  // and drops it into place — the "janking into frame" this had.
  // Shorter than the banner's own entrance and started at once, so the glyphs
  // have SETTLED by the time the card stops moving. Running them for the full
  // --motion-base behind a 100ms delay meant they were still growing after the
  // banner had landed, which reads as a second, late animation rather than one
  // arrival.
  .verdict-mark,
  .verdict-points {
    animation: verdict-pop var(--motion-quick) var(--ease-out-expressive) backwards;
  }
}

// Scale only, from the element's own centre — no translation to fight the
// banner's transform or the flex line the glyph sits on.
@keyframes verdict-pop {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
  65% {
    transform: scale(1.06);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.verdict-leave-active {
  transition:
    opacity var(--motion-quick) linear,
    transform var(--motion-quick) var(--ease-smooth);
}

// The banner only SLIDES. It used to scale as well, which compounded with the
// glyphs' own pop — a child scaling inside a scaling parent is what made the
// tick and the score look like they were fighting their way into frame.
.verdict-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.verdict-leave-to {
  opacity: 0;
  transform: translateY(-4px);
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

// A grid, not a wrapping flex line: under `flex: 1 1 110px` a row that broke
// to two lines stretched the orphan tile to the full width, so "6 parties
// seated" read as a banner rather than as the third of three numbers. Even
// tracks reflow 3 → 2 → 1 and every tile keeps its share.
.chamber-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 0.5rem;
  justify-content: center;
  width: min(94vw, 34rem);
  // No bottom margin: the verdict band below holds its own room whether or not
  // a verdict is showing, and stacking a margin on that reservation opened a
  // visible gutter between the numbers and the beat on every quiet beat.
  margin: 0.35rem auto 0;
  padding: 0;
  pointer-events: auto;

  // The seat maths IS the round's subject from beat 2 on, so it gets card
  // weight rather than a caption's. It stays off beat 1, where a player has
  // nothing to relate the numbers to yet.
  .fact {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid ink(0.2);
    border-radius: 12px;
    background: milk(0.85);
    // NOT `.eyebrow`: that label is bold --soft-blue with 0.14em tracking and a
    // bottom margin, all wrong under a numeral it must not compete with.
    font-size: 12px;
    letter-spacing: 0.02em;
    text-transform: lowercase;
    opacity: 0.9;

    strong {
      font-size: 26px;
      line-height: 1.05;
      letter-spacing: -0.01em;
    }
  }

  // Stowed for beat 3 on a phone: the tiles cost ~76px of a screen that has to
  // hold the subject chip, a scrolling roll of benches and the lock row. The
  // numbers are beat 2's material — by the roll they are trivia, and the
  // question on screen is about allegiance, not arithmetic. Tablets up keep
  // them: there the column has the room and the majority line still reads as
  // context for who can carry the house.
  &.stowed {
    @media (max-width: $phone) {
      display: none;
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

// The shell is `justify-content: space-between`, so its slack falls BETWEEN
// children — which stranded ~200px of cream above every beat's content. Each
// beat grows to absorb it and centres its own parts inside, so the round sits
// under the facts rather than adrift below them.
//
// All three carry it, not just the hemicycle: with only one beat growing, the
// `<Transition mode="out-in">` swap changed the column's shape mid-round.
// This is a per-beat patch for a shell-level `space-between` behaviour — the
// principled fix is in `.challenge-shell`, which serves 22 views and is not
// worth reshaping for one round.
//
// NOT solved by making these `<section>`s to catch the shell's own
// `flex: 1 1 auto`: that also opts them into its `overflow: hidden`, which
// would clip beat 3 on a short viewport instead of letting it scroll.
//
// Stands BEFORE the per-beat blocks so each can override the shared gap.
//
// `safe center`, not bare `center`: when the content is TALLER than the beat
// (beat 3 on a phone), centring overflow pushes the first row off the top —
// which put the subject chip above its own container, back under the verdict.
// The safe keyword falls back to start-alignment in exactly that case.
.logos,
.seats-beat,
.sides-beat {
  display: grid;
  flex: 1;
  gap: 6px;
  align-content: safe center;
  min-height: 0;
}

// Beats 1 and 2 have no scroller of their own, and the shell is a fixed-height
// column — a seven-party table on a phone, or the arc over four blocks on a
// short one, simply ran off the bottom edge with no way to reach it. They
// scroll only when they actually overflow, so a beat that fits still centres.
// Beat 3 is excluded on purpose: it scrolls its ROLL (`.bench-rows`) so the
// subject chip and the lock row stay put.
.logos,
.seats-beat {
  overflow-y: auto;
  overscroll-behavior: contain;
}

// Chip, panel, footer — and the PANEL is the one that both GROWS and gives
// way, so the subject stays put and the lock row never leaves the screen.
// `1fr` rather than `auto`: as `auto` the panel took only its content's height
// and the beat's `align-content: center` banked the leftover room above the
// chip, so the roll scrolled inside a short panel under a band of empty cream.
.sides-beat {
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: stretch;
}

// The chamber deals 3–7 of these (PARTY_OPTIONS raises a CEILING and the
// chamber decides — the Netherlands and Denmark deal six). Tracks are sized
// for the card rather than left to auto-fit at a 70px minimum, which is what
// made a row of thumbnails; the 150px/720px pair matches `.blocks` and `.arc`
// so all three beats present at one width.
// A grid, like every other option table in the house — the stretch is what
// makes cards equal, and a wrapping flex line forfeits it (a one-line
// "Liberals" then stood shorter than a three-line party name). `justify-content:
// center` balances a short last row, which is how the other variable-count
// grids avoid an orphan tile.
.logos {
  // `auto-fit` cannot centre a short last row — the empty tracks still hold
  // their width, so five parties sat left of centre. `auto-flow: column` lays
  // the whole table on ONE line and lets the tracks share the width, which is
  // right for a set this small (3–7): every logo stays on one baseline and the
  // row is centred by construction. Below the tablet the flow returns to rows.
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 150px);
  justify-content: center;
  gap: 14px;
  width: min(100%, 720px);
  margin-inline: auto;
  padding-inline: 16px;
  pointer-events: auto;

  // Too many for one line on a narrow screen: back to rows, at a fixed column
  // count so the tracks are equal. Rows size to their CONTENT — `1fr` rows
  // levelled every row against the tallest two-line name in the table, which
  // left a band of dead cream under every single-line card. Cards still match
  // their own row (grid stretch), which is the equality that reads.
  @media (max-width: $tablet) {
    grid-auto-flow: row;
    grid-template-columns: repeat(3, minmax(0, 1fr));

    // The label row stops absorbing slack here: with rows sized to content
    // there is none to absorb, and the 1fr row only pushed the name away from
    // its logo.
    .logo-option {
      grid-template-rows: auto auto;
      align-content: start;
      padding: 0.8rem 0.6rem;
    }
  }

  @media (max-width: $phone) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .logo-option {
    display: grid;
    // Media fixed, label takes the slack: the logo row is its own height and
    // the name row fills whatever the tallest card in the line needs, so every
    // logo in a row sits on one line.
    grid-template-rows: auto 1fr;
    gap: 0.5rem;
    justify-items: center;
    animation: rise 320ms both;
    animation-delay: var(--rise-delay);
    transition:
      transform var(--motion-quick) var(--ease-out-expressive),
      border-color var(--motion-quick) var(--ease-out-expressive),
      background var(--motion-quick) var(--ease-out-expressive),
      box-shadow var(--motion-quick) var(--ease-out-expressive);

    // The shared card hover lifts by `translateY`, which the `rise` entrance
    // also drives — the two fought and the card twitched. A brightening face
    // and a soft shadow say "pressable" without touching transform.
    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: milk();
        box-shadow: 0 0.3rem 1rem ink(0.16);
      }
    }

    &.dimmed {
      opacity: 0.4;
    }
  }

  .option-logo {
    width: clamp(56px, 14vw, 88px);
    height: clamp(56px, 14vw, 88px);
    object-fit: contain;
  }

  .option-swatch {
    width: clamp(56px, 14vw, 88px);
    aspect-ratio: 1;
    border-radius: 50%;
  }

  // Two lines is the house ceiling for a party name (same clamp as
  // `.bench-label`), and centring it in the 1fr row keeps short and long names
  // sitting on one baseline across the table.
  .option-name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    align-self: center;
    font-size: 14px;
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
  // The hemicycle is beat 2's subject, so it gets the room (px, not rem — the
  // 62.5% root makes 54rem read as 540px).
  width: min(100%, 720px);
  margin-inline: auto;
  aspect-ratio: 2 / 1;

  // On a phone a 2:1 box at full width is half the screen, and the blocks
  // under it fell off the bottom edge. Sized from whichever bites first there
  // — the column's width or the room the viewport's HEIGHT can spare — so the
  // chamber keeps its shape and gives ground instead of pushing the answer
  // out of view. A tall phone barely notices; a 667px one gets 40px back.
  @media (max-width: $phone) {
    width: min(100%, 44vh);
  }

  .seat {
    position: absolute;
    width: 1.8%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: ink(0.22);
    transform: translate(-50%, -50%);
    animation: seat-in 260ms both;
    animation-delay: var(--sweep-delay);
    // Seats light in place as the preview changes, so moving between blocks
    // reads as the bench growing rather than the arc redrawing.
    transition:
      background var(--motion-quick) var(--ease-smooth),
      box-shadow var(--motion-quick) var(--ease-smooth);
  }

  .seat.lit {
    background: var(--seat-lit, #{ink(0.88)});
    box-shadow: 0 0 6px var(--seat-glow, transparent);
  }

  // Once the answer is in, the lit block wears its verdict.
  &.right .seat.lit {
    --seat-lit: #{hsl(170.5, 34.7%, 38%)};
    --seat-glow: #{hsla(170.5, 34.7%, 45%, 0.5)};
  }

  &.wrong .seat.lit {
    --seat-lit: var(--hior-ange);
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
  // Wide enough that "26% of the house" holds one line — it wrapped before,
  // which made four options four different heights. In px because the document
  // root is 62.5%: 9.5rem reads as 95px here, not the 152 it looks like.
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  width: min(100%, 640px);
  margin-inline: auto;
  pointer-events: auto;

  .block-option {
    display: grid;
    gap: 2px;
    padding: 12px 10px;
    transition:
      transform var(--motion-quick) var(--ease-out-expressive),
      border-color var(--motion-quick) var(--ease-out-expressive),
      background var(--motion-quick) var(--ease-out-expressive),
      box-shadow var(--motion-quick) var(--ease-out-expressive);

    // Rides the shared card lift and adds the same face-and-shadow as beat 1,
    // so hovering a block feels like hovering a party. The hover also lights
    // that share of the hemicycle above (`hoveredBlock`) — this is the cue
    // that the two are connected.
    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: milk();
        box-shadow: 0 0.3rem 1rem ink(0.16);
      }
    }

    strong {
      font-size: 24px;
      line-height: 1.1;
    }

    &.dimmed {
      opacity: 0.4;
    }
  }

  .block-share {
    font-size: 13px;
    opacity: 0.65;
  }

  // Crossing 175 of 349 is the fact beat 2 is really teaching, so a block that
  // would do it says so rather than leaving the player to compare two numbers
  // printed in different places on screen.
  .block-majority {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.75;
  }
}

// The reveal's panel language, brought forward to the beat that plays it: a
// hairline-ruled head over the roll, on one cream card.
// 640px matches `.blocks`, so beat 3's panel and beat 2's options present at
// one width. 38rem read as 380px on the 62.5% root — narrow enough that party
// names truncated on a 1280px screen with the page two-thirds empty.
// The panel yields first on a short viewport: it scrolls its own roll rather
// than growing the beat past the column, which is what pushed the subject chip
// off the top.
.sides-panel {
  @include caption-surface($cardRadius);

  display: flex;
  flex-direction: column;
  width: min(94vw, 640px);
  min-height: 0;
  max-height: 100%;
  margin-inline: auto;
  padding: 1.1rem 1.25rem;
  pointer-events: auto;
}

.panel-head {
  padding-bottom: 0.8rem;
  border-bottom: $hairline;

  // The shared label carries a bottom margin for stacked cards; here the
  // hairline is the separator, so it would only double the gap.
  .eyebrow {
    margin-bottom: 0;
  }
}

.sides-lede {
  margin-block: 12px 14px;
  font-size: 15px;
  opacity: 0.75;
}

// A BLOCK scroller, not a grid: the shared scroll-fade's sticky ::before and
// ::after cancel their own height with a negative margin, which a grid (or a
// flex column) defeats — they would become items of their own and each add a
// gap. The rows space themselves instead, and the recipe's maths holds.
.bench-rows {
  min-height: 0;
  overflow-y: auto;
  // Thin rather than absent: the fade says "more below", the bar says how much
  // more, and on a phone the roll can run twice the panel's height.
  scrollbar-width: thin;
  overscroll-behavior: contain;
  // The rows' own focus rings and the card's radius must not be clipped flat
  // against the scroller's edge.
  padding: 2px;
  margin: -2px;

  // Edge fades from the shared recipe (rules/_scroll-fade.scss), each showing
  // only when benches really continue past that edge. Deeper at the bottom
  // than the top: the panel's lede sits above the first row and the fade only
  // has a row's corner to soften, while the bottom edge is where a half-shown
  // bench needs to read as receding rather than sliced.
  @include scroll-fade($top: 1.8rem, $bottom: 3rem);

  .bench-row + .bench-row {
    margin-top: 8px;
  }
}

// Three tracks rather than `space-between`, so the seat counts stand in a
// column of their own and read down the roll as a comparable set.
// Deliberately NOT `caption-surface`: $cardRadius would read as a lozenge on a
// 44px row, and the mixin's blur would cost a compositor layer per row for
// nothing on the flat cream of the panel it already sits on.
.bench-row {
  // The row's type, one token for the name and its seat count — see
  // `.bench-name` for why it is fluid.
  --bench-type: clamp(12px, 4vw, 15px);

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid ink(0.2);
  border-radius: 12px;
  background: milk(0.85);
  // The house arrives bench by bench rather than all at once — the same
  // staggered landing the reveal's rows use.
  animation: row-land var(--motion-base) var(--ease-out-expressive) var(--row-delay, 0ms) backwards;

  // On a phone the name and a full-size control cannot share a line without
  // squeezing one of them. The control takes the row beneath and spans the
  // width, which makes both segments bigger targets rather than smaller ones —
  // as grid ROWS, not a wrap, so the name keeps its column against the seats
  // and the card's own border still encloses the two halves as one bench.
  @media (max-width: $phone) {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 8px;
    padding: 10px 12px;

    .bench-sides {
      grid-column: 1 / -1;
      width: 100%;

      // The two segments split the row rather than holding a fixed width, and
      // give back the desktop height: a full-width target is already easy to
      // hit, and four benches have to share one screen with the lock button.
      :deep(.segment) {
        min-width: 0;
        min-height: 4rem;
        padding: 0.7rem 1rem;
      }
    }
  }
}

// The mark gets room to read as a mark rather than a prefix — 0.5rem was 5px
// on the 62.5% root, which crowded every logo against its party.
//
// Party names are the one string in this round whose length the data decides:
// "Fidesz" and "Alliance of Independent Social Democrats" stand in the same
// column. The type is fluid so the long ones give ground on a narrow phone
// instead of clamping to two lines and doubling the row — full size from a
// ~375px screen up, easing to 12px on the narrowest. The seat count reads off
// the same token, so the row stays one set of type rather than two.
.bench-name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-size: var(--bench-type);
}

// Wraps to a second line before it will truncate: an ellipsis is the last
// resort for a chamber whose names genuinely cannot fit, never the first
// answer to a narrow column. `line-clamp` keeps a three-line party name from
// making one row twice the height of its neighbours.
.bench-label {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.bench-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex: none;
}

// Stands in for a 28px logo — sized like one, for the same reason as
// `.subject-swatch`.
.bench-swatch {
  width: 20px;
  aspect-ratio: 1;
  border-radius: 50%;
  flex: none;
}

// Tabular figures: proportional digits leave 107 and 24 visibly out of true
// even inside a fixed track.
.bench-seats {
  min-width: 4ch;
  font-size: var(--bench-type, 15px);
  font-variant-numeric: tabular-nums;
  text-align: right;
  opacity: 0.6;
}

/**
 * The for/against control. This was a hand-rolled rocker — a second copy of
 * SegmentedControl's idiom that had drifted off every token (a washed `ink(0.88)`
 * thumb instead of `--dark-blue`, a border AND a cream fill on each end, pill
 * radii, `scale()` on press). Three concentric outlines and a cream face inside
 * a cream face is what made it read as mush. The shared control owns the look
 * now; the view only sizes it for a bench row.
 */
.bench-sides {
  flex: none;

  // A locked-in bench is still the player's ANSWER, held on screen through the
  // verdict — the shared control's disabled wash is meant for a setting you
  // cannot use yet, and here it faded the one thing worth reading. Untappable,
  // but at full strength.
  &.disabled {
    opacity: 1;

    :deep(.segmented-track) {
      opacity: 1;
    }
  }

  // The segments carry the round's touch floor: 44px tall is the comfortable
  // target, and an equal minimum width keeps "With" and "Against" the same
  // size so the thumb's travel is a clean half.
  :deep(.segment) {
    min-width: 8.6rem;
    min-height: 4.4rem;
  }
}

// Both footers are a one-cell grid: the row centres itself and reflows as a
// column if its contents ever outgrow the width, which a flex row cannot do
// without a wrap rule per footer.
.sides-footer,
.clock-footer {
  display: grid;
  justify-items: center;
  pointer-events: auto;
}

// Chrome, not a control strip. The shell's footer padding is sized for buttons
// and typed consoles; a display-only dial does not need that band, and on a
// short phone every row of it comes straight out of the beat above (beat 2 was
// 13px over its box with the full band). Only the TOP is trimmed — the bottom
// keeps the shell's `--bottom-clearance` formula, which is what holds the dial
// off the home indicator.
// The dial also takes beat 3's docked size, so the clock never changes size as
// the round moves from beat to beat.
.clock-footer {
  padding-top: 0.4rem;

  // Beat 3's docked size, so the clock never changes size as the round moves
  // from beat to beat. Written on the dial rather than the footer: the shared
  // `.footer-clock` sets these tokens on the element itself, and an inherited
  // value from the parent would never win.
  .footer-clock {
    --clock-size: 4.6rem;
    --clock-seconds-size: 1.5rem;
  }
}

// Wide enough for "Lock it in (0/4)", so locking in never resizes it.
.lock-button {
  min-width: 152px;
}
</style>
