<template>
  <footer ref="bar" class="spectate-bar">
    <div class="bar-brief">
      <span class="live-badge"><span class="live-dot" aria-hidden="true" />Live</span>
      <span class="round-label">{{ headline }}</span>
      <span class="watching" :aria-label="`${gameStore.spectatorCount} watching`">
        <span aria-hidden="true">👁</span> {{ gameStore.spectatorCount }}
      </span>
    </div>

    <ul class="bar-chips" aria-label="Racers — tap to follow">
      <li v-for="entry in rail" :key="entry.player.id">
        <button
          type="button"
          class="racer-chip player-accent"
          :class="{
            followed: entry.player.id === followed?.id,
            pinned: entry.player.id === gameStore.spectateFollowId,
            finished: entry.status.done,
          }"
          :style="`--player-color: ${entry.player.color}; --progress: ${entry.progress}`"
          :aria-pressed="entry.player.id === gameStore.spectateFollowId"
          :aria-label="`${entry.player.name || 'Player'} — ${entry.status.label}${
            entry.player.id === followed?.id ? ', on camera' : ''
          }`"
          :title="`${entry.player.name || 'Player'} — ${entry.status.label}`"
          @click="toggleFollow(entry.player.id)"
        >
          <PlayerPawn class="pawn" :player="entry.player" />
          <span class="name">
            {{ entry.player.name || 'Player' }}
            <span v-if="entry.player.id === followed?.id" class="camera-tag" aria-hidden="true"
              >🎥</span
            >
          </span>
          <span v-if="entry.points !== undefined" class="points">+{{ entry.points }}</span>
          <span class="progress-track" aria-hidden="true"><span class="progress-fill" /></span>
        </button>
      </li>
      <li v-if="followed" class="cheer-cell">
        <button
          class="cheer-button"
          type="button"
          :aria-label="`Cheer ${followed.name || 'the racer'}`"
          :aria-expanded="stripOpen"
          :disabled="cheerCooldown"
          @click.stop="stripOpen = !stripOpen"
        >
          👏
        </button>
        <div v-if="stripOpen" class="cheer-strip" @click.stop>
          <button
            v-for="emoji in CHEER_EMOJIS"
            :key="emoji"
            class="cheer-option"
            type="button"
            :disabled="cheerCooldown"
            @click="sendCheer(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </li>
    </ul>

    <nav class="bar-actions">
      <button
        class="bar-action"
        type="button"
        :aria-pressed="gameStore.spectateHideSpoilers"
        @click="gameStore.spectateHideSpoilers = !gameStore.spectateHideSpoilers"
      >
        {{ gameStore.spectateHideSpoilers ? 'Spoilers hidden' : 'Spoilers shown' }}
      </button>
      <button class="bar-action" type="button" @click="gameStore.board.historyOpen = true">
        Past rounds
      </button>
      <button
        v-if="gameStore.spectating"
        class="bar-action leave"
        type="button"
        @click="gameStore.spectating = false"
      >
        Back to your report
      </button>
      <NuxtLink v-else class="bar-action leave" to="/">Leave</NuxtLink>
    </nav>
  </footer>
</template>

<script lang="ts" setup>
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { boardProgress } from '~~/lib/player'
import { getPlayerStatus } from '~~/lib/player-status'
import { KIND_LABELS } from '~~/lib/victory-stats'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { CHEER_COOLDOWN_MS, CHEER_EMOJIS, type CheerEmoji } from '~~/types/events.types'
import type { Player } from '~~/types/player.type'

/**
 * The booth's one control surface, standing where a racer's console would —
 * the console hides in watch mode, so this band is free by construction.
 * Deliberately does NOT reserve a map berth: `gameStore.map.berth` is a
 * single-owner slot and the mounted views' own footers already claim it; a
 * second ResizeObserver here made the reservation oscillate and a director
 * cut's unmount wiped whichever owner was left.
 */
const props = defineProps<{ followed?: Player; raceOver: boolean }>()

const { game, gameStore, update, currentRound } = useClientEvents()

const headline = computed(() => {
  if (props.raceOver) return 'Final standings'
  const round = currentRound.value
  if (!round) return 'Waiting for the first round'
  return `Round ${round.number} · ${KIND_LABELS[roundChallengeKind(round.round.groupChallenge)].title}`
})

const rail = computed(() =>
  gameStore.standings
    .filter(player => player.phase !== 'kicked')
    .map(player => ({
      player,
      status: getPlayerStatus(player),
      points: currentRound.value?.round.playerTurns[player.id]?.points.scored,
      progress: game.value?.tiles.length
        ? boardProgress(player.currentPosition, game.value.tiles.length)
        : 0,
    }))
)

const toggleFollow = (playerId: string) => {
  stripOpen.value = false
  gameStore.spectateFollowId = gameStore.spectateFollowId === playerId ? undefined : playerId
}

// Cheer strip: one open strip, outside taps close it, 1s local cooldown (the
// server bucket is the guard). Aimed at the followed racer.
const stripOpen = ref(false)
const cheerCooldown = ref(false)
const sendCheer = (emoji: CheerEmoji) => {
  if (!props.followed) return
  update({ event: 'player-cheering', targetPlayerId: props.followed.id, emoji })
  stripOpen.value = false
  cheerCooldown.value = true
  setTimeout(() => {
    cheerCooldown.value = false
  }, CHEER_COOLDOWN_MS)
}
const closeStrip = () => {
  stripOpen.value = false
}
onMounted(() => document.addEventListener('click', closeStrip))
onUnmounted(() => document.removeEventListener('click', closeStrip))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.spectate-bar {
  position: absolute;
  left: 50%;
  bottom: calc(1rem + var(--bottom-clearance, 0rem));
  transform: translateX(-50%);
  // Above the shell chrome (2-3), below the round clock (5)
  z-index: 4;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 1.2rem;
  max-width: min(96rem, calc(100vw - 2rem));
  padding: 0.6rem 1rem;
  border-radius: 1.4rem;
  background: milk(0.88);
  border: 0.1rem solid ink(0.18);
  backdrop-filter: blur(0.6rem);
}

.bar-brief {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.live-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: flame();
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  50% {
    opacity: 0.35;
  }
}

.round-label {
  font-size: 1.3rem;
  white-space: nowrap;
}

.watching {
  font-size: 1.2rem;
  opacity: 0.7;
}

.bar-chips {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: none;
}

.racer-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem 0.5rem;
  // Longhands on purpose: the border SHORTHAND would reset the left edge
  // that .player-accent owns (the identity stripe this chip wears)
  border-width: 0.1rem;
  border-style: solid;
  border-color: ink(0.15);
  border-radius: 1rem;
  background: milk(0.7);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;

  &.followed {
    border-color: var(--player-color);
    background: milk(1);
  }

  &.pinned {
    box-shadow: 0 0 0 0.15rem var(--player-color);
  }

  &.finished {
    opacity: 0.6;
  }

  .pawn {
    width: 1.6rem;
    height: 1.6rem;
    flex-shrink: 0;
  }

  .name {
    font-size: 1.25rem;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .points {
    font-size: 1.1rem;
    opacity: 0.7;
  }

  .progress-track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0.25rem;
    background: ink(0.08);
  }

  .progress-fill {
    display: block;
    height: 100%;
    width: calc(var(--progress, 0) * 100%);
    background: var(--player-color);
  }
}

.cheer-cell {
  position: relative;
}

.cheer-button {
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.3rem;

  &:disabled {
    opacity: 0.4;
  }
}

.cheer-strip {
  position: absolute;
  bottom: calc(100% + 0.6rem);
  right: 0;
  display: flex;
  gap: 0.3rem;
  padding: 0.4rem 0.6rem;
  border-radius: 1rem;
  background: milk(0.95);
  border: 0.1rem solid ink(0.15);
}

.cheer-option {
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.bar-action {
  border: none;
  border-radius: 0.8rem;
  padding: 0.4rem 0.7rem;
  background: ink(0.06);
  font-size: 1.2rem;
  color: inherit;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;

  &[aria-pressed='true'] {
    background: ink(0.16);
  }

  &.leave {
    background: none;
    opacity: 0.7;
  }
}

@media screen and (max-width: $tablet) {
  // FIXED, not static: mounted views are absolute full-bleed, so in the
  // booth's phone flex column a static bar would float to the TOP of the
  // stage over the mounted view's header. Pinned to the bottom edge the bar
  // overlays exactly where a racer's console would sit, on every stage.
  .spectate-bar {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: calc(1rem + var(--bottom-clearance, 0rem));
    transform: none;
    flex-wrap: wrap;
    max-width: none;
  }

  .bar-chips {
    order: 3;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}
</style>
