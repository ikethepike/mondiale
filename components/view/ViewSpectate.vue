<template>
  <div v-if="game" class="spectate-stage">
    <!-- The booth: who's racing, what round, live feed — over the full map -->
    <header class="pane tl booth">
      <div class="pane-content booth-header">
        <span class="live-badge"><span class="live-dot" aria-hidden="true" />Live</span>
        <div class="booth-title">
          <span class="eyebrow">{{ raceOver ? 'Race complete' : 'Spectating' }}</span>
          <h1 v-if="raceOver">Final standings</h1>
          <h1 v-else-if="currentRound">
            Round {{ currentRound.number }} · {{ roundKindLabel }}
          </h1>
          <h1 v-else>Waiting for the first round</h1>
          <!-- The reveal headline stays sealed while racers are still answering:
               spectators see the drama, not the answer key. -->
          <p v-if="raceOver">Every racer has crossed the line — the crown is settled.</p>
          <p v-else-if="roundSettled && headline">{{ headline }}</p>
          <p v-else-if="currentRound">
            {{ answeredCount }} of {{ racers.length }} answered — the round is still open.
          </p>
        </div>
        <span class="watching" :title="`${gameStore.spectatorCount} watching`">
          👁 {{ gameStore.spectatorCount || 1 }}
        </span>
      </div>
    </header>

    <!-- The race rail: every pawn's live status and progress to the finish -->
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
            :class="{ finished: entry.status.done, leader: index === 0 && !raceOver }"
            :style="`--player-color: ${entry.player.color}; --progress: ${entry.progress}`"
          >
            <span class="rank">{{ index + 1 }}</span>
            <PlayerPawn class="pawn" :player="entry.player" />
            <span class="who">
              <span class="name">
                {{ entry.player.name || 'Player' }}
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
    <GuessTicker class="spectate-ticker" :entries="gameStore.map.liveGuesses" :players="game.players" />

    <RoundHistoryDrawer :game="game" />
  </div>
</template>
<script lang="ts" setup>
import RoundHistoryDrawer from '~/components/board/RoundHistoryDrawer.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { roundChallengeHeadline } from '~~/lib/challenge-headline'
import { useClientEvents } from '~~/lib/events/client-side'
import { getPlayerStatus } from '~~/lib/player-status'
import { KIND_LABELS, visitedCountries } from '~~/lib/victory-stats'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { CHEER_EMOJIS, type CheerEmoji } from '~~/types/events.types'

const { game, gameStore, update, clearBoard } = useClientEvents()

const racers = computed(() => gameStore.standings.filter(player => player.phase !== 'kicked'))
const raceOver = computed(
  () => racers.value.length > 0 && racers.value.every(player => !!player.completedAtRound)
)

const currentRound = toRef(gameStore, 'currentRound')
const roundKindLabel = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  return challenge ? KIND_LABELS[roundChallengeKind(challenge)] : ''
})
const headline = computed(() => roundChallengeHeadline(currentRound.value?.round.groupChallenge))

// A racer counts as "in" once their answer lands; finishers are past answering.
const answeredCount = computed(() => {
  const answers = currentRound.value?.round.groupAnswers ?? {}
  return racers.value.filter(player => answers[player.id] || player.completedAtRound).length
})
const roundSettled = computed(
  () => racers.value.length > 0 && answeredCount.value === racers.value.length
)

const rail = computed(() =>
  racers.value.map(player => ({
    player,
    status: getPlayerStatus(player),
    points: currentRound.value?.round.playerTurns[player.id]?.points.scored,
    progress: game.value?.tiles.length
      ? player.currentPosition / Math.max(1, game.value.tiles.length - 1)
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

// The map is the stage: glow every country the game has touched so far (the
// victory atlas treatment), refreshed as new rounds land.
const paintAtlas = () => {
  if (!game.value) return
  gameStore.map.tints = {}
  for (const isoCode of visitedCountries(game.value)) {
    gameStore.map.tints[isoCode] = 'inefficient'
  }
}
onMounted(() => {
  clearBoard()
  paintAtlas()
})
watch(() => game.value?.rounds.length, paintAtlas)
onBeforeUnmount(clearBoard)
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
  p {
    margin: 0.4rem 0 0;
    opacity: 0.7;
    font-size: 1.4rem;
  }
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

.watching {
  flex-shrink: 0;
  margin-left: auto;
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

// Live guesses land bottom-left, clear of the rail
.spectate-ticker {
  left: calc(1.5rem + var(--safe-left));
  bottom: calc(1.5rem + var(--safe-bottom));
  position: absolute;
  max-width: min(40rem, 60vw);
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
  .progress-fill {
    transition: none;
  }
}

// Phones: the booth and rail stack — booth on top, rail beneath it, both
// full-width; the ticker keeps the bottom edge.
@media screen and (max-width: $tablet) {
  .booth {
    left: 1rem;
    right: 1rem;
    top: calc(1rem + var(--safe-top));
    max-width: none;
  }

  .rail {
    left: 1rem;
    right: 1rem;
    width: auto;
    top: auto;
    bottom: calc(6rem + var(--safe-bottom));
    max-height: 55vh;
  }

  .spectate-ticker {
    max-width: calc(100vw - 2rem);
  }
}
</style>
