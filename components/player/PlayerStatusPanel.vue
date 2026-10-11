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
        class="row player-accent"
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
          <span class="name">
            <span class="name-text">{{ entry.player.name || 'Player' }}</span>
            <span v-if="entry.you" class="tag">you</span>
            <span v-if="entry.points" class="points">+{{ entry.points }}</span>
          </span>
          <span class="status">
            <span v-if="entry.status.busy" class="pulse" aria-hidden="true" />
            <span class="status-text">{{
              entry.player.retiring ? 'Leaving after this round' : entry.status.label
            }}</span>
          </span>
        </span>
        <span v-if="!folded && !entry.you" class="actions">
          <button
            v-if="isPlayerHost && entry.player.bot && !entry.player.retiring"
            class="action-button remove-bot-button"
            type="button"
            :aria-label="`Remove ${entry.player.name || 'bot'} from the game`"
            :title="`Remove ${entry.player.name || 'bot'}`"
            @click.stop="removeBot(entry.player.id)"
          ></button>
          <button
            class="action-button cheer-button"
            type="button"
            :aria-label="`Cheer ${entry.player.name || 'player'}`"
            :disabled="cheerCooldown"
            @click.stop="toggleStrip(entry.player.id)"
          >
            👏
          </button>
        </span>
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
import { CHEER_COOLDOWN_MS, CHEER_EMOJIS, type CheerEmoji } from '~~/types/events.types'
import type { Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { boardProgress } from '~~/lib/player'
import { useIsPhone } from '~~/lib/use-viewport'

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
const isSmallScreen = useIsPhone()
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
const { update, isPlayerHost } = useClientEvents()

// Mid-race bot removal (host-only): the seat plays out its round, then the
// brain retires it — the row shows "Leaving after this round" until it goes.
const removeBot = (targetId: string) => {
  update({ event: 'remove-bot', targetId })
}
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
  }, CHEER_COOLDOWN_MS)
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
      // The whole table, so a finished seat can say WHICH place it took.
      const status = getPlayerStatus(player, props.players)
      const span = Math.max(1, (props.boardLength ?? 1) - 1)
      return {
        player,
        you: player.id === props.currentPlayerId,
        status,
        points: props.points?.[player.id]?.points.scored,
        progress: props.boardLength ? boardProgress(player.currentPosition, props.boardLength) : 0,
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
@use '~/assets/scss/rules/ink' as *;
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
  border: 1px solid ink(0.15);
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
  --bar-inset: 0.8rem;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem var(--bar-inset) 1.1rem;
  border-radius: 0.9rem;
  background: glass(0.5);
  border: 1px solid ink(0.08);

  // Inset past the corner radius: flush to the edge, a short fill was sliced
  // by the rounded corner into a blob. The pending layer sits under the fill.
  &::after {
    content: '';
    position: absolute;
    left: var(--bar-inset);
    right: var(--bar-inset);
    bottom: 0.45rem;
    height: 0.3rem;
    border-radius: 0.15rem;
    background:
      linear-gradient(var(--player-color), var(--player-color)) 0 0 /
        calc(var(--progress, 0) * 100%) 100% no-repeat,
      linear-gradient(
          color-mix(in srgb, var(--player-color) 35%, transparent),
          color-mix(in srgb, var(--player-color) 35%, transparent)
        )
        0 0 / calc((var(--progress, 0) + var(--pending, 0)) * 100%) 100% no-repeat,
      ink(0.07);
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

// Stacked, so a host's bot rows don't spend two button widths of the name column.
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.action-button {
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: ink(0.08);
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.cheer-button {
  font-size: 1.3rem;
  line-height: 1;
}

// Host-only mid-race bot removal: the kick affordance's language (a masked
// cross), quiet at rest — removal shouldn't shout on every row.
.remove-bot-button {
  position: relative;
  color: var(--dark-blue);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0.55;
    mask: url('~/assets/icons/cross.svg') no-repeat center/45%;
  }

  &:hover::after {
    opacity: 1;
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
  background: ink(0.08);
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
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
  font-size: 1.5rem;
  line-height: 1.2;
}

.name-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag,
.points {
  flex-shrink: 0;
}

.tag {
  font-size: 1rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.5;
}

.points {
  padding: 0.1rem 0.5rem;
  border-radius: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dark-blue);
  background: ink(0.08);
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
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 1.25rem;
  line-height: 1.3;
  color: var(--dark-blue);
  opacity: 0.75;

  // Centres the dot on the FIRST line when the label wraps.
  .pulse {
    margin-top: calc((1.3em - 0.7rem) / 2);
  }
}

.status-text {
  min-width: 0;
  overflow-wrap: break-word;
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
    --bar-inset: 0.5rem;
    grid-template-columns: 2.4rem;
    padding: 0.4rem var(--bar-inset) 0.8rem;

    &::after {
      bottom: 0.3rem;
    }
  }
}

@media (max-width: $tablet) {
  .status-panel {
    width: min(27rem, 80vw);
    padding: 1rem;
  }
  .panel-header {
    gap: 0.6rem;
  }
  .panel-title {
    letter-spacing: 0.05em;
  }
  .history-button {
    padding: 0.2rem 0.6rem;
    letter-spacing: 0.05em;
  }
  .status-panel.folded {
    width: auto;
  }
}
</style>
