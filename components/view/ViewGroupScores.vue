<template>
  <ModalWrapper>
    <article ref="card" class="pane group-scores tl decorator-bottom">
      <section ref="scoreCard" class="score-card">
        <header class="pane-content card-header">
          <span class="eyebrow">
            {{
              isPersonalScorecard
                ? 'Your Scorecard'
                : `${selectedScorecard.player.name}'s Scorecard`
            }}
          </span>
          <h2>{{ challengeHeading }}</h2>
        </header>
        <template v-if="selectedScorecard.answers">
          <div class="pane-content score-summary">
            <ContourRipple v-if="isPersonalScorecard" class="score-ripple" :delay="0.9" />
            <div class="score-stat">
              <strong class="points">{{ animatedPoints }}</strong>
              <span class="of">/ {{ selectedScorecard.score?.points.maximum }} points</span>
            </div>
            <div class="score-copy">
              <p class="lead">
                {{
                  isPersonalScorecard
                    ? `Well done, ${selectedScorecard.player.name}.`
                    : `${selectedScorecard.player.name}'s round.`
                }}
              </p>
              <p class="explainer">{{ explainer }}</p>
            </div>
          </div>

          <template v-if="kind === 'sketch' && sketchChallenge">
            <section class="pane-content ranking">
              <span class="eyebrow">The Reveal</span>
              <SketchOverlay
                :country="sketchChallenge.country"
                :sketch="selectedScorecard.answers.sketch"
              />
            </section>
          </template>
          <template v-else>
            <section class="pane-content ranking">
              <span class="eyebrow">{{ sectionLabels.submitted }}</span>
              <ViewRanking :iso-codes="selectedScorecard.answers.submitted" />
            </section>

            <section class="pane-content ranking">
              <span class="eyebrow">{{ sectionLabels.correct }}</span>
              <ViewRanking :iso-codes="selectedScorecard.answers.correct" />
            </section>
          </template>
        </template>
        <!-- A bare <template> is a native, non-rendering element — this
             fallback never showed until it became a real v-else -->
        <template v-else>
          <p class="pane-content">{{ selectedScorecard.player.name }} hasn't answered yet.</p>
        </template>
        <nav class="pane-content card-nav">
          <ButtonFilled @click="closeScores">
            <span>Close Scores</span>
          </ButtonFilled>
        </nav>
      </section>

      <section class="player-listing pane-content">
        <header class="listing-header">
          <span class="eyebrow">Round Standings</span>
        </header>
        <div
          v-for="({ player, score }, index) in gameStore.rankedScores"
          :key="player.id"
          class="score-row"
          :class="{ 'own-player': player.id === playerId, selected: player.id === selectedPlayer }"
          @click="selectedPlayer = player.id"
        >
          <span class="rank">{{ index + 1 }}</span>
          <PlayerTile :player="player">
            <div class="score-status">
              <strong v-if="score?.points">
                {{ score.points.scored }}<span class="muted">/{{ score.points.maximum }}</span>
              </strong>
              <span v-else class="muted">…</span>
            </div>
          </PlayerTile>
        </div>
      </section>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import SketchOverlay from '~/components/country/SketchOverlay.vue'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { useCountUp } from '~~/lib/use-count-up'
