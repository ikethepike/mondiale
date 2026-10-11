<template>
  <div class="board-overlay">
    <BoardFallback v-if="gameStore.board.stageFailed && game" :game="game" />
    <div
      v-else-if="!gameStore.board.stageReady"
      class="pane stage-pending"
      role="status"
      aria-live="polite"
    >
      Setting up the board…
    </div>

    <SpectateHud v-if="game" :game="game" />

    <BoardCaption v-if="game && !gameStore.board.spectateTargetId && !gameStore.watching" />

    <Interstitial
      v-if="showMoveInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1}`"
      title="On the move!"
      :stakes="interstitialStakes"
      :hold-for="MOVE_INTERSTITIAL_HOLD_MS / 1000"
      @done="markIntroSeen"
    />
  </div>
</template>
<script lang="ts" setup>
import BoardCaption from '~/components/board3d/BoardCaption.vue'
import BoardFallback from '~/components/board3d/BoardFallback.vue'
import SpectateHud from '~/components/board3d/SpectateHud.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { MOVE_INTERSTITIAL_HOLD_MS } from '~~/lib/round-beats'

// The dispatched view for the board steps. The persistent stage
// (BoardStage, in the layout) does the actual rendering — this host only
// carries what's drawn OVER the board: the move interstitial, the caption,
// the booth HUD, the cold-start pane and the 2D fallback. It must
// never wrap ModalWrapper — the shell would eat the stage's orbit drags.
const { game, gameStore, currentRound } = useClientEvents()

// The board's subject: own seat, or the followed seat in the booth.
const subjectId = computed(() => gameStore.board.spectateTargetId ?? gameStore.seatId)
const subject = computed(() => game.value?.players[subjectId.value])

// The "On the move!" beat plays once per walk: only over a turn-OPENING
// walk's announce (leg 0, before its first step) and remembered per seat and
// walk subject so an overlay remount mid-lead can't replay it. Its total fits
// inside the server's announce lead by construction (round-beats' fit test)
// — it never gates anything.
const introKey = computed(() =>
  subject.value ? `${subjectId.value}:${subject.value.cursor.subject}` : undefined
)
const showMoveInterstitial = computed(() => {
  const cursor = subject.value?.cursor
  return (
    cursor?.step === 'walk' &&
    cursor.leg === 0 &&
    cursor.cause !== 'timer:walk-step' &&
    !!introKey.value &&
    gameStore.board.introSeenKey !== introKey.value
  )
})
const markIntroSeen = () => {
  gameStore.board.introSeenKey = introKey.value
}

// Name the player's actual conversion — "7 points → 7 tiles" lands better
// than the abstract rule. Falls back to the rule when the score isn't known.
const interstitialStakes = computed(() => {
  const scored = currentRound.value?.round.playerTurns[subjectId.value]?.points.scored
  if (scored === undefined) {
    return 'Pawns advance one tile per point earned — challenges block the path.'
  }
  if (scored === 0) return 'No points this round — your pawn stays put.'
  const tiles = scored === 1 ? '1 tile' : `${scored} tiles`
  return `You scored ${scored} — your pawn walks ${tiles}. Challenges block the path.`
})
</script>
<style lang="scss" scoped>
.board-overlay {
  position: absolute;
  inset: 0;
  // Pass-through host: empty space belongs to the stage's orbit drags; each
  // overlay piece opts back in for its own hit area.
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.stage-pending {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 1rem 1.6rem;
  animation: chip-in 0.3s ease-out;
}
</style>
