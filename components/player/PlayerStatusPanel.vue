<template>
  <aside class="pane tr status-panel" :class="{ folded }" aria-label="Player activity">
    <header class="panel-header">
      <button class="panel-title" type="button" :aria-expanded="!folded" @click="toggleFold">
        <span class="title-text">Who's doing what</span>
        <span class="chevron" aria-hidden="true">{{ folded ? '▸' : '▾' }}</span>
      </button>
      <button
        v-if="!folded"
        class="history-button"
        type="button"
        aria-label="Past rounds"
        @click.stop="gameStore.board.historyOpen = true"
      >
        {{ roundNumber ? `Round ${roundNumber}` : 'Rounds' }}
      </button>
    </header>
    <TransitionGroup tag="ul" name="row" class="rows">
      <li
        v-for="entry in entries"
        :key="entry.player.id"
        class="row"
        :class="{
          you: entry.you,
          busy: entry.status.busy,
          done: entry.status.done,
          clickable: !entry.you,
          spectating: entry.player.id === gameStore.board.spectateTargetId,
        }"
        :style="`--player-color: ${entry.player.color}; --progress: ${entry.progress}; --pending: ${entry.pending}`"
        :role="entry.you ? undefined : 'button'"
        :tabindex="entry.you ? undefined : 0"
        :aria-pressed="entry.you ? undefined : entry.player.id === gameStore.board.spectateTargetId"
        @click="toggleSpectate(entry)"
        @keydown.enter.prevent="toggleSpectate(entry)"
        @keydown.space.prevent="toggleSpectate(entry)"
      >
        <PlayerPawn class="pawn" :player="entry.player" />
        <span v-if="folded && entry.status.steps" class="steps-badge">{{
          entry.status.steps
        }}</span>
        <span v-if="!folded" class="who">
          <span class="name"
            >{{ entry.player.name || 'Player' }}<span v-if="entry.you" class="tag">you</span
            ><span v-if="entry.points" class="points">+{{ entry.points }}</span></span
          >
          <span class="status">
            <span v-if="entry.status.busy" class="pulse" aria-hidden="true" />
            {{ entry.status.label }}
          </span>
        </span>
        <button
          v-if="!folded && !entry.you"
          class="cheer-button"
          type="button"
          :aria-label="`Cheer ${entry.player.name || 'player'}`"
          :disabled="cheerCooldown"
          @click.stop="toggleStrip(entry.player.id)"
        >
          👏
        </button>
        <div v-if="!folded && strip === entry.player.id" class="cheer-strip" @click.stop>
          <button
            v-for="emoji in CHEER_EMOJIS"
            :key="emoji"
            class="cheer-option"
            type="button"
            :disabled="cheerCooldown"
            @click="sendCheer(entry.player.id, emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </li>
    </TransitionGroup>
  </aside>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { getPlayerStatus } from '~~/lib/player-status'
import { useGameStore } from '~~/store/game.store'
import { CHEER_EMOJIS, type CheerEmoji } from '~~/types/events.types'
import type { Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  players: Player[]
  currentPlayerId: string
  /** Current round's turns, for the "+N points" chips. */
  points?: Round['playerTurns']
  /** Total tile count, for the per-row progress hairline. */
  boardLength?: number
  /** Current round number — shown on the history button. */
  roundNumber?: number
}>()

const gameStore = useGameStore()

// Folded = compact avatar strip. Defaults to folded on phones ($tablet), where
// the full panel would cover most of the board; the toggle overrides per session.
const isSmallScreen = ref(false)
onMounted(() => {
  isSmallScreen.value = window.matchMedia('(max-width: 640px)').matches
})
const folded = computed(() => gameStore.board.panelFolded ?? isSmallScreen.value)
const toggleFold = () => {
  gameStore.board.panelFolded = !folded.value
}

// Row tap = watch that player's pawn (the 3D board reacts to the store).
const toggleSpectate = (entry: { player: Player; you: boolean }) => {
  strip.value = undefined
  if (entry.you) return
  gameStore.board.spectateTargetId =
    gameStore.board.spectateTargetId === entry.player.id ? undefined : entry.player.id
}

// Cheer picker: one open strip at a time, closed by outside taps. The 1s local
// cooldown is UX only — the server's token bucket is the real guard.
const { update } = useClientEvents()
const strip = ref<string>()
const cheerCooldown = ref(false)

const toggleStrip = (playerId: string) => {
  strip.value = strip.value === playerId ? undefined : playerId
}

const sendCheer = (targetPlayerId: string, emoji: CheerEmoji) => {
  update({ event: 'player-cheering', targetPlayerId, emoji })
  strip.value = undefined
  cheerCooldown.value = true
  setTimeout(() => {
    cheerCooldown.value = false
  }, 1000)
}

