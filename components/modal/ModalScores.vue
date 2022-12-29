<template>
  <ModalWrapper>
    <div>
      <section class="form-content" v-if="score && currentRound">
        <header>
          <span>Score: {{ score.points.scored }}/{{ score.points.maximum }}</span>
          <h1>{{ details?.phrasing || currentRound.round.groupChallenge.id }}</h1>
        </header>
        <div>
          <section class="ordering">
            <div>
              <strong>Submitted order</strong>
              <ul class="country-order">
                <li v-for="isoCode in score.ordering.submitted" :key="`submitted-${isoCode}`">
                  <ModalScoreTile :iso-code="isoCode" :show-amount="false" />
                </li>
              </ul>
            </div>

            <div>
              <strong>Correct order</strong>
              <ul class="country-order">
                <li v-for="isoCode in score.ordering.correct" :key="`correct-${isoCode}`">
                  <ModalScoreTile :iso-code="isoCode" />
                </li>
              </ul>
            </div>
          </section>
        </div>
      </section>
      <button class="line-button" @click="closeScores">Close Scores</button>
    </div>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'

const { gameStore, currentRound, playerId, update } = useClientEvents()
const score = toRef(gameStore, 'playerScore')
const details = computed(() => {
  const accessorId = currentRound.value?.round.groupChallenge.id
  if (!accessorId) return undefined
  return getChallengeDetails(accessorId)
})

const closeScores = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'moving'
  }

  update({ event: 'enter-movement-phase' })
}
</script>
<style lang="scss" scoped>
.flag {
  height: 6rem;
  background-size: cover;
  background-position: center;
}

.country-order {
  gap: 1.5rem;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
}
.ordering {
  strong {
    display: block;
    margin-bottom: 1rem;
  }
  > div {
    margin-top: 2rem;
  }
}
</style>
