<template>
  <div v-if="game" class="spectate-stage" :class="`stage-${stage}`">
    <!-- The 3D board rides under everything while pawns are on the move -->
    <Transition name="stage-fade">
      <SpectateBoard v-if="stage === 'board' && followed" :followed-id="followed.id" />
    </Transition>

    <!-- Centre stage: what the followed racer is looking at right now. Keyed
         on the SUBJECT only: the same racer's phase changes swap the card's
         content in place (no transition, no blank stage), while a real
         director cut gets a quick out-in. Mountable round kinds render the
         REAL challenge view read-only through the followed seat; the rest
         keep their story cards. -->
    <Transition name="shot-cut" mode="out-in">
      <SpectateMount
        v-if="mountedView"
        :key="`mount-${followed?.id ?? 'none'}-${mountedView.key}`"
        :view="mountedView"
        :veiled="veiled"
      />
      <SpectateStage
        v-else-if="stage !== 'board'"
        :key="followed?.id ?? 'none'"
        :stage="stage"
        :story="story"
        :followed="followed"
        :race-over="raceOver"
        :hide-spoilers="gameStore.spectateHideSpoilers"
      />
    </Transition>

    <!-- The booth's one control surface: round brief, follow chips, cheer,
         spoilers, history, leave — standing where a racer's console would,
         a band the hidden watch-mode console leaves free. -->
    <SpectateBar :followed="followed" :race-over="raceOver" />

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
import SpectateBar from '~/components/spectate/SpectateBar.vue'
import SpectateBoard from '~/components/spectate/SpectateBoard.vue'
import SpectateMount from '~/components/spectate/SpectateMount.vue'
import SpectateStage from '~/components/spectate/SpectateStage.vue'
import { resolveChallengeView } from '~/components/view/dispatch'
import { useClientEvents } from '~~/lib/events/client-side'
import { getPlayerStatus } from '~~/lib/player-status'
import {
  MOUNTABLE_KINDS,
  nextDirectorShot,
  roundSettled,
  roundStory,
  stageForPhase,
  type DirectorShot,
  type SpectateStory,
} from '~~/lib/spectate'
import { visitedCountries } from '~~/lib/victory-stats'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

const { game, gameStore, clearBoard } = useClientEvents()

const racers = computed(() => gameStore.standings.filter(player => player.phase !== 'kicked'))
const raceOver = computed(
  () => racers.value.length > 0 && racers.value.every(player => !!player.completedAtRound)
)

// --- The director: who the camera follows ------------------------------------
// A pinned racer wins while they're still in the game; otherwise the auto
// director cuts to the most watchable moment (walking > gauntlet > gate > …)
// through the shot-memory layer — snapshots land every ~500ms during walks,
// and nextDirectorShot's dwell rules are what keep the camera from thrashing.
// Pinning clears the memory, so releasing the pin cuts fresh immediately.
const shot = ref<DirectorShot>()
watch(
  [racers, () => gameStore.spectateFollowId],
  () => {
    if (gameStore.spectateFollowId) {
      shot.value = undefined
      return
    }
    shot.value = nextDirectorShot(shot.value, racers.value, Date.now())
  },
  { immediate: true }
)

const followed = computed(() => {
  const pinnedId = gameStore.spectateFollowId
  const pinned = pinnedId ? game.value?.players[pinnedId] : undefined
  if (pinned && pinned.phase !== 'kicked') return pinned
  return shot.value ? game.value?.players[shot.value.targetId] : undefined
})

const stage = computed(() => {
  if (raceOver.value) return 'scores'
  return followed.value ? stageForPhase(followed.value.phase) : 'idle'
})

// The booth is spectateSeatId's ONE writer: mounted views resolve their seat
// through it, so the whole read-only fidelity rides this line.
watch(
  () => followed.value?.id,
  id => {
    gameStore.spectateSeatId = id
  },
  { immediate: true }
)

/** The real challenge view for the followed seat. Question stages mount when
 *  the round kind is on the verified allowlist; scores, gates and the final
 *  gauntlet mount unconditionally (all snapshot-driven). Board stays
 *  SpectateBoard, idle stages stay cards, race-over keeps final standings. */
const MOUNTED_STAGES = ['question', 'scores', 'gate', 'final']
const mountedView = computed(() => {
  if (!followed.value || raceOver.value) return undefined
  if (!MOUNTED_STAGES.includes(stage.value)) return undefined
  const round = currentRound.value?.round
  if (!round) return undefined
  if (
    stage.value === 'question' &&
    !MOUNTABLE_KINDS.includes(roundChallengeKind(round.groupChallenge))
  ) {
    return undefined
  }
  return resolveChallengeView(followed.value.phase, round)
})