import {
  isTraversalChallenge,
  roundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'

const { currentRound, playerId, gameStore } = useClientEvents()

const roundChallenge = computed(() => currentRound.value?.round.groupChallenge)
const kind = computed(() => roundChallengeKind(roundChallenge.value))

const traversalChallenge = computed(() => {
  const challenge = roundChallenge.value
  return isTraversalChallenge(challenge) ? challenge : undefined
})

const sketchChallenge = computed(() => {
  const challenge = roundChallenge.value
  return challenge && '_type' in challenge && challenge._type === 'sketch-challenge'
    ? challenge
    : undefined
})

const challengeHeading = computed(() => {
  const challenge = roundChallenge.value
  if (!challenge) return ''
  switch (kind.value) {
    case 'traversal': {
      const active = traversalChallenge.value
      if (!active) return ''
      return active.corridor
        ? `Link ${countryName(active.start)} to ${countryName(active.target)} — ${active.corridor.name} only`
        : `Link ${countryName(active.start)} to ${countryName(active.target)}`
    }
    case 'neighbour-blitz':
      return '_type' in challenge && challenge._type === 'neighbour-blitz-challenge'
        ? `Name ${countryName(challenge.country)}'s neighbours`
        : ''
    case 'silhouette':
      return '_type' in challenge && challenge._type === 'silhouette-challenge'
        ? `Whose outline is this? It was ${countryName(challenge.country)}`
        : ''
    case 'hot-cold':
      return '_type' in challenge && challenge._type === 'hot-cold-challenge'
        ? `The mystery country was ${countryName(challenge.country)}`
        : ''
    case 'sketch':
      return sketchChallenge.value ? `Draw ${countryName(sketchChallenge.value.country)}` : ''
    default:
      return 'id' in challenge ? (getChallengeDetails(challenge.id)?.phrasing ?? '') : ''
  }
})

const explainer = computed(() => {
  switch (kind.value) {
    case 'traversal': {
      const between = Math.max(0, (traversalChallenge.value?.optimalHops ?? 1) - 1)
      return `The shortest link needs ${between} ${between === 1 ? 'country' : 'countries'} in between — every extra or stray guess costs points.`
    }
    case 'neighbour-blitz':
      return 'Points scale with neighbours found — wrong names each cost one.'
    case 'silhouette':
      return 'The earlier the buzz, the bigger the score.'
    case 'hot-cold':
      return 'Finding it is everything — every extra probe costs points.'
    case 'sketch':
      return 'Scored by how closely the drawing matches the real outline.'
    default:
      return '3 points for a spot-on answer, 2 for one place off, 1 for two places off.'
  }
})

const sectionLabels = computed(() => {
  switch (kind.value) {
    case 'traversal':
      return { submitted: 'Your Guesses', correct: 'A Shortest Route' }
    case 'neighbour-blitz':
      return { submitted: 'Your Answers', correct: 'All the Neighbours' }
    case 'silhouette':
      return { submitted: 'Your Answer', correct: 'The Country' }
    case 'hot-cold':
      return { submitted: 'Your Probe Trail', correct: 'The Country' }
    default:
      return { submitted: 'Submitted Ranking', correct: 'Correct Ranking' }
  }
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
$hairline: hsla(0, 0%, 7.5%, 0.12);

.group-scores {
  width: 100%;
  margin: auto;
  display: grid;
  max-width: 110rem;
  grid-template-columns: 73% 27%;
}

// Small-caps section labels carry the hierarchy
.eyebrow {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.8rem;
}

.card-header {
  padding-bottom: 2rem;
  border-bottom: 0.1rem solid $hairline;

  h2 {
    margin: 0;
    font-size: 2.8rem;
    color: var(--dark-blue);
  }
}

// The score is the headline fact — a big stat, copy beside it
.score-summary {
  gap: 2.4rem;
  display: flex;
  position: relative;
  align-items: center;
  padding-top: 2.4rem;
  padding-bottom: 2.4rem;

  .score-stat {
    display: flex;
    flex-shrink: 0;
    align-items: baseline;
    gap: 0.6rem;

    .points {
      font-size: 6rem;
      line-height: 1;
      color: var(--dark-blue);
    }
    .of {
      opacity: 0.6;
      font-size: 1.6rem;
      white-space: nowrap;
    }
  }

  .score-copy {
    .lead {
      margin: 0 0 0.4rem;
      font-size: 1.9rem;
      font-weight: bold;
    }
    .explainer {
      margin: 0;
      opacity: 0.6;
      font-size: 1.4rem;
    }
  }

  .score-ripple {
    top: 50%;
    left: 8rem;
    width: 16rem;
    height: 16rem;
    position: absolute;
    transform: translate(-50%, -50%);
  }
}

.ranking {
  padding-top: 2rem;
  padding-right: 0;
  padding-bottom: 2rem;
  border-top: 0.1rem solid $hairline;
}

.card-nav {
  display: flex;
  padding-top: 2rem;
  padding-bottom: 2.4rem;
  justify-content: flex-end;
  border-top: 0.1rem solid $hairline;
}

// Sidebar: ranked standings
.player-listing {
  border-left: 0.1rem solid var(--text-color);
}

.listing-header {
  margin-bottom: 1.6rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }
}

.score-row {
  gap: 1rem;
  display: flex;
  cursor: pointer;
  align-items: center;

  .rank {
    width: 2rem;
    opacity: 0.45;
    flex-shrink: 0;
    font-size: 1.4rem;
    text-align: right;
    font-weight: bold;
  }

  :deep(.player-tile) {
    flex: 1;
    min-width: 0;
  }

  &.selected :deep(.player-tile) {
    border-right-width: 0.6rem;
  }

  &.own-player .rank {
    opacity: 1;
    color: var(--dark-blue);
  }
  &.own-player :deep(.player-tile) {
    outline: 0.2rem solid var(--warm-sand);
    outline-offset: 0.2rem;
  }
}

.score-status {
  margin-left: auto;
  font-size: 1.7rem;

  .muted {
    opacity: 0.55;
    font-weight: normal;
    font-size: 1.3rem;
  }
}
</style>
