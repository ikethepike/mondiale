<template>
  <ModalWrapper class="timeline-report-wrapper">
    <article class="pane timeline-report tl decorator-bottom">
      <section class="report-main">
        <header class="pane-content card-header">
          <span class="eyebrow">The line is complete</span>
          <h2>{{ headline }}</h2>
          <p v-if="eraLine" class="era">{{ eraLine }}</p>
        </header>

        <!-- The finished chronology: every card in history's order, named and
             dated, each wearing its placer's colour — misses carry the flame
             edge their correction earned. -->
        <section class="pane-content chronicle-block">
          <span class="eyebrow">The Finished Line</span>
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
        </section>

        <!-- The teachable moment: the card the table misjudged worst gets its
             story retold — or, on a clean sweep, the event that opened the era. -->
        <section v-if="lesson" class="pane-content lesson-block">
          <span class="eyebrow">{{ lesson.kicker }}</span>
          <strong class="lesson-title">{{ lesson.title }}</strong>
          <span v-if="lesson.note" class="lesson-note">{{ lesson.note }}</span>
          <p class="lesson-body">{{ lesson.body }}</p>
          <span class="credit-row">
            <SourceInfo
              drop="up"
              :attributions="sources"
              label="Sources"
              :item-credit="lesson.credit"
            />
            <span class="credit">{{ sources[0].credit }}</span>
          </span>
        </section>
      </section>

      <!-- Sidebar: final scoring against the round's shared ceiling, on the
           shared ranked-bar choreography — the bars ARE the stakes. -->
      <section class="player-listing pane-content">
        <header class="listing-header">
          <span class="eyebrow">Round Standings</span>
        </header>
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
      </section>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, mediaCreditLine } from '~~/lib/attribution'
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

const sources = datasetAttribution('events')

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
      credit: mediaCreditLine(event, 'commons-media'),
    }
  }
  const seed = timelineEvent(state.value.placed[0] ?? '')
  if (!seed?.description) return undefined
  return {
    kicker: 'Where the story began',
    title: `${seed.name} — ${formatEventYear(seed.year)}`,
    note: undefined,
    body: seed.description,
    credit: mediaCreditLine(seed, 'commons-media'),
  }
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The wrapper's default absolute (no top) would strand the report at the
// stage's static position — pin it over the whole view instead.
.modal-wrapper.timeline-report-wrapper {
  inset: 0;
  position: fixed;
}

// The full-page round report, on the ViewGroupScores shell: main column and
// a standings rail, hairline-ruled sections each opened by an eyebrow.
.timeline-report {
  width: 100%;
  margin: auto;
  display: grid;
  max-width: 110rem;
  grid-template-columns: 73% 27%;
}

.card-header {
  h2 {
    margin: 0.4rem 0 0;
    font-size: 2.4rem;
  }

  .era {
    margin: 0.6rem 0 0;
    opacity: 0.75;
    font-size: 1.35rem;
  }
}

.chronicle-block,
.lesson-block {
  padding-top: 2rem;
  padding-bottom: 2rem;
  border-top: 0.1rem solid $hairline;

  .eyebrow {
    display: block;
    margin-bottom: 1.2rem;
  }
}

.chronicle {
  gap: 1rem;
  margin: 0;
  padding: 0.2rem 0.2rem 0.4rem;
  display: flex;
  list-style: none;
  align-items: flex-start;
  // Long lines scroll sideways in place — never hidden (ViewVictory idiom).
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

.lesson-block {
  .lesson-title {
    display: block;
    margin-top: 0.2rem;
    font-size: 1.5rem;
  }

  .lesson-note {
    display: block;
    opacity: 0.7;
    margin-top: 0.3rem;
    font-size: 1.2rem;
  }

  .lesson-body {
    margin: 0.8rem 0 0;
    opacity: 0.85;
    font-size: 1.3rem;
    line-height: 1.5;
  }
}

// Sidebar: ranked standings on the shared bar choreography, restacked for
// the rail — name over bar over verdict, points on the shoulder.
.player-listing {
  border-left: 0.1rem solid var(--text-color);
}

.listing-header {
  margin-bottom: 1.6rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }
}

.score-board {
  margin: 0;
  padding: 0;
  min-width: 0;
  max-height: none;
  overflow: visible;
  list-style: none;

  .row {
    display: grid;
    // Air between the identity edge and the name.
    padding-left: 0.8rem;
    gap: 0.25rem 0.8rem;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name pts'
      'bar  bar'
      'fate fate';
  }

  .name {
    overflow: hidden;
    grid-area: name;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .pts {
    grid-area: pts;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    grid-area: bar;
  }

  .fate {
    opacity: 0.65;
    grid-area: fate;
    font-size: 1.2rem;
  }

  .fill {
    background: var(--player-color, #{ink(0.45)});
  }
}

@media (prefers-reduced-motion: reduce) {
  .chronicle-stop {
    animation: none;
  }
}

// Phone portrait: the split becomes a stack — report first, standings beneath
// under a top rule; the wrapper's scroller owns the overflow.
@media screen and (max-width: $tablet) {
  .timeline-report {
    grid-template-columns: 100%;
    // Bottom breathing room inside the ModalWrapper scroller, past the
    // home indicator.
    margin-bottom: calc(var(--safe-bottom) + 2rem);
  }

  .player-listing {
    border-left: none;
    border-top: 0.1rem solid var(--text-color);
  }

  .card-header h2 {
    font-size: 1.9rem;
  }
}
</style>
