<template>
  <section class="timeline-reveal pane tr decorator-bottom">
    <div class="pane-content">
      <h2 class="headline">{{ headline }}</h2>
      <p v-if="eraLine" class="era">{{ eraLine }}</p>

      <!-- Final scoring: banked points against the round's shared ceiling,
           on the shared ranked-bar choreography — the bars ARE the stakes. -->
      <ol class="ranked-bars score-board" aria-label="Final scores">
        <li
          v-for="(row, index) in rows"
          :key="row.playerId"
          class="row player-accent"
          :style="{ '--i': index, '--player-color': row.color }"
        >
          <span class="name">{{ row.name }}</span>
          <span class="fate">{{ row.fate }}</span>
          <span class="bar">
            <span class="fill" :style="{ width: `${row.share * 100}%` }" />
          </span>
          <strong class="pts">{{ row.tail }}</strong>
        </li>
      </ol>

      <!-- The finished chronology, condensed: every card in history's order,
           named and dated, each wearing its placer's colour — misses carry
           the flame edge their correction earned. -->
      <ol class="chronicle" aria-label="The finished timeline">
        <li
          v-for="(stop, index) in chronicle"
          :key="stop.slug"
          class="chronicle-stop"
          :class="{ missed: stop.missed }"
          :style="{ '--stop-delay': `${index * 90}ms`, '--player-color': stop.color }"
        >
          <img v-if="stop.image" class="chronicle-photo" :src="stop.image" :alt="stop.name" />
          <span v-else class="chronicle-photo blank" aria-hidden="true" />
          <span class="chronicle-year">{{ stop.year }}</span>
          <span class="chronicle-name">{{ stop.name }}</span>
        </li>
      </ol>

      <!-- The teachable moment: the card the table misjudged worst gets its
           story retold — or, on a clean sweep, the event that opened the era. -->
      <p v-if="lesson" class="lesson">
        <span class="eyebrow">{{ lesson.kicker }}</span>
        <strong class="lesson-title">{{ lesson.title }}</strong>
        <span v-if="lesson.note" class="lesson-note">{{ lesson.note }}</span>
        <span class="lesson-body">{{ lesson.body }}</span>
      </p>
    </div>
  </section>
</template>
<script lang="ts" setup>
import { formatEventYear, placedYears, scoreTimeline, timelineEvent } from '~~/lib/timeline'
import { formatNumber } from '~~/lib/number'
import { seatLabel } from '~~/lib/player'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  challenge: TimelineChallenge
  players: { [playerId: string]: Player }
  playerId: string
}>()

const state = computed(() => props.challenge.state)

/** The one scorer both ends of the wire share — never re-derive from banked. */
const scores = computed(() => scoreTimeline(props.challenge))

const rows = computed(() =>
  state.value.order
    .map(playerId => {
      const mine = state.value.placements.filter(entry => entry.playerId === playerId)
      const correct = mine.filter(entry => entry.correct).length
      const { scored, maximum } = scores.value[playerId] ?? {
        scored: 0,
        maximum: props.challenge.maximumPoints,
      }
      return {
        playerId,
        name: seatLabel(props.players, playerId, props.playerId),
        color: props.players[playerId]?.color,
        fate: `${correct}/${mine.length} right`,
        share: maximum > 0 ? Math.max(0.03, scored / maximum) : 0,
        tail: `${Math.round(scored)} / ${maximum} pts`,
        correct,
        scored,
      }
    })
    .sort((a, b) => b.scored - a.scored || b.correct - a.correct)
)

const headline = computed(() => {
  const best = rows.value[0]
  if (!best || rows.value.length < 2) return 'The line is complete'
  return best.playerId === props.playerId
    ? 'You read history best!'
    : `${best.name} reads history best`
})

/** The era the table just walked, as one line of scope. */
const eraLine = computed(() => {
  const years = placedYears(state.value.placed)
  const first = years[0]
  const last = years[years.length - 1]
  if (first === undefined || last === undefined || first === last) return undefined
  const span = last - first
  return `${state.value.placed.length} cards from ${formatEventYear(first)} to ${formatEventYear(last)} — ${formatNumber(span)} years of history in one line.`
})

/** The finished line in chronological order: the opener seed plus every
 *  placement, each stop tinted by whoever filed it. */
