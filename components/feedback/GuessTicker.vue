<template>
  <TransitionGroup tag="ul" name="guess" class="guess-ticker">
    <li
      v-for="entry in entries"
      :key="entry.entryId"
      class="chip guess-chip"
      :class="`kind-${entry.kind}`"
    >
      <PlayerPawn
        v-if="players[entry.playerId]"
        class="chip-pawn"
        :player="players[entry.playerId]"
      />
      <span class="chip-name">{{ players[entry.playerId]?.name ?? 'Someone' }}</span>
      <span class="chip-guess">{{ guessText(entry) }}</span>
    </li>
  </TransitionGroup>
</template>
<script lang="ts" setup>
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { countryName } from '~~/lib/country'
import type { GuessTickerEntry } from '~~/store/game.store'
import type { Player } from '~~/types/player.type'

defineProps<{
  entries: GuessTickerEntry[]
  players: Record<string, Player>
}>()

/**
 * Presence-only rounds carry no country, so the chip says what happened rather
 * than what was picked — the guess itself would narrow a shared hidden target.
 */
const guessText = (entry: GuessTickerEntry) => {
  const named = entry.label ?? (entry.isoCode ? countryName(entry.isoCode) : undefined)
  if (named) return `${named} ${entry.kind === 'correct' ? '✓' : '✗'}`
  switch (entry.kind) {
    case 'probe':
      return 'probed…'
    case 'locked':
      return 'buzzed ✗'
    case 'correct':
      return 'got it ✓'
    case 'presence':
      return 'answered'
    default:
      return 'guessed ✗'
  }
}
</script>
<style lang="scss" scoped>
.guess-ticker {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  min-height: 3rem;
  justify-content: center;
}

.guess-chip {
  // The accent edge carries the verdict; the pawn carries the player.
  border-left: 0.3rem solid var(--soft-blue);

  &.kind-wrong,
  &.kind-locked {
    border-left-color: var(--hior-ange);
  }
  &.kind-correct {
    border-left-color: var(--soft-mint);
  }
  &.kind-probe {
    border-left-color: var(--warm-sand);
  }
}

.chip-pawn {
  width: 1.4rem;
  height: 1.8rem;
}
.chip-name {
  font-weight: 600;
}
.chip-guess {
  opacity: 0.75;
}

// Each guess is its own node (keyed on entryId), so it pops in and fades out
// rather than mutating a chip already on screen. Reduced motion collapses the
// durations globally in _motion.scss, leaving a plain appear/vanish.
.guess-enter-from {
  opacity: 0;
  transform: translateY(0.6rem) scale(0.9);
}
.guess-enter-active,
.guess-move {
  transition:
    opacity var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);
}
.guess-leave-active {
  position: absolute;
  transition:
    opacity var(--motion-base) var(--ease-in-soft),
    transform var(--motion-base) var(--ease-in-soft);
}
.guess-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem) scale(0.9);
}
</style>
