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

    <div
      v-if="blockedTurn && !gameStore.board.spectateTargetId"
      class="pane blocked-banner"
      role="status"
      aria-live="polite"
    >
      <div class="blocked-copy">
        <strong>The gate held</strong>
        <span>
          {{ blockedTurn.forfeitedSteps === 1 ? '1 step' : `${blockedTurn.forfeitedSteps} steps` }}
          forfeited — you stay put this turn.
        </span>
      </div>
    </div>

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
import BoardFallback from '~/components/board3d/BoardFallback.vue'
import SpectateHud from '~/components/board3d/SpectateHud.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { MOVE_INTERSTITIAL_HOLD_MS } from '~~/lib/round-beats'

// The dispatched view for the board phases. The persistent stage
// (BoardStage, in the layout) does the actual rendering — this host only
// carries what's drawn OVER the board: the move interstitial, the blocked
// banner, the booth HUD, the cold-start pane and the 2D fallback. It must
// never wrap ModalWrapper — the shell would eat the stage's orbit drags.
const { game, gameStore, currentRound } = useClientEvents()

// The board's subject: own seat, or the followed seat in the booth.
const subjectId = computed(() => gameStore.board.spectateTargetId ?? gameStore.seatId)
const subject = computed(() => game.value?.players[subjectId.value])

// A failed gate settles the walk with no hop to see — the banner says what
// the knock animation alone can't: the gate held, the banked steps are gone.
// Zero forfeited steps is the gauntlet knockout's stamp (it licenses the
// descent), not a gate story — the verdict card already told that one.
const blockedTurn = computed(() => {
  // YOUR seat, never the spectated one: "Blocked! — 3 steps forfeited" is a
  // first-person sting, and firing it while watching someone else read as the
  // viewer's own loss. `subjectId` follows the booth's camera, so it is the
  // wrong id for anything that speaks to the player.
  const seatId = gameStore.seatId
  if (!seatId) return undefined
  if (game.value?.players[seatId]?.phase !== 'movement-summary') return undefined
  const blocked = currentRound.value?.round.playerTurns[seatId]?.blocked
  return blocked && blocked.forfeitedSteps > 0 ? blocked : undefined
})

// The "On the move!" beat plays once per walk: only over a turn-OPENING walk
// (walkIntro, stamped by startWalk; the first step clears it) and remembered
// per seat+generation so an overlay remount mid-lead can't replay it. Its
// total fits inside the server's announce lead by construction (round-beats'
// fit test) — it never gates anything.
const introKey = computed(() =>
  subject.value ? `${subjectId.value}:${subject.value.walkSeq ?? 0}` : undefined
)
const showMoveInterstitial = computed(
  () =>
    subject.value?.phase === 'moving' &&
    !!subject.value.walkIntro &&
    !!introKey.value &&
    gameStore.board.introSeenKey !== introKey.value
)
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
@use '~/assets/scss/rules/ink' as *;
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

/* Same berth as the spectate HUD (they never show together — the banner is
   the own pawn's, the HUD a watched one's). */
// A setback, so it reads like one: the alert hue owns the whole card rather
// than one bold word, and a barred glyph carries the meaning before the
// sentence is read. `nowrap` on a phone pushed the tail off the edge — the
// line wraps now and the card centres its own text.
.blocked-banner {
  position: absolute;
  left: 50%;
  bottom: calc(1.4rem + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 3;
  gap: 0.9rem;
  display: flex;
  align-items: center;
  text-align: left;
  padding: 1rem 1.4rem;
  max-width: min(36rem, calc(100vw - 2.4rem));
  border-left: 0.3rem solid flame();
  animation: chip-in 0.3s var(--ease-out-expressive);

  // The barred circle, in the alert hue — the story at a glance.
  &::before {
    content: '';
    width: 2.2rem;
    height: 2.2rem;
    flex-shrink: 0;
    background: flame();
    mask: url('~/assets/icons/cross.svg') no-repeat center / 1.5rem;
    border-radius: 50%;
    box-shadow: inset 0 0 0 0.2rem flame(0.35);
  }
}

.blocked-copy {
  gap: 0.1rem;
  display: flex;
  flex-flow: column nowrap;
}

.blocked-banner strong {
  color: flame();
  font-size: 1.5rem;
  line-height: 1.2;
}

.blocked-banner span {
  font-size: 1.35rem;
  line-height: 1.3;
  opacity: 0.8;
}
</style>