const chronicle = computed(() =>
  state.value.placed.map(slug => {
    const event = timelineEvent(slug)
    const placement = state.value.placements.find(entry => entry.slug === slug)
    return {
      slug,
      name: event?.name ?? slug,
      year: formatEventYear(event?.year ?? 0),
      image: event?.image,
      missed: !!placement && !placement.correct,
      color: placement ? props.players[placement.playerId]?.color : undefined,
    }
  })
)

/** Misses teach best: the placement furthest from its true slot gets its
 *  story retold. A clean sweep falls back to the event that opened the era. */
const lesson = computed(() => {
  const misses = state.value.placements
    .filter(entry => !entry.correct && entry.kind === 'placed')
    .sort((a, b) => Math.abs(b.chosenSlot - b.correctSlot) - Math.abs(a.chosenSlot - a.correctSlot))
  const worst = misses[0]
  if (worst) {
    const event = timelineEvent(worst.slug)
    if (!event) return undefined
    const off = Math.abs(worst.chosenSlot - worst.correctSlot)
    const way = worst.chosenSlot < worst.correctSlot ? 'early' : 'late'
    return {
      kicker: 'The hardest card to place',
      title: `${event.name} — ${formatEventYear(event.year)}`,
      note: `${seatLabel(props.players, worst.playerId, props.playerId)} filed it ${off} ${off === 1 ? 'slot' : 'slots'} too ${way}.`,
      body: event.description,
    }
  }
  const seed = timelineEvent(state.value.placed[0] ?? '')
  if (!seed?.description) return undefined
  return {
    kicker: 'Where the story began',
    title: `${seed.name} — ${formatEventYear(seed.year)}`,
    note: undefined,
    body: seed.description,
  }
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.timeline-reveal {
  pointer-events: none;

  .pane-content {
    gap: 0.9rem;
    display: flex;
    padding: 1.8rem 2.2rem 1.6rem;
    flex-flow: column nowrap;
  }
}

.headline {
  margin: 0;
  font-size: 1.8rem;
}

.era {
  margin: 0;
  opacity: 0.75;
  font-size: 1.3rem;
}

// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss;
// each row wears its player's identity edge and fills the bar in their colour.
.score-board {
  margin: 0;
  list-style: none;
  pointer-events: auto;

  .name {
    width: 9rem;
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .fate {
    width: 6rem;
    opacity: 0.65;
    flex-shrink: 0;
    font-size: 1.2rem;
  }

  .fill {
    background: var(--player-color, #{ink(0.45)});
  }

  .pts {
    width: 8.5rem;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
}

.chronicle {
  gap: 1rem;
  margin: 0.3rem 0 0;
  padding: 0.2rem 0.2rem 0.4rem;
  display: flex;
  list-style: none;
  align-items: flex-start;
  // Long lines scroll inside the card; the card itself is pointer-inert.
  pointer-events: auto;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.chronicle-stop {
  gap: 0.35rem;
  display: flex;
  flex: none;
  width: 7.2rem;
  align-items: center;
  flex-flow: column nowrap;
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: var(--stop-delay);
}

.chronicle-photo {
  width: 4.6rem;
  height: 3.4rem;
  object-fit: cover;
  border-radius: 0.4rem;
  // The placer's identity edge — the seed card keeps a plain hairline.
  border-bottom: 0.3rem solid var(--player-color, #{ink(0.25)});

  &.blank {
    display: block;
    background: ink(0.08);
  }

  .missed & {
    outline: 0.15rem solid flame(0.75);
    outline-offset: 0.1rem;
  }
}

.chronicle-year {
  line-height: 1;
  font-size: 1.15rem;
  font-weight: bold;
  color: var(--dark-blue);
}

.chronicle-name {
  overflow: hidden;
  display: -webkit-box;
  font-size: 1rem;
  line-height: 1.2;
  text-align: center;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--dark-blue);
  opacity: 0.75;
}

.lesson {
  gap: 0.3rem;
  margin: 0;
  display: flex;
  flex-flow: column nowrap;
  padding-top: 0.7rem;
  border-top: $hairline;

  .lesson-title {
    font-size: 1.4rem;
  }

  .lesson-note {
    opacity: 0.7;
    font-size: 1.2rem;
  }

  .lesson-body {
    font-size: 1.25rem;
    line-height: 1.45;
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chronicle-stop {
    animation: none;
  }
}
</style>
