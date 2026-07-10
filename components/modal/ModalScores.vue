<template>
  <ModalWrapper>
    <div>
      <section v-if="score && currentRound" class="form-content">
        <header>
          <span>Score: {{ score.points.scored }}/{{ score.points.maximum }}</span>
          <h1>{{ heading }}</h1>
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
import { isGroupChallenge, roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

const { gameStore, currentRound, playerId, update } = useClientEvents()
const score = toRef(gameStore, 'playerScore')
const details = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  // Only ranking rounds carry an accessor id; the other formats key off `_type`.
  if (!isGroupChallenge(challenge)) return undefined
  return getChallengeDetails(challenge.id)
})

// Ranking rounds get their accessor phrasing; every other format falls back to
// its gameplay kind, so the header never renders a bare `undefined`.
const heading = computed(
  () => details.value?.phrasing ?? roundChallengeKind(currentRound.value?.round.groupChallenge)
)

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

// The five rank slots read fine as a 2-3 wrap on a phone; 5-up is unreadable.
@media screen and (max-width: 640px) {
  .country-order {
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }
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
