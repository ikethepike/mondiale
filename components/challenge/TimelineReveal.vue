<template>
  <section class="timeline-reveal pane tr decorator-bottom">
    <div class="pane-content">
      <h2 class="headline">{{ headline }}</h2>
      <PlacementList :rows="rows" :players="players" />
      <p class="coda">The finished line runs below — every card where history put it.</p>
    </div>
  </section>
</template>
<script lang="ts" setup>
import PlacementList from '~/components/challenge/PlacementList.vue'
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
</script>
<style lang="scss" scoped>
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

.coda {
  margin: 0;
  opacity: 0.65;
  font-size: 1.15rem;
}
</style>
