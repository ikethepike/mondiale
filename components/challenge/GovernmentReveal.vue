<template>
  <section class="government-reveal">
    <!-- The take: the chamber, finally painted, with the government's own
         block sitting where the player was asked to find it. -->
    <header class="take card">
      <h2 class="take-title">{{ answers.governingParty }} governs</h2>
      <span class="take-sub">{{ verdictLine }}</span>
    </header>

    <article class="panel card">
      <header class="panel-head">
        <span class="eyebrow">{{ chamberLabel }}</span>
        <SourceInfo class="panel-source" :attributions="sources" />
      </header>

      <!-- The arc, painted by STANDING rather than by party: the shape of who
           rules is the thing the round has been circling for three beats. -->
      <div class="arc">
        <span
          v-for="(seat, index) in paintedSeats"
          :key="index"
          class="seat"
          :class="seat.standing"
          :style="{
            left: `${seat.x}%`,
            top: `${seat.y}%`,
            '--seat-delay': `${index * 4}ms`,
          }"
        />
        <!-- The majority line: where half the house sits, so a minority
             government is visibly short of it rather than merely labelled. -->
        <span class="majority-rule" :style="{ left: `${majorityMark}%` }">
          <span class="majority-label">{{ majority }} for a majority</span>
        </span>
      </div>

      <ul class="legend">
        <li v-for="side in sides" :key="side.key" class="legend-row">
          <span class="legend-head">
            <span class="legend-dot" :class="side.key" />
            <strong>{{ side.label }}</strong>
            <em class="legend-seats">{{ side.seats }} seats</em>
          </span>
          <ul class="legend-parties">
            <li v-for="bench in side.benches" :key="bench.name" class="legend-party">
              <img v-if="bench.logo" class="party-logo" :src="bench.logo" alt="" />
              <span v-else class="party-swatch" :style="{ background: bench.color }" />
              <span class="party-name">{{ bench.name }}</span>
              <span class="party-seats">{{ seatsOf(bench.name) }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <!-- The lesson, in one sentence, only where it applies. -->
      <p v-if="backingLine" class="lesson">{{ backingLine }}</p>
    </article>

    <!-- Per beat, because "4 of 10" says nothing about which question a player
         actually knew. -->
    <article v-if="scoreboard.length" class="scores card">
      <header class="panel-head">
        <span class="eyebrow">How the table did</span>
      </header>
      <ul class="score-rows">
        <li
          v-for="row in scoreboard"
          :key="row.playerId"
          class="score-row player-accent"
          :class="{ mine: row.playerId === playerId }"
          :style="{ '--player-color': players[row.playerId]?.color }"
        >
          <PlayerPawn class="score-pawn" :player="players[row.playerId]" />
          <span class="score-name">{{ seatName(row.playerId) }}</span>
          <span class="score-beats">
            <span
              v-for="beat in row.beats"
              :key="beat.beat"
              class="score-pip"
              :class="{ won: beat.scored > 0, part: beat.scored > 0 && beat.scored < beat.maximum }"
              :title="BEAT_LABELS[beat.beat]"
            >
              {{ BEAT_SHORT[beat.beat] }}
            </span>
          </span>
          <span class="score-total">+{{ row.total }}</span>
        </li>
      </ul>
    </article>
  </section>
</template>

<script setup lang="ts">
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
import { MAX_SEAT_DOTS, type GovernmentBeat } from '~~/lib/government'
import { seatLabel } from '~~/lib/player'
import { formatNumber } from '~~/lib/number'
import type { GovernmentAnswers, GovernmentChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAnswer } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The Government round's payoff.
 *
 * The three beats each asked half a question; this is where they add up. The
 * arc is painted by STANDING rather than by party, because the shape of who
 * rules — and how far short of a majority they are — is the thing the round
 * has been circling.
 */

const props = defineProps<{
  challenge: GovernmentChallenge
  answers: GovernmentAnswers
  players: Partial<Record<string, Player>>
  playerId: string
  scores: Record<string, { scored: number; maximum: number }>
  groupAnswers: Record<string, GroupChallengeAnswer>
}>()

const BEAT_LABELS: { [beat in GovernmentBeat]: string } = {
  party: 'Which party governs',
  seats: 'How many seats',
  sides: 'Who is with them',
}
const BEAT_SHORT: { [beat in GovernmentBeat]: string } = {
  party: 'Party',
  seats: 'Seats',
  sides: 'Sides',
}

const sources = computed(() => datasetAttribution('elections'))

const chamberLabel = computed(() =>
  props.challenge.chamber
    ? `${countryName(props.challenge.country)} — the ${props.challenge.chamber}`
    : `The ${countryName(props.challenge.country)} chamber`
)

const majority = computed(() => Math.floor(props.challenge.totalSeats / 2) + 1)

const standingOf = (name: string) => props.answers.standings[name] ?? 'opposition'

/**
 * A bench's seats, resolved once here rather than at four call sites.
 *
 * `benches[].seats` is optional on the wire: it is stripped until beat 3 opens,
 * because the governing bench's row IS beat 2's answer. The reveal only ever
 * runs after `restoreBenchSeats` has put them back, so this reads the answers
 * as the authority and falls back to the bench — never to a guess.
 */
const seatsOf = (name: string) =>
  props.answers.benchSeats?.[name] ??
  props.challenge.benches.find(bench => bench.name === name)?.seats ??
  0

/** Benches grouped by where they stand, government first — the reading order. */
const sides = computed(() => {
  const groups = (['government', 'backing', 'opposition'] as const).map(key => {
    const benches = props.challenge.benches.filter(bench => standingOf(bench.name) === key)
    return {
      key,
      label: { government: 'In government', backing: 'Backing', opposition: 'Opposition' }[key],
      benches: [...benches].sort((a, b) => seatsOf(b.name) - seatsOf(a.name)),
      seats: benches.reduce((total, bench) => total + seatsOf(bench.name), 0),
    }
  })
  // A country with no confidence-and-supply deal has no Backing row to show.
  return groups.filter(group => group.benches.length)
})

/**
 * The arc, ordered government → backing → opposition rather than by party, so
 * the government's block reads as one mass against the rest of the house.
 */
const paintedSeats = computed(() => {
  const total = props.challenge.totalSeats
  if (!total) return []
  const scale = Math.min(1, MAX_SEAT_DOTS / total)
  const run: ('government' | 'backing' | 'opposition')[] = []
  for (const side of sides.value) {
    for (const bench of side.benches) {
      const dots = Math.max(1, Math.round(seatsOf(bench.name) * scale))
      for (let index = 0; index < dots; index += 1) run.push(side.key)
    }
  }
  return hemicycleSeats(run.length).map((seat, index) => ({
    ...seat,
    standing: run[index] ?? 'opposition',
  }))
})

/** Where the majority line falls across the arc, as a percentage of its width. */
const majorityMark = computed(() => {
  const total = props.challenge.totalSeats
  return total ? Math.min(100, Math.max(0, (majority.value / total) * 100)) : 50
})

const governmentSeats = computed(
  () => sides.value.find(side => side.key === 'government')?.seats ?? 0
)

const verdictLine = computed(() => {
  const held = formatNumber(governmentSeats.value)
  const shape = props.answers.status ? `${props.answers.status} — ` : ''
  return `${shape}${held} of ${formatNumber(props.challenge.totalSeats)} seats`
})

/**
 * The teaching sentence, and the reason the round separates backers from
 * opposition at all: a government can hold power well short of half the house.
 */
const backingLine = computed(() => {
  const backers = sides.value.find(side => side.key === 'backing')
  if (backers) {
    const names = backers.benches.map(bench => bench.name).join(', ')
    return `${names} hold no ministries, but supply the votes: ${formatNumber(
      governmentSeats.value + backers.seats
    )} seats behind the government, against the ${formatNumber(majority.value)} a majority needs.`
  }
  if (props.answers.minority) {
    return `A minority government: it holds ${formatNumber(
      governmentSeats.value
    )} of the ${formatNumber(
      props.challenge.totalSeats
    )} seats and must find the rest vote by vote.`
  }
  return ''
})

const seatName = (id: string) => seatLabel(props.players, id, props.playerId)

const scoreboard = computed(() =>
  Object.entries(props.scores)
    .map(([playerId, scoring]) => ({
      playerId,
      total: scoring.scored,
      beats: props.groupAnswers[playerId]?.governmentBeats ?? [],
    }))
    .filter(row => row.beats.length)
    .sort((a, b) => b.total - a.total)
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;

.government-reveal {
  display: grid;
  align-content: start;
  gap: 0.75rem;
  width: min(94vw, 46rem);
  max-height: 100%;
  margin-inline: auto;
  overflow-y: auto;
  pointer-events: auto;
}

.card {
  align-self: start;
}

.card {
  @include caption-surface($cardRadius);

  padding: 1.1rem 1.25rem;
}

.take {
  display: grid;
  gap: 0.15rem;
}

.take-title {
  margin: 0;
  font-size: var(--caption-display);
  line-height: 1.1;
}

.take-sub {
  font-size: 1.05rem;
  opacity: 0.8;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: $hairline;
  margin-bottom: 0.6rem;
}

.arc {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 1;

  .seat {
    position: absolute;
    // The arc IS the reveal's subject — at 1.7% the chamber read as a faint
    // dotted outline rather than a house you can count.
    width: 2.3%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: ink(0.22);
    transform: translate(-50%, -50%);
    animation: seat-land 300ms both;
    animation-delay: var(--seat-delay);

    &.government {
      background: ink(0.85);
    }

    &.backing {
      background: ink(0.85);
      // The backers are WITH the government but not of it — same hue, hollow.
      box-shadow: inset 0 0 0 0.16rem #{ink(0.85)};
      background: transparent;
    }

    &.opposition {
      background: ink(0.22);
    }
  }
}

@keyframes seat-land {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }
}

.majority-rule {
  position: absolute;
  inset-block: 4% 0;
  width: 0;
  border-left: 1px dashed #{ink(0.45)};
  animation: rule-in 400ms 900ms both;
}

@keyframes rule-in {
  from {
    opacity: 0;
  }
}

.majority-label {
  position: absolute;
  bottom: -0.1rem;
  left: 0.35rem;
  font-size: 0.8rem;
  white-space: nowrap;
  opacity: 0.7;
}

.legend {
  display: grid;
  gap: 0.6rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.legend-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
}

.legend-dot {
  width: 0.85rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: ink(0.22);

  &.government {
    background: ink(0.85);
  }

  &.backing {
    box-shadow: inset 0 0 0 0.12rem #{ink(0.85)};
  }
}

.legend-seats {
  font-style: normal;
  opacity: 0.6;
}

.legend-parties {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  width: 100%;
  margin: 0.3rem 0 0;
  padding: 0;
  list-style: none;
}

.legend-row {
  min-width: 0;
}

.legend-party {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.6rem;
  border: 1px solid ink(0.14);
  border-radius: 999px;
  font-size: 0.92rem;
  // NOT the shared `chip-in`: that one ends at translate(-50%, -50%) because
  // it animates absolutely-positioned map chips onto a point. On a chip laid
  // out in flow it leaves a permanent half-width shift, which walked these
  // out past the card's left edge.
  animation: party-in 240ms both;
}

@keyframes party-in {
  from {
    opacity: 0;
    transform: translateY(0.35rem);
  }
}

.party-logo {
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
}

.party-swatch {
  width: 0.8rem;
  aspect-ratio: 1;
  border-radius: 50%;
}

.party-seats {
  opacity: 0.6;
}

.lesson {
  margin: 0.75rem 0 0;
  padding-top: 0.6rem;
  border-top: $hairline;
  font-size: 1rem;
  line-height: 1.5;
}

.score-rows {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;

  &.mine {
    background: ink(0.05);
  }
}

.score-pawn {
  width: 1.7rem;
}

.score-name {
  flex: 1;
  font-size: 1rem;
}

.score-beats {
  display: flex;
  gap: 0.2rem;
}

.score-pip {
  padding: 0.22rem 0.5rem;
  border: 1px solid ink(0.15);
  border-radius: 999px;
  font-size: 0.78rem;
  opacity: 0.45;

  &.won {
    background: ink(0.85);
    color: milk();
    opacity: 1;
  }

  &.part {
    background: ink(0.4);
  }
}

.score-total {
  min-width: 2.4rem;
  font-size: 1.25rem;
  font-weight: 600;
  text-align: right;
}
</style>
