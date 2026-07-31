<template>
  <span class="ranked-bars anthem-reveal">
    <span class="header">
      <strong class="subject">{{ subject }}</strong>
      <span class="subtitle">{{ subtitle }}</span>
      <span v-if="credit" class="credit">{{ credit }}</span>
    </span>

    <span v-if="replayClip" class="replay-row">
      <button type="button" class="replay" @click="replay">
        {{ replaying ? 'Playing…' : 'Hear it again' }}
      </button>
      <audio ref="element" preload="none" @ended="replaying = false">
        <source :src="replayClip.webm" type="audio/webm" />
        <source :src="replayClip.m4a" type="audio/mp4" />
      </audio>
    </span>

    <span class="eyebrow race-caption">Buzz race</span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.playerId"
        class="row player-accent"
        :class="{ missed: !row.buzzed, mine: row.playerId === myPlayerId }"
        :style="{ '--i': index, '--player-color': row.colour }"
      >
        <span class="name">{{ row.name }}</span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.share}%` }" />
        </span>
        <span class="tail">{{ row.tail }}</span>
      </span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import { buzzFraction } from '~~/lib/scoring'
import { formatCompact } from '~~/lib/number'
import { seatLabel } from '~~/lib/player'
import type { Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The audio rounds' scorecard: what the clip was, plus the race that decided
 * the points. The bar length IS `buzzFraction` at each player's buzz — the
 * same curve that paid them — so the decay is visible rather than asserted.
 *
 * Renders inside ChallengeResult's <p class="lesson">, so every element here
 * is a span. Geometry and the row stagger come from templates/_ranked-bars.scss.
 */
const props = defineProps<{
  /** The answer: a country name, or the language. */
  subject: string
  subtitle: string
  credit?: string
  replayClip?: { webm: string; m4a: string }
  round: Round
  players: { [playerId: string]: Player }
  myPlayerId?: string
}>()

const element = ref<HTMLAudioElement>()
const replaying = ref(false)

const replay = async () => {
  const audio = element.value
  if (!audio) return
  audio.currentTime = 0
  await audio.play().then(
    () => (replaying.value = true),
    () => (replaying.value = false)
  )
}

const rows = computed(() => {
  const entries = Object.entries(props.players).map(([playerId, player]: [string, Player]) => {
    const answer = props.round.groupAnswers[playerId]
    const points = props.round.playerTurns[playerId]?.points
    const buzzed = typeof answer?.buzzAt === 'number'
    const scored = points?.scored ?? 0

    return {
      playerId,
      name: seatLabel(props.players, playerId, props.myPlayerId),
      colour: player.color,
      buzzed,
      buzzAt: answer?.buzzAt ?? 0,
      scored,
      // A buzz's bar is the fraction of the pot its timing earned; a miss is
      // an empty track, not a zero-width bar with no story.
      share: buzzed ? Math.round(buzzFraction(answer?.buzzAt ?? 0) * 100) : 0,
      tail: buzzed ? `${formatCompact(scored)} pts` : 'missed',
    }
  })

  // Earliest buzz first (most clock left), non-buzzers last.
  return entries.sort((a, b) => {
    if (a.buzzed !== b.buzzed) return a.buzzed ? -1 : 1
    return b.buzzAt - a.buzzAt
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
.header {
  gap: 0.3rem;
  display: flex;
  flex-flow: column nowrap;
}

.subject {
  font-size: 1.8rem;
}

.subtitle,
.credit {
  color: var(--soft-blue);
  font-size: 1.3rem;
}

.credit {
  font-size: 1.1rem;
  opacity: 0.8;
}

.replay-row {
  display: flex;
}

.replay {
  border: 0;
  cursor: pointer;
  padding: 0.5rem 1.4rem;
  font-size: 1.3rem;
  font-weight: 600;
  border-radius: 2rem;
  color: #{milk()};
  background: #{ink()};
}

.race-caption {
  margin-top: 0.4rem;
}

// The row wears .player-accent, whose colour edge is a border with no padding
// of its own — without this the name sits flush against the player's colour.
// The right inset is ours too: _ranked-bars.scss drops the shell's horizontal
// padding under 480px, which would otherwise run the points to the card edge.
.row {
  padding-left: 0.8rem;
  padding-right: 0.6rem;
}

.name {
  min-width: 6rem;
  font-weight: 600;
  // Long names shrink rather than shove the bar and points off the row.
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tail {
  // "missed" is wider than "28 pts"; reserve for the longest so the right edge
  // stays flush and nothing clips off the card.
  min-width: 4.5rem;
  text-align: right;
}

// The skin owns the fill colour; the template owns its geometry. Each bar is
// the share of the pot that player's timing earned, so the buzz curve is
// legible at a glance rather than implied by the numbers.
.bar .fill {
  background: var(--soft-blue);
}

.mine .bar .fill {
  background: #{flame()};
}

.missed .bar {
  opacity: 0.5;
}

.tail {
  font-variant-numeric: tabular-nums;
}

.missed {
  opacity: 0.55;
}

.mine .name {
  color: #{flame()};
}
</style>
