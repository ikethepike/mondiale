<template>
  <section class="timeline-reveal pane tr decorator-bottom">
    <div class="pane-content">
      <h2 class="headline">{{ headline }}</h2>
      <PlacementList :rows="rows" :players="players" />
      <!-- The finished chronology itself, condensed: every card in history's
           order, each wearing its placer's colour — misses carry the flame
           edge their correction earned. -->
      <ol class="chronicle" aria-label="The finished timeline">
        <li
          v-for="(stop, index) in chronicle"
          :key="stop.slug"
          class="chronicle-stop"
          :class="{ missed: stop.missed }"
          :style="{ '--stop-delay': `${index * 90}ms`, '--player-color': stop.color }"
          :title="stop.name"
        >
          <img v-if="stop.image" class="chronicle-photo" :src="stop.image" :alt="stop.name" />
          <span v-else class="chronicle-photo blank" aria-hidden="true" />
          <span class="chronicle-year">{{ stop.year }}</span>
        </li>
      </ol>
      <p class="coda">History's order, left to right — each card wears its placer's colour.</p>
    </div>
  </section>
</template>
<script lang="ts" setup>
import PlacementList from '~/components/challenge/PlacementList.vue'
import { formatEventYear, timelineEvent } from '~~/lib/timeline'
import { seatLabel } from '~~/lib/player'
import type { TimelineState } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  state: TimelineState
  players: { [playerId: string]: Player }
  playerId: string
}>()

interface Row {
  playerId: string
  name: string
  fate: string
  tail: string
  correct: number
  banked: number
}

/** Banked points first, correct placements as the tie-breaker. */
const rows = computed<Row[]>(() =>
  props.state.order
    .map(playerId => {
      const mine = props.state.placements.filter(entry => entry.playerId === playerId)
      const correct = mine.filter(entry => entry.correct).length
      const banked = Math.round(props.state.banked[playerId] ?? 0)
      return {
        playerId,
        name: seatLabel(props.players, playerId, props.playerId),
        fate: `${correct} of ${mine.length} placed right`,
        tail: `${banked} pts`,
        correct,
        banked,
      }
    })
    .sort((a, b) => b.banked - a.banked || b.correct - a.correct)
)

const headline = computed(() => {
  const best = rows.value[0]
  if (!best || rows.value.length < 2) return 'The line is complete'
  return best.playerId === props.playerId
    ? 'You read history best!'
    : `${best.name} reads history best`
})

/** The finished line in chronological order: the opener seed plus every
 *  placement, each stop tinted by whoever filed it. */
const chronicle = computed(() =>
  props.state.placed.map(slug => {
    const event = timelineEvent(slug)
    const placement = props.state.placements.find(entry => entry.slug === slug)
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

.chronicle {
  gap: 1rem;
  margin: 0.3rem 0 0;
  padding: 0.2rem 0.2rem 0.4rem;
  display: flex;
  list-style: none;
  align-items: flex-end;
  // Long lines scroll inside the card; the card itself is pointer-inert.
  pointer-events: auto;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.chronicle-stop {
  gap: 0.35rem;
  display: flex;
  flex: none;
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

.coda {
  margin: 0;
  opacity: 0.65;
  font-size: 1.15rem;
}

@media (prefers-reduced-motion: reduce) {
  .chronicle-stop {
    animation: none;
  }
}
</style>
