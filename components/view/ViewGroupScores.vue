<template>
  <ModalWrapper>
    <article ref="card" class="pane group-scores tl decorator-bottom">
      <section ref="scoreCard" class="score-card">
        <header class="pane-content">
          <span>
            {{
              isPersonalScorecard
                ? 'Your Scorecard'
                : `${selectedScorecard.player.name}'s Scorecard`
            }}
          </span>
          <h2>{{ challengeHeading }}</h2>
        </header>
        <template v-if="selectedScorecard.answers">
          <div class="pane-content horizontal bottom score-summary">
            <ContourRipple v-if="isPersonalScorecard" class="score-ripple" :delay="0.9" />
            <p v-if="isPersonalScorecard">
              Well done, {{ selectedScorecard.player.name }}. You get
              <strong>{{ animatedPoints }}</strong> of
              {{ selectedScorecard.score?.points.maximum }} possible points.
            </p>
            <p v-else>
              Here is {{ selectedScorecard.player.name }}'s scorecard. They scored
              <strong>{{ animatedPoints }}</strong> of
              {{ selectedScorecard.score?.points.maximum }} possible points.
            </p>
            <p v-if="isTraversal">
              The shortest link needs
              {{ Math.max(0, (traversalChallenge?.optimalHops ?? 1) - 1) }}
              {{ (traversalChallenge?.optimalHops ?? 1) - 1 === 1 ? 'country' : 'countries' }}
              in between — every extra or stray guess costs points.
            </p>
            <p v-else>
              You get 3 points for a fully correct answer, 2 points a country being one off, and 1
              point for a country being two places off.
            </p>
          </div>
          <section class="pane-content horizontal ranking">
            <h4>{{ isTraversal ? 'Your Guesses' : 'Submitted Ranking' }}</h4>
            <ViewRanking :iso-codes="selectedScorecard.answers.submitted" />
          </section>

          <section class="pane-content horizontal bottom ranking">
            <h4>{{ isTraversal ? 'A Shortest Route' : 'Correct Ranking' }}</h4>
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
          v-for="{ player, score } in gameStore.rankedScores"
          :key="player.id"
          :player="player"
          class="score-row"
          :class="{ 'own-player': player.id === playerId }"
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
import { gsap } from 'gsap'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { useCountUp } from '~~/lib/use-count-up'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'

const { currentRound, playerId, gameStore } = useClientEvents()

const traversalChallenge = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  return isTraversalChallenge(challenge) ? challenge : undefined
})
const isTraversal = computed(() => !!traversalChallenge.value)

const challengeHeading = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  if (!challenge) return ''
  if (isTraversalChallenge(challenge)) {
    return `Travel from ${countryName(challenge.start)} to ${countryName(challenge.target)}`
  }
  return getChallengeDetails(challenge.id)?.phrasing ?? ''
})

const selectedPlayer = ref(playerId)

const selectedScorecard = computed(() => {
  return (
    gameStore.rankedScores.find(({ player }) => player.id === selectedPlayer.value) ??
    gameStore.rankedScores[0]
  )
})

const card = ref<HTMLElement>()
const scoreCard = ref<HTMLElement>()

const { display: animatedPoints } = useCountUp(
  () => selectedScorecard.value?.score?.points.scored ?? 0,
  { delay: 0.3 }
)

// Staggered section + leaderboard-row entrance
onMounted(() => {
  if (!card.value || prefersReducedMotion()) return

  gsap.fromTo(
    card.value.querySelectorAll('.score-card > *'),
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.4, ease: EASE.enter, stagger: 0.07, clearProps: 'all' }
  )
  gsap.fromTo(
    card.value.querySelectorAll('.score-row'),
    { opacity: 0, x: 18 },
    { opacity: 1, x: 0, duration: 0.4, ease: EASE.enter, stagger: 0.1, clearProps: 'opacity,transform' }
  )
})

// Mini cross-fade when flipping between players' scorecards
watch(selectedPlayer, () => {
  if (!scoreCard.value || prefersReducedMotion()) return
  gsap.fromTo(scoreCard.value, { opacity: 0.2 }, { opacity: 1, duration: 0.25, ease: EASE.cross })
})

const isPersonalScorecard = computed(() => {
  return playerId.value === selectedScorecard.value.player.id
})

const closeScores = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'moving'
  }

  // The board emits 'enter-movement-phase' once its scene is ready — asking
  // the server to start stepping now would race the board load and swallow
  // the first hops.
  gameStore.pendingMovementRequest = true
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

.score-row.own-player {
  border-left: 0.5rem solid var(--warm-sand);
  padding-left: 0.8rem;
}

.score-summary {
  position: relative;

  .score-ripple {
    top: 50%;
    left: 8rem;
    width: 16rem;
    height: 16rem;
    position: absolute;
    transform: translate(-50%, -50%);
  }
}
</style>
