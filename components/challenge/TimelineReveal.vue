<template>
  <section class="timeline-reveal pane tr decorator-bottom">
    <div class="pane-content">
      <h2 class="headline">{{ headline }}</h2>
      <ol class="placements">
        <li v-for="row in rows" :key="row.playerId" class="placement">
          <PlayerPawn class="pawn" :player="players[row.playerId]" />
          <span class="name">{{ row.name }}</span>
          <span class="fate">{{ row.fate }}</span>
          <span class="points">{{ row.banked }} pts</span>
        </li>
      </ol>
      <p class="coda">The finished line runs below — every card where history put it.</p>
    </div>
  </section>
</template>
<script lang="ts" setup>
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import type { TimelineState } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  state: TimelineState
  players: { [playerId: string]: Player }
  playerId: string
}>()

const nameOf = (playerId: string) => props.players[playerId]?.name || 'Anonymous'

interface Row {
  playerId: string
  name: string
  fate: string
  correct: number
  total: number
  banked: number
}

/** Banked points first, correct placements as the tie-breaker. */
const rows = computed<Row[]>(() =>
  props.state.order
    .map(playerId => {
      const mine = props.state.placements.filter(entry => entry.playerId === playerId)
      const correct = mine.filter(entry => entry.correct).length
      return {
        playerId,
        name: playerId === props.playerId ? 'You' : nameOf(playerId),
        fate: `${correct} of ${mine.length} placed right`,
        correct,
        total: mine.length,
        banked: Math.round(props.state.banked[playerId] ?? 0),
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

.placements {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
}

.placement {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  font-size: 1.3rem;

  .pawn {
    width: 1.2rem;
    height: 1.85rem;
    flex: none;
  }

  .name {
    font-weight: bold;
  }

  .fate {
    opacity: 0.75;
  }

  .points {
    opacity: 0.8;
    margin-left: auto;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
}

.coda {
  margin: 0;
  opacity: 0.65;
  font-size: 1.15rem;
}
</style>
