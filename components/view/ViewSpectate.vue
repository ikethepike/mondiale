<template>
  <div v-if="game" class="spectate-stage" :class="`stage-${stage}`">
    <!-- The 3D board rides under everything while pawns are on the move -->
    <Transition name="stage-fade">
      <SpectateBoard v-if="stage === 'board' && followed" :followed-id="followed.id" />
    </Transition>

    <!-- The booth: who's racing, what round, live feed — over the full map -->
    <header class="pane tl booth">
      <div class="pane-content booth-header">
        <span class="live-badge"><span class="live-dot" aria-hidden="true" />Live</span>
        <div class="booth-title">
          <span class="eyebrow">{{ raceOver ? 'Race complete' : 'Spectating' }}</span>
          <h1 v-if="raceOver">Final standings</h1>
          <h1 v-else-if="currentRound">Round {{ currentRound.number }} · {{ roundKindLabel }}</h1>
          <h1 v-else>Waiting for the first round</h1>
          <p v-if="followed && !raceOver" class="follow-line">
            <PlayerPawn class="follow-pawn" :player="followed" />
            Following {{ followed.name || 'a racer' }} — {{ followedStatus }}
            <button
              v-if="gameStore.spectateFollowId"
              class="follow-release"
              type="button"
              @click="gameStore.spectateFollowId = undefined"
            >
              back to auto
            </button>
            <span v-else class="auto-tag">auto director</span>
          </p>
        </div>
        <div class="booth-controls">
          <button
            class="spoiler-toggle"
            type="button"
            :aria-pressed="gameStore.spectateHideSpoilers"
            @click="gameStore.spectateHideSpoilers = !gameStore.spectateHideSpoilers"
          >
            {{ gameStore.spectateHideSpoilers ? 'Spoilers hidden' : 'Spoilers shown' }}
          </button>
          <span class="watching" :title="`${gameStore.spectatorCount} watching`">
            👁 {{ gameStore.spectatorCount || 1 }}
          </span>
        </div>
      </div>
    </header>

    <!-- Centre stage: what the followed racer is looking at right now -->
    <Transition name="stage-fade" mode="out-in">
      <SpectateStage
        v-if="stage !== 'board'"
        :key="`${stage}-${followed?.id ?? 'none'}`"
        :stage="stage"
        :story="story"
        :followed="followed"
        :race-over="raceOver"
        :hide-spoilers="gameStore.spectateHideSpoilers"
      />
    </Transition>

    <!-- The race rail: every pawn's live status; tap a row to follow them -->
    <aside class="pane tr rail">
      <div class="pane-content">
        <header class="rail-header">
          <span class="eyebrow">The race</span>
          <button class="history-button" type="button" @click="gameStore.board.historyOpen = true">
            Past rounds
          </button>
        </header>
        <ul class="rail-rows">
          <li
            v-for="(entry, index) in rail"
            :key="entry.player.id"
            class="rail-row"
            role="button"
            tabindex="0"
            :class="{
              finished: entry.status.done,
              leader: index === 0 && !raceOver,
              followed: entry.player.id === followed?.id,
              pinned: entry.player.id === gameStore.spectateFollowId,
            }"
            :style="`--player-color: ${entry.player.color}; --progress: ${entry.progress}`"
            :aria-pressed="entry.player.id === gameStore.spectateFollowId"
            @click="toggleFollow(entry.player.id)"
            @keydown.enter.prevent="toggleFollow(entry.player.id)"
            @keydown.space.prevent="toggleFollow(entry.player.id)"
          >
            <span class="rank">{{ index + 1 }}</span>
            <PlayerPawn class="pawn" :player="entry.player" />
            <span class="who">
              <span class="name">
                {{ entry.player.name || 'Player' }}
                <span v-if="entry.player.id === followed?.id" class="camera-tag">🎥</span>
                <span v-if="entry.points !== undefined" class="points">+{{ entry.points }}</span>
              </span>
              <span class="status">
                <span v-if="entry.status.busy" class="pulse" aria-hidden="true" />
                {{
                  entry.player.completedAtRound
                    ? `Finished · round ${entry.player.completedAtRound}`
                    : entry.status.label
                }}
              </span>
            </span>
            <button
              class="cheer-button"
              type="button"
              :aria-label="`Cheer ${entry.player.name || 'player'}`"
              :disabled="cheerCooldown"
              @click.stop="toggleStrip(entry.player.id)"
            >
              👏
            </button>
            <div v-if="strip === entry.player.id" class="cheer-strip" @click.stop>
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
            <div class="progress-track" aria-hidden="true"><div class="progress-fill" /></div>
          </li>
        </ul>
        <nav class="rail-nav">
          <ButtonLine v-if="gameStore.spectating" @click="gameStore.spectating = false">
            <span>Back to your report</span>
          </ButtonLine>
          <ButtonLine v-else element="NuxtLink" to="/">
            <span>Leave — start your own game</span>
          </ButtonLine>
        </nav>
      </div>
    </aside>

    <!-- Opponent guesses landing in real time, same redaction the room gets -->
    <GuessTicker
      class="spectate-ticker"
      :entries="gameStore.map.liveGuesses"
      :players="game.players"
    />

    <RoundHistoryDrawer :game="game" />
  </div>
