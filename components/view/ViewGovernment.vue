<template>
  <section class="challenge-shell government">
    <ChallengePrompt :attributions="promptSources">
      <h1 class="map-caption">{{ heading }}</h1>
      <span v-if="!finished" class="map-caption sub">{{ prompt }}</span>
    </ChallengePrompt>

    <p v-if="challenge && !finished" class="chamber-facts">
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
          :class="{ chosen: myParty === option.name, dimmed: !!myParty && myParty !== option.name }"
          :disabled="!!myParty"
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
            :class="{
              chosen: mySeats === block,
              dimmed: mySeats !== undefined && mySeats !== block,
            }"
            :disabled="mySeats !== undefined"
            @click="pickSeats(block)"
          >
            <strong>{{ block }}</strong>
            <span class="block-share">{{ shareLabels[block] }}</span>
          </button>
        </div>
      </div>

      <!-- Beat 3: sort the rest — with the government, or against it. -->
      <div v-else key="sides" class="sides-beat">
        <p class="sides-lede">
          Sort the rest of the house: is each bench with the government, or against it?
        </p>
        <div class="bench-rows">
          <div v-for="name in challenge?.sorted ?? []" :key="name" class="bench-row">
            <span class="bench-name">
              <img v-if="logoFor(name)" class="bench-logo" :src="logoFor(name)" alt="" />
              <span v-else class="bench-swatch" :style="{ background: colorFor(name) }" />
              {{ name }}
              <em class="bench-seats">{{ seatsFor(name) }}</em>
            </span>
            <span class="bench-choice">
              <button
                type="button"
                class="side-button"
                :class="{ chosen: mySides[name] === 'government' }"
                :disabled="sidesLocked"
                @click="fileBench(name, 'government')"
              >
                With
              </button>
              <button
                type="button"
                class="side-button"
                :class="{ chosen: mySides[name] === 'opposition' }"
                :disabled="sidesLocked"
                @click="fileBench(name, 'opposition')"
              >
                Against
              </button>
            </span>
          </div>
        </div>
        <footer class="shell-footer sides-footer">
          <button
            type="button"
            class="lock-row"
            :disabled="sidesLocked || !allFiled"
            @click="submitSides"
          >
            {{ sidesLocked ? 'Locked in' : 'Lock it in' }}
          </button>
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
  if (beat.value === 'seats') return 'How many seats does it hold?'
  return 'Who else is with the government?'
})

const promptSources = computed(() => datasetAttribution('elections'))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;

.chamber-facts {
  display: flex;
  gap: 1.25rem;
  justify-content: center;
  pointer-events: auto;

  .fact {
    font-size: 0.85rem;
    opacity: 0.72;
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
  width: min(92vw, 34rem);
  margin-inline: auto;
  margin-block: 0.25rem 0.9rem;
  font-size: 0.9rem;
  text-align: center;
  opacity: 0.75;
}

.bench-rows {
  display: grid;
  gap: 0.5rem;
  width: min(92vw, 34rem);
  margin-inline: auto;
  pointer-events: auto;
}

.bench-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  border-radius: 0.6rem;
  background: milk(0.7);
}

.bench-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.bench-logo {
  width: 1.6rem;
  height: 1.6rem;
  object-fit: contain;
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

.bench-choice {
  display: flex;
  gap: 0.3rem;
}

.sides-footer {
  display: flex;
  justify-content: center;
  pointer-events: auto;
}

.side-button {
  padding: 0.3rem 0.7rem;
  border: 1px solid ink(0.2);
  border-radius: 999px;
  background: transparent;
  font-size: 0.78rem;

  &.chosen {
    background: ink(0.85);
    color: milk();
  }
}
</style>