const closeStrip = () => {
  strip.value = undefined
}
onMounted(() => document.addEventListener('click', closeStrip))
onUnmounted(() => document.removeEventListener('click', closeStrip))

// You first, then the busy players (so "what's holding us up" is at the top),
// then everyone else. Kicked players drop out entirely.
const entries = computed(() =>
  props.players
    .map(player => {
      const status = getPlayerStatus(player)
      const span = Math.max(1, (props.boardLength ?? 1) - 1)
      return {
        player,
        you: player.id === props.currentPlayerId,
        status,
        points: props.points?.[player.id]?.points.scored,
        progress: props.boardLength ? player.currentPosition / span : 0,
        // Ghost tail: steps still queued this turn, drawn past the solid fill
        pending: props.boardLength && status.steps ? status.steps / span : 0,
      }
    })
    .filter(entry => !entry.status.gone)
    .sort((a, b) => {
      if (a.you !== b.you) return a.you ? -1 : 1
      if (a.status.busy !== b.status.busy) return a.status.busy ? -1 : 1
      return 0
    })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.status-panel {
  position: fixed;
  left: 0;
  // Sit below the diagnostics bar when it's present; otherwise near the top,
  // clear of any notch.
  top: calc(1.5rem + var(--safe-top));
  // Behind view content and modals (which sit at z-index >= 2) — this is an
  // ambient backdrop for the board, not something to fight the foreground.
  z-index: 1;
  width: min(28rem, 70vw);
  max-height: calc(var(--viewport-height) - 3rem);
  overflow-y: auto;
  padding: 1.3rem 1.3rem 1.1rem;
  // Round only the outer (right) corners; the flush-left edge stays square.
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.history-button {
  padding: 0.2rem 0.7rem;
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.15);
  border-radius: 1rem;
  background: none;
  color: inherit;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  cursor: pointer;
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  opacity: 0.55;
  text-align: left;
}

// One line always: if the header ever runs tight, the title ellipsizes
// instead of wrapping or clipping the round button.
.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  font-size: 1.4rem;
  line-height: 1;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.9rem;
}

.row {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 2.4rem 1fr auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.9rem;
  background: hsla(0, 0%, 100%, 0.5);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
  border-left: 0.3rem solid var(--player-color);

  // Board progress: a static hairline along the bottom edge — reads at a
  // glance without costing the row any height.
  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: calc(var(--progress, 0) * 100%);
    background: var(--player-color);
    opacity: 0.8;
  }

  // Faint continuation: where the pawn will stand once queued steps land
  &::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: calc(var(--progress, 0) * 100%);
    height: 2px;
    width: calc(var(--pending, 0) * 100%);
    background: var(--player-color);
    opacity: 0.3;
  }

  &.you {
    background: hsla(29.7, 79.9%, 72.7%, 0.22); // warm-sand wash
  }
  &.done {
    opacity: 0.75;
  }
  &.clickable {
    cursor: pointer;
  }
  &.spectating {
    outline: 2px solid var(--player-color);
    outline-offset: -2px;
  }
}

.cheer-button {
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.cheer-strip {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding-top: 0.2rem;
}

.cheer-option {
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border: none;
  border-radius: 0.7rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.pawn {
  width: 2.4rem;
  height: 2.4rem;
}

.who {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.name {
  font-size: 1.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag {
  margin-left: 0.5rem;
  font-size: 1rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.5;
}

.points {
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dark-blue);
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
}

.steps-badge {
  position: absolute;
  top: 0.15rem;
  right: 0.25rem;
  min-width: 1.5rem;
  padding: 0 0.3rem;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5rem;
  text-align: center;
  color: #fff;
  background: var(--player-color);
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  color: var(--dark-blue);
  opacity: 0.75;
}

// .pulse lives in assets/scss/templates/_pulse.scss — shared with LoadingRoom.

// Rows glide when the sort reorders (a player finishes / starts walking).
.row-move {
  transition: transform 0.4s var(--ease-smooth, ease);
}
.row-enter-active,
.row-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateX(-1rem);
}

// Folded: a slim avatar strip with step badges — the board stays visible.
.status-panel.folded {
  width: auto;
  padding: 0.9rem 0.8rem 0.8rem;

  .title-text {
    display: none;
  }
  .panel-header {
    margin-bottom: 0.7rem;
  }
  .panel-title {
    margin-bottom: 0.7rem;
    justify-content: center;
  }
  .rows {
    gap: 0.6rem;
  }
  .row {
    grid-template-columns: 2.4rem;
    padding: 0.4rem 0.5rem;
  }
}

@media (max-width: $tablet) {
  .status-panel {
    width: min(20rem, 70vw);
    padding: 1rem;
    font-size: 0.9em;
  }
  .status-panel.folded {
    width: auto;
  }
}
</style>