</template>
<script lang="ts" setup>
import RoundHistoryDrawer from '~/components/board/RoundHistoryDrawer.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import SpectateBoard from '~/components/spectate/SpectateBoard.vue'
import SpectateStage from '~/components/spectate/SpectateStage.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { getPlayerStatus } from '~~/lib/player-status'
import {
  finalStory,
  gateStory,
  pickDirectorTarget,
  roundStory,
  stageForPhase,
  type SpectateStory,
} from '~~/lib/spectate'
import { KIND_LABELS, visitedCountries } from '~~/lib/victory-stats'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { CHEER_EMOJIS, type CheerEmoji } from '~~/types/events.types'
import { boardProgress } from '~~/lib/player'

const { game, gameStore, update, clearBoard } = useClientEvents()

const racers = computed(() => gameStore.standings.filter(player => player.phase !== 'kicked'))
const raceOver = computed(
  () => racers.value.length > 0 && racers.value.every(player => !!player.completedAtRound)
)

// --- The director: who the camera follows ------------------------------------
// A pinned racer wins while they're still in the game; otherwise the auto
// director cuts to the most watchable moment (walking > gauntlet > gate > …).
const followed = computed(() => {
  const pinnedId = gameStore.spectateFollowId
  const pinned = pinnedId ? game.value?.players[pinnedId] : undefined
  if (pinned && pinned.phase !== 'kicked') return pinned
  return pickDirectorTarget(racers.value)
})

const followedStatus = computed(() =>
  followed.value ? getPlayerStatus(followed.value).label : ''
)

const toggleFollow = (playerId: string) => {
  strip.value = undefined
  gameStore.spectateFollowId = gameStore.spectateFollowId === playerId ? undefined : playerId
}

const stage = computed(() => {
  if (raceOver.value) return 'scores'
  return followed.value ? stageForPhase(followed.value.phase) : 'idle'
})

const currentRound = toRef(gameStore, 'currentRound')
const roundKindLabel = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  return challenge ? KIND_LABELS[roundChallengeKind(challenge)] : ''
})

/** The centre card's copy — also drives what the shared map paints. */
const story = computed<SpectateStory>(() => {
  const target = followed.value
  switch (stage.value) {
    case 'question':
      return roundStory(currentRound.value?.round.groupChallenge)
    case 'gate': {
      const gate = target?.moves[0]?.challenge
      return gate?._type === 'individual-challenge'
        ? gateStory(gate)
        : { kicker: 'Challenge gate', prompt: 'A gate blocks the path…' }
    }
    case 'final': {
      const gauntlet = target?.moves[0]?.challenge
      return gauntlet?._type === 'final-challenge'
        ? finalStory(gauntlet.challenges[0])
        : { kicker: 'Final gauntlet', prompt: 'The gauntlet is being dealt…' }
    }
    default:
      return {
        kicker: target?.name ? `Following ${target.name}` : 'Between moments',
        prompt: target ? getPlayerStatus(target).label : 'Waiting for the race…',
      }
  }
})

