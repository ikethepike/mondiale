<template>
  <!-- A deck, not a list: the newest chip sits in front, near-simultaneous
       ones tuck behind it, peeking above — scaled back and faded by depth. -->
  <TransitionGroup v-if="visible.length" tag="ul" name="chip" class="cheer-toast">
    <li
      v-for="(group, index) in visible"
      :key="group.key"
      class="pane chip"
      :style="`--depth: ${visible.length - 1 - index}; z-index: ${index + 1}; ${
        senderFor(group) ? `--player-color: ${senderFor(group)?.color}` : ''
      }`"
    >
      <PlayerPawn v-if="senderFor(group)" class="pawn" :player="senderFor(group)!" />
      <span class="name">{{ senderFor(group)?.name || 'Someone' }}</span>
      <span class="emoji">{{ group.emoji }}</span>
      <!-- Keyed on count so each repeat re-mounts the badge and pops it -->
      <span v-if="group.count > 1" :key="group.count" class="count">×{{ group.count }}</span>
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import { useGameStore } from '~~/store/game.store'
import type { CheerEmoji } from '~~/types/events.types'
import { BOARD_PHASES } from '~~/types/player.type'

// Cheers aimed at the local player while they're OFF the board (mid-challenge,
// reading scores…) — on the board the floating pawn sprite covers it.
const gameStore = useGameStore()

const CHIP_TTL_MS = 4000
const MAX_CHIPS = 3

// 1s tick, running only while entries exist, so a lone chip still fades.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
const ensureTicker = () => {
  if (ticker) return
  ticker = setInterval(() => {
    now.value = Date.now()
    if (!gameStore.board.cheers.length && ticker) {
      clearInterval(ticker)
      ticker = undefined
    }
  }, 1000)
}
watch(
  () => gameStore.board.cheers.length,
  length => {
    if (length) ensureTicker()
  },
  { immediate: true }
)
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

interface CheerChip {
  key: string
  playerId: string
  emoji: CheerEmoji
  count: number
  at: number
}

// A burst from the same sender with the same emoji coalesces into one chip
// with a bumping ×N — three spammed claps never crowd out other senders.
const visible = computed<CheerChip[]>(() => {
  const me = gameStore.playerId
  const phase = gameStore.game?.players[me]?.phase
  if (!phase || BOARD_PHASES.includes(phase)) return []

  const groups = new Map<string, CheerChip>()
  for (const cheer of gameStore.board.cheers) {
    if (cheer.targetPlayerId !== me || cheer.at <= now.value - CHIP_TTL_MS) continue
    const key = `${cheer.playerId}:${cheer.emoji}`
    const group = groups.get(key)
    if (group) {
      group.count += 1
      group.at = Math.max(group.at, cheer.at)
    } else {
      groups.set(key, { key, playerId: cheer.playerId, emoji: cheer.emoji, count: 1, at: cheer.at })
    }
  }
  return [...groups.values()].slice(-MAX_CHIPS)
})

const senderFor = (group: CheerChip) => gameStore.game?.players[group.playerId]
</script>
<style lang="scss" scoped>
// The anchor point: chips hang off it absolutely, so the extra top room
// keeps the peeking older cards clear of the notch.
.cheer-toast {
  position: fixed;
  top: calc(3.2rem + var(--safe-top));
  right: 1rem;
  z-index: 10;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}

// Cascade by depth (0 = newest, in front): older cards slide up and left
// behind the front one, shrinking and fading — the whole restack animates.
.chip {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem;
  border-left: 0.3rem solid var(--player-color, var(--dark-blue));
  transform-origin: top right;
  transform: translate(calc(var(--depth, 0) * -0.6rem), calc(var(--depth, 0) * -0.9rem))
    scale(calc(1 - var(--depth, 0) * 0.05));
  opacity: calc(1 - var(--depth, 0) * 0.25);
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}

.pawn {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
}

.name {
  font-size: 1.3rem;
  max-width: 12rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.emoji {
  font-size: 1.8rem;
  line-height: 1;
}

.count {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--dark-blue);
  animation: count-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes count-pop {
  from {
    transform: scale(1.7);
  }
  to {
    transform: scale(1);
  }
}

// Enter springs in from the right into the front slot; exit drifts up and
// dissolves from wherever in the stack the chip sat (--depth still applies).
.chip-enter-from {
  opacity: 0;
  transform: translate(1.6rem, 0.4rem) scale(0.85);
}
.chip-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease-in;
}
.chip-leave-to {
  opacity: 0;
  transform: translate(calc(var(--depth, 0) * -0.6rem), calc(var(--depth, 0) * -0.9rem - 0.6rem))
    scale(calc(0.92 - var(--depth, 0) * 0.05));
}

@media (prefers-reduced-motion: reduce) {
  .chip,
  .chip-leave-active {
    transition: opacity 0.2s ease;
  }
  .chip-enter-from {
    transform: translate(0, 0) scale(1);
  }
  .chip-leave-to {
    transform: translate(calc(var(--depth, 0) * -0.6rem), calc(var(--depth, 0) * -0.9rem))
      scale(calc(1 - var(--depth, 0) * 0.05));
  }
  .count {
    animation: none;
  }
}
</style>