// Spoiler policy over mounted views: pre-reveal they show only what the racer
// sees, so the leaks are reveal states reached EARLY — the followed seat's
// banked answer, an early scores screen, or a turn-based mode's finished
// state during its reveal hold (the whole table sees the answer before any
// groupAnswers bank). Central veil, no per-view discipline; its backdrop
// blur covers the shared map too.
const veiled = computed(() => {
  if (!gameStore.spectateHideSpoilers || !mountedView.value) return false
  const round = currentRound.value?.round
  if (!round) return false
  const challenge = round.groupChallenge
  const modeFinished =
    '_type' in challenge &&
    'state' in challenge &&
    !!(challenge.state as { finished?: boolean }).finished
  const seatRevealed =
    !!followed.value &&
    (!!round.groupAnswers[followed.value.id] || stage.value === 'scores' || modeFinished)
  return seatRevealed && !roundSettled(racers.value, round.groupAnswers)
})

const currentRound = toRef(gameStore, 'currentRound')

/** The centre card's copy — the fallback stages only (unmountable question
 *  kinds and idle beats); gates, finals and scores always mount real views. */
const story = computed<SpectateStory>(() => {
  const target = followed.value
  switch (stage.value) {
    case 'question':
      return roundStory(currentRound.value?.round.groupChallenge)
    default:
      // The idle stages that used to read as a broken card: the whole table
      // reading the rules at game open, or a finisher the director lingers on.
      if (target?.phase === 'tutorial') {
        return {
          kicker: 'Warming up',
          prompt: 'The racers are reading the rules — the first round is moments away.',
        }
      }
      if (target?.phase === 'victory') {
        return {
          kicker: `${target.name || 'A racer'} has finished`,
          prompt: 'Across the line — waiting on the rest of the field.',
        }
      }
      return {
        kicker: target?.name ? `Following ${target.name}` : 'Between moments',
        prompt: target ? getPlayerStatus(target).label : 'Waiting for the race…',
      }
  }
})

// --- The map is the stage's backdrop -----------------------------------------
// The story's focus countries glow and the camera frames them; with nothing
// to point at (scores, idle), fall back to the game's atlas glow. The 3D
// board covers the map entirely, so painting pauses there.
const paintMap = () => {
  if (!game.value || stage.value === 'board') return
  // A mounted view owns the map — the booth painting under it would fight
  // the very fidelity the mount exists for.
  if (mountedView.value) return

  clearBoard({ preserveLiveGuesses: true })

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
    `${stage.value}|${!!mountedView.value}|${gameStore.spectateHideSpoilers}|${(story.value.focus ?? []).join(',')}`
)
onMounted(paintMap)
watch(paintKey, paintMap)
// The page transition is mode="out-in", so this unmount completes before the
// next view's setup reads seatId — that ordering is what keeps a returning
// finisher's views off the followed seat. The 3D follow target must clear
// too: it outlives the booth otherwise and hijacks the finisher's own board
// camera, HUD and blocked-banner on their next walk.
onBeforeUnmount(() => {
  gameStore.spectateFollowId = undefined
  gameStore.spectateSeatId = undefined
  gameStore.board.spectateTargetId = undefined
  // A finisher leaving a finished race must land on their report, not bounce
  // back into a dead booth on the next routing pass.
  if (raceOver.value) gameStore.spectating = false
  clearBoard()
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

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

// Live guesses land bottom-left, clear of the bar and the stage card
.spectate-ticker {
  left: calc(1.5rem + var(--safe-left));
  bottom: calc(7.5rem + var(--safe-bottom));
  position: absolute;
  max-width: min(30rem, 24vw);
}

// The board's entrance dissolves — a broadcast cut, not a hard pop
.stage-fade-enter-active,
.stage-fade-leave-active {
  transition: opacity 0.35s ease;
}
.stage-fade-enter-from,
.stage-fade-leave-to {
  opacity: 0;
}

// A director cut between subjects: quick, deliberate. Same-subject phase
// changes never pass through here — the card swaps content in place.
.shot-cut-enter-active,
.shot-cut-leave-active {
  transition: opacity var(--motion-quick, 0.15s) ease;
}
.shot-cut-enter-from,
.shot-cut-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .stage-fade-enter-active,
  .stage-fade-leave-active,
  .shot-cut-enter-active,
  .shot-cut-leave-active {
    transition: none;
  }
}

// Phones: absolutes give way to a scrollable stack — stage card, then the
// bar — so nothing fights for the same bottom edge. The board keeps
// full-screen; mounted views own their own phone layouts.
@media screen and (max-width: $tablet) {
  .spectate-stage {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding: calc(1rem + var(--safe-top)) 1rem calc(1rem + var(--safe-bottom));
  }

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