const rail = computed(() =>
  racers.value.map(player => ({
    player,
    status: getPlayerStatus(player),
    points: currentRound.value?.round.playerTurns[player.id]?.points.scored,
    progress: game.value?.tiles.length
      ? boardProgress(player.currentPosition, game.value.tiles.length)
      : 0,
  }))
)

// Cheer picker: same pattern as the board's status panel — one open strip,
// closed by outside taps, 1s local cooldown (the server bucket is the guard).
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

// --- The map is the stage's backdrop -----------------------------------------
// The story's focus countries glow and the camera frames them; with nothing
// to point at (scores, idle), fall back to the game's atlas glow. The 3D
// board covers the map entirely, so painting pauses there.
const paintMap = () => {
  if (!game.value || stage.value === 'board') return

  // clearBoard() also resets the live-guess ticker; snapshot and restore it so
  // a repaint mid-round (border-chain / heritage focus shifts) can't wipe
  // in-flight guess chips.
  const guesses = gameStore.map.liveGuesses
  clearBoard()
  gameStore.map.liveGuesses = guesses

  // Hiding spoilers pulls the focus glow too — it would point straight at the
  // answer country. Fall back to the game's atlas glow.
  const focus = gameStore.spectateHideSpoilers ? undefined : story.value.focus
  if (focus?.length) {
    for (const isoCode of focus) gameStore.map.tints[isoCode] = 'endpoint'
    gameStore.map.focus = [...focus]
    return
  }

  for (const isoCode of visitedCountries(game.value)) {
    gameStore.map.tints[isoCode] = 'inefficient'
  }
}

// Keyed repaint: snapshots land every 500ms during walks and would otherwise
// re-fit the map camera on identical focus sets. The spoiler flag is in the
// key so toggling it repaints immediately.
const paintKey = computed(
  () =>
    `${stage.value}|${gameStore.spectateHideSpoilers}|${(story.value.focus ?? []).join(',')}`
)
onMounted(paintMap)
watch(paintKey, paintMap)
onBeforeUnmount(() => {
  gameStore.spectateFollowId = undefined
  clearBoard()
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
$hairline: hsla(215.7, 76.4%, 21.6%, 0.12);

.spectate-stage {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  position: absolute;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.booth {
  position: absolute;
  top: calc(1.5rem + var(--safe-top));
  left: calc(1.5rem + var(--safe-left));
  max-width: min(46rem, calc(100% - 3rem));
}

.booth-header {
  gap: 1.4rem;
  display: flex;
  align-items: flex-start;
}

.live-badge {
  gap: 0.5rem;
  display: flex;
  flex-shrink: 0;
  margin-top: 0.3rem;
  align-items: center;
  font-size: 1.1rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dark-blue);
}

.live-dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background: #c0392b;
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  50% {
    opacity: 0.35;
  }
}

.booth-title {
  h1 {
    margin: 0;
    font-size: 2.4rem;
    color: var(--dark-blue);
  }
}

.follow-line {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin: 0.5rem 0 0;
  opacity: 0.85;
  font-size: 1.35rem;
}

.follow-pawn {
  width: 1.8rem;
  height: 1.8rem;
}

.auto-tag {
  padding: 0.1rem 0.6rem;
  border-radius: 1rem;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
  opacity: 0.8;
}

.follow-release {
  padding: 0.1rem 0.6rem;
  border: 1px solid $hairline;
  border-radius: 1rem;
  background: none;
  color: inherit;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.eyebrow {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.4rem;
}

.booth-controls {
  gap: 0.6rem;
  display: flex;
  flex-shrink: 0;
  margin-left: auto;
  align-items: center;
}

.spoiler-toggle {
  padding: 0.3rem 0.8rem;
  border: 1px solid $hairline;
  border-radius: 1rem;
  background: none;
  color: inherit;
  font-size: 1.1rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;

  &[aria-pressed='true'] {
    color: var(--dark-blue);
    border-color: var(--dark-blue);
    background: hsla(29.7, 79.9%, 72.7%, 0.18);
  }
}

.watching {
  flex-shrink: 0;
  font-size: 1.4rem;
  opacity: 0.7;
  white-space: nowrap;
}

// --- The race rail -----------------------------------------------------------
.rail {
  position: absolute;
  right: calc(1.5rem + var(--safe-right));
  top: calc(1.5rem + var(--safe-top));
  width: min(36rem, calc(100% - 3rem));
  max-height: calc(var(--viewport-height) - 3rem - var(--safe-top));
  overflow-y: auto;
}

.rail-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1.4rem;
  padding-bottom: 1rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }
}

