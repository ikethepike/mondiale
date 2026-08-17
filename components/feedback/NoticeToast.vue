<template>
  <TransitionGroup v-if="visible.length" tag="ul" name="notice" class="notice-toast">
    <li v-for="entry in visible" :key="entry.entryId" class="notice" role="status">
      <span class="dot" :class="entry.kind" />
      {{ lineFor(entry) }}
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import { TABLE_NOTICE_TTL_MS } from '~~/lib/events/client/table-notice.event'
import { playerDisplayName } from '~~/lib/player'
import { useEphemeralTicker } from '~~/lib/use-ephemeral-ticker'
import { useGameStore, type TableNoticeEntry } from '~~/store/game.store'

/**
 * Quiet table announcements (the autopilot taking or returning a seat, a
 * bot leaving), mounted by the layout beside the cheer toast so they surface
 * whatever the player is looking at. The affected player never needs their
 * own line — the takeover finds them gone, and the return plays their
 * catch-up interstitial.
 */
const gameStore = useGameStore()

// The shared ephemeral clock owns the prune: a list that never drained kept
// the 1s interval alive for the rest of the session.
const now = useEphemeralTicker(
  () => gameStore.board.notices,
  fresh => (gameStore.board.notices = fresh),
  TABLE_NOTICE_TTL_MS
)

const visible = computed(() =>
  gameStore.board.notices.filter(
    entry => entry.at > now.value - TABLE_NOTICE_TTL_MS && entry.playerId !== gameStore.playerId
  )
)

const NOTICE_LINES: Record<TableNoticeEntry['kind'], (name: string) => string> = {
  'autopilot-engaged': name => `${name} drifted off — autopilot takes the seat`,
  'autopilot-reclaimed': name => `${name} is back at the helm`,
  'bot-removed': name => `${name} left the table`,
}

const lineFor = (entry: TableNoticeEntry): string =>
  NOTICE_LINES[entry.kind](playerDisplayName(gameStore.game?.players[entry.playerId]))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/status-pill' as *;

// The shared status-pill recipe, stacked — same shell as the reconnect
// line, one home for both (rules/_status-pill.scss).
.notice-toast {
  @include status-pill-anchor;
  // Below the reconnect pill: a connection warning outranks table chatter.
  z-index: 2900;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

.notice {
  @include status-pill;
}

.dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background: #{ember()};

  &.autopilot-reclaimed,
  &.bot-removed {
    background: #{milk(0.7)};
  }
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(-0.8rem);
}

@media (prefers-reduced-motion: reduce) {
  .notice-enter-from,
  .notice-leave-to {
    transform: none;
  }
}
</style>
