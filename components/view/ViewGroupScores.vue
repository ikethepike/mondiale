<template>
  <ModalWrapper>
    <article class="pane group-scores tl decorator-bottom">
      <section class="score-card">
        <header class="pane-content">
          <span>
            {{
              isPersonalScorecard
                ? 'Your Scorecard'
                : `${selectedScorecard.player.name}'s Scorecard`
            }}
          </span>
          <h2>{{ details?.phrasing }}</h2>
        </header>
        <template v-if="selectedScorecard.answers">
          <div class="pane-content horizontal bottom">
            <p v-if="isPersonalScorecard">
              Well done, {{ selectedScorecard.player.name }}. You get
              {{ selectedScorecard.score?.points.scored }} of
              {{ selectedScorecard.score?.points.maximum }} possible points.
            </p>
            <p v-else>
              Here is {{ selectedScorecard.player.name }}'s scorecard. They scored
              {{ selectedScorecard.score?.points.scored }} of
              {{ selectedScorecard.score?.points.maximum }} possible points.
            </p>
            <p>
              You get 3 points for a fully correct answer, 2 points a country being one off, and 1
              point for a country being two places off.
            </p>
          </div>
          <section class="pane-content horizontal ranking">
            <h4>Submitted Ranking</h4>
            <ViewRanking :iso-codes="selectedScorecard.answers.submitted" />
          </section>

          <section class="pane-content horizontal bottom ranking">
            <h4>Correct Ranking</h4>
            <ViewRanking :iso-codes="selectedScorecard.answers.correct" />
          </section>
        </template>
        <template>
          <p>{{ selectedScorecard.player.name }} hasn't answered yet.</p>
        </template>
        <nav class="pane-content horizontal bottom">
          <ButtonFilled @click="closeScores">
            <span>Close Scores</span>
          </ButtonFilled>
        </nav>
      </section>

      <section class="player-listing pane-content">
        <PlayerTile
          v-for="{ player, score } in Object.values(scoreVector).sort((a, b) => {
            if (!a.score?.points || !b.score?.points) return 0
            return b.score.points.scored - a.score.points.scored
          })"
          :key="player.id"
          :player="player"
          @click="selectedPlayer = player.id"
        >
          <div class="score-status">
            <span v-if="score?.points"> {{ score.points.scored }}/{{ score.points.maximum }}</span>
            <span v-else>...</span>
          </div>
        </PlayerTile>
      </section>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'
import type { Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

type ScoreVector = {
  [playerId: string]: {
    player: Player
    score?: Round['playerTurns'][string]
    answers?: Round['groupAnswers'][string]
  }
}

const { currentRound, game, playerId, gameStore, update } = useClientEvents()

const details = computed(() => {
  const accessorId = currentRound.value?.round.groupChallenge.id
  if (!accessorId) return undefined
  return getChallengeDetails(accessorId)
})

const selectedPlayer = ref(playerId)
const scoreVector = computed<ScoreVector>(() => {
  if (!currentRound.value || !game.value) return {}

  const output: ScoreVector = {}

  for (const player of Object.values(game.value.players)) {
    output[player.id] = {
      player,
    }

    if (Reflect.has(currentRound.value.round.groupAnswers, player.id)) {
      output[player.id].answers = currentRound.value.round.groupAnswers[player.id]
    }

    if (Reflect.has(currentRound.value.round.playerTurns, player.id)) {
      output[player.id].score = currentRound.value.round.playerTurns[player.id]
    }
  }

  return output
})

const selectedScorecard = computed(() => {
  return scoreVector.value[selectedPlayer.value]
})

const isPersonalScorecard = computed(() => {
  return playerId.value === selectedScorecard.value.player.id
})

const closeScores = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'moving'
  }

  update({ event: 'enter-movement-phase' })
}
</script>
<style lang="scss" scoped>
.group-scores {
  width: 100%;
  margin: auto;
  display: grid;
  max-width: 110rem;
  grid-template-columns: 73% 27%;
  .ranking {
    padding-right: 0;
  }
}

.player-listing {
  border-left: 0.1rem solid var(--text-color);
}
</style>