.history-button {
  padding: 0.2rem 0.7rem;
  border: 1px solid $hairline;
  border-radius: 1rem;
  background: none;
  color: inherit;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  cursor: pointer;
}

.rail-rows {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
  list-style: none;
}

.rail-row {
  display: grid;
  grid-template-columns: 2rem 2.4rem 1fr auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.6rem 0.8rem 1rem;
  border-radius: 0.9rem;
  position: relative;
  cursor: pointer;
  background: hsla(0, 0%, 100%, 0.5);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
  border-left: 0.3rem solid var(--player-color);

  &.leader {
    outline: 0.2rem solid var(--warm-sand);
    outline-offset: 0.2rem;
  }
  &.finished {
    opacity: 0.8;
  }
  &.followed {
    background: hsla(29.7, 79.9%, 72.7%, 0.22); // warm-sand wash
  }
  &.pinned {
    outline: 0.2rem solid var(--player-color);
    outline-offset: -0.2rem;
  }
}

.rank {
  opacity: 0.45;
  font-size: 1.4rem;
  font-weight: bold;
  text-align: right;
}

.leader .rank {
  opacity: 1;
  color: var(--dark-blue);
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

.camera-tag {
  font-size: 1.2rem;
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

.status {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  font-size: 1.25rem;
  color: var(--dark-blue);
  opacity: 0.75;
}

// .pulse comes from assets/scss/templates/_pulse.scss (shared)

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

// Progress to the finish line: a track along the row's bottom edge
.progress-track {
  left: 0;
  bottom: 0;
  height: 0.3rem;
  width: 100%;
  position: absolute;
  border-radius: 0 0 0.9rem 0.9rem;
  overflow: hidden;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
}

.progress-fill {
  height: 100%;
  width: calc(var(--progress, 0) * 100%);
  background: var(--player-color);
  transition: width 0.5s var(--ease-smooth, ease);
}

.rail-nav {
  margin-top: 1.6rem;
  padding-top: 1.4rem;
  border-top: 0.1rem solid $hairline;
}

// Live guesses land bottom-left, clear of the rail and the stage card
.spectate-ticker {
  left: calc(1.5rem + var(--safe-left));
  bottom: calc(1.5rem + var(--safe-bottom));
  position: absolute;
  max-width: min(30rem, 24vw);
}

// Stage swaps dissolve — a broadcast cut, not a hard pop
.stage-fade-enter-active,
.stage-fade-leave-active {
  transition: opacity 0.35s ease;
}
.stage-fade-enter-from,
.stage-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
  .progress-fill {
    transition: none;
  }
  .stage-fade-enter-active,
  .stage-fade-leave-active {
    transition: none;
  }
}

// Phones: absolutes give way to a scrollable stack — booth, stage card, rail —
// so nothing fights for the same bottom edge. The board keeps full-screen.
@media screen and (max-width: $tablet) {
  .spectate-stage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding: calc(1rem + var(--safe-top)) 1rem calc(1rem + var(--safe-bottom));
  }

  .booth,
  .rail,
  :deep(.stage-card) {
    position: static;
    width: auto;
    max-width: none;
    max-height: none;
    transform: none;
    flex-shrink: 0;
  }

  .spectate-board {
    position: fixed;
    inset: 0;
  }

  .spectate-ticker {
    position: fixed;
    left: 1rem;
    bottom: calc(1rem + var(--safe-bottom));
    max-width: calc(100vw - 2rem);
  }
}
</style>
