<template>
  <ModalWrapper>
    <article ref="card" class="pane group-scores tl decorator-bottom">
      <section ref="scoreCard" class="score-card">
        <header class="pane-content card-header">
          <span class="eyebrow">
            {{ isPersonalScorecard ? 'Your Scorecard' : `${selectedName}'s Scorecard` }}
          </span>
          <h2>
            {{ challengeHeading }}
            <SourceInfo
              v-if="rankingDefinition"
              icon="question"
              class="heading-definition"
              label="What this measures"
              :definition="rankingDefinition"
            />
          </h2>
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
                    ? (selectedScorecard.score?.points.scored ?? 0) > 0
                      ? `Well done, ${selectedName}.`
                      : `Rough round, ${selectedName}.`
                    : `${selectedName}'s round.`
                }}
              </p>
              <p class="explainer">{{ explainer }}</p>
              <p v-if="tallyLine" class="tally">{{ tallyLine }}</p>
            </div>
          </div>

          <!-- One card replaces the generic ledger (the star chart's cities,
               terra's chronological rows, ranking's true order); the rest
               stack beneath it. Which is which is declared in the registry,
               not by the order of this block. -->
          <template v-if="replaceReveal">
            <!-- A card with no eyebrow brings its own framing (the star chart
                 and terra render their whole section themselves). -->
            <section
              v-if="replaceReveal.eyebrow"
              class="pane-content ranking"
              :class="{ right: replaceReveal.padded }"
            >
              <span class="eyebrow">
                {{ replaceReveal.eyebrow }}
                <SourceInfo
                  v-if="kind === 'ranking' && rankingSources.length"
                  class="eyebrow-source"
                  :attributions="rankingSources"
                />
              </span>
              <component :is="replaceReveal.component" v-bind="replaceReveal.props" />
            </section>
            <component :is="replaceReveal.component" v-else v-bind="replaceReveal.props" />
          </template>
          <template v-else>
            <p v-if="empireVerdict" class="pane-content empire-verdict">{{ empireVerdict }}</p>

            <!-- Set-shaped rounds: one merged ledger, every answer on its own
                 row with its verdict, wrong names below the rule. -->
            <AnswerLedger
              v-if="breakdown"
              :breakdown="breakdown"
              :truth-label="sectionLabels.correct"
              :stray-label="sectionLabels.stray"
              :cost="strayCost"
              :claimed-by="sweepClaimedBy"
              :players="gameStore.game?.players"
              :seat-id="selectedScorecard.player.id"
            />

            <!-- Sequence-shaped rounds keep the rails: their order IS the
                 answer, and both rows are real sequences that can differ in
                 membership, so neither collapses into the other's ledger. -->
            <template v-else-if="showsAnswerRails">
              <section class="pane-content ranking">
                <span class="eyebrow">{{ sectionLabels.submitted }}</span>
                <ViewRanking :iso-codes="submittedIsoCodes" />
              </section>

              <!-- Guesses that never joined the route. Left in the row above they
                   would pad it into looking like a longer journey than it was. -->
              <section v-if="traversalReveal?.strays.length" class="pane-content ranking">
                <span class="eyebrow">Strays</span>
                <ViewRanking :iso-codes="traversalReveal.strays" />
              </section>

              <section class="pane-content ranking">
                <span class="eyebrow">{{ sectionLabels.correct }}</span>
                <ViewRanking :iso-codes="correctIsoCodes" />
              </section>
            </template>

            <!-- The round's own cards, stacked below the ledger. Their
                 order and their eyebrows are the registry's. -->
            <section
              v-for="(reveal, index) in appendReveals"
              :key="index"
              class="pane-content ranking"
              :class="{ right: reveal.padded }"
            >
              <span class="eyebrow">{{ reveal.eyebrow }}</span>
              <component :is="reveal.component" v-bind="reveal.props" />
            </section>

            <section v-if="waterFactLine" class="pane-content ranking">
              <span class="eyebrow">About the Water</span>
              <p class="reveal-fact">{{ waterFactLine }}</p>
              <span v-if="waterSourceLine" class="source-line">{{ waterSourceLine }}</span>
            </section>

            <section v-if="tongueFactLine" class="pane-content ranking">
              <span class="eyebrow">About the Language</span>
              <p class="reveal-fact">{{ tongueFactLine }}</p>
              <span v-if="tongueSourceLine" class="source-line">{{ tongueSourceLine }}</span>
            </section>
          </template>
        </template>
        <!-- A bare <template> is a native, non-rendering element — this
             fallback never showed until it became a real v-else -->
        <template v-else>
          <p class="pane-content">{{ selectedName }} hasn't answered yet.</p>
        </template>
        <nav class="pane-content card-nav">
          <!-- Points become movement: one pip per tile the pawn will walk,
               filling in step with the count-up above. -->
          <div v-if="pipCount > 0" class="step-track">
            <span class="eyebrow">Steps on the board</span>
            <div class="pips">
              <span
                v-for="pip in pipCount"
                :key="pip"
                class="pip"
                :class="{ filled: animatedPoints >= pip }"
              />
              <span v-if="pipOverflow" class="pip-overflow"
                >×{{ selectedScorecard.score?.points.scored }}</span
              >
            </div>
          </div>
          <ButtonFilled @click="closeScores">
            <span>Close Scores</span>
          </ButtonFilled>
        </nav>
      </section>

      <StandingsList
        :scorecards="gameStore.rankedScores"
        :seat-id="gameStore.seatId"
        :selected-player="selectedPlayer"
        @select="selectedPlayer = $event"
      />
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import StandingsList from '~/components/view/scores/StandingsList.vue'
import { ANTHEMS } from '~~/data/anthems.gen'
import {
  attributionFor,
  attributionLine,
  datasetAttribution,
  mediaCreditLine,
} from '~~/lib/attribution'
import { loadFlagMeaning } from '~~/lib/flag-meanings'
import { waterFactsFor } from '~~/lib/water-facts'
import {
  scorecardExplainer,
  scorecardLabels,
  tongueFactLine as tongueFactLineFor,
  waterFactLine as waterFactLineFor,
} from '~~/lib/scorecard-copy'
import type { FlagMeaning } from '~~/data/flag-meanings.gen'
import type { WaterFacts } from '~~/data/water-facts.gen'
import type { TongueFacts } from '~~/data/tongue-facts.gen'
import { useAnthemLyrics } from '~~/lib/use-anthem-lyrics'
import ContourRipple from '~/components/feedback/ContourRipple.vue'
import { EMPIRES } from '~~/data/empires.gen'
import { empireDisplayName } from '~~/lib/empires'
import AnswerLedger from '~/components/challenge/AnswerLedger.vue'
import { sweepClaimedBy as claimedByFor } from '~~/lib/clean-sweep'
import { scorecardRevealsFor, type ScorecardRevealContext } from '~/components/view/scores/reveals'
import { roundChallengeHeadline } from '~~/lib/challenge-headline'
import { tongueBuzzTally } from '~~/lib/language-rounds'
import { playerDisplayName } from '~~/lib/player'
import { answerBreakdown, getChallengeDetails, rankingHasTies } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { isHardMode } from '~~/lib/game-rules'
import {
  ANSWER_SHAPE_BY_KIND,
  WRONG_COSTS_A_POINT,
} from '~~/types/challenges/challenge-groups.type'
import { useClientEvents } from '~~/lib/events/client-side'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { isChallengeOfType, rankingAccessorId } from '~~/lib/rounds'
import { useCountUp } from '~~/lib/use-count-up'
import {
  isTraversalChallenge,
  roundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import { routeHops, routeThrough, shortestRoute, traversalWithin } from '~~/lib/traversal'

const { currentRound, playerId, gameStore, update } = useClientEvents()

const roundChallenge = computed(() => currentRound.value?.round.groupChallenge)
const kind = computed(() => roundChallengeKind(roundChallenge.value))
const accessorId = computed(() => rankingAccessorId(roundChallenge.value))

/** The reveal's figures come from the round's stat — same resolution the
 *  ranking rows use. */
const rankingSources = computed(() => (accessorId.value ? [attributionFor(accessorId.value)] : []))

/** The stat's plain-words definition, when its phrasing alone can mislead. */
const rankingDefinition = computed(() =>
  accessorId.value ? getChallengeDetails(accessorId.value)?.definition : undefined
)

// Defaults to the SEAT (the booth's followed racer for a watcher, self for a
// racer) — the scorecard opens on whoever this screen is about.
const selectedPlayer = ref(gameStore.seatId)

const selectedScorecard = computed(
  () =>
    gameStore.rankedScores.find(({ player }) => player.id === selectedPlayer.value) ??
    gameStore.rankedScores[0]
)

/** `rankedScores` hands back the raw player, and `name` is optional — without
 *  the shared fallback an unnamed seat reads "'s Scorecard". */
const selectedName = computed(() => playerDisplayName(selectedScorecard.value?.player))

// The explainer only teaches the tie rule on rounds that leaned on it.
const rankingTies = computed(() => {
  const correct = selectedScorecard.value?.answers?.correct
  return !!correct && rankingHasTies({ correct, groupChallengeAccessorId: accessorId.value })
})

const traversalChallenge = computed(() => {
  const challenge = roundChallenge.value
  return isTraversalChallenge(challenge) ? challenge : undefined
})

/**
 * The traversal reveal compares two ROUTES, so both rows have to be routes:
 * the bridge the guesses actually built (endpoints included, strays lifted
 * out) against a shortest one. Listing bare guesses against a full route is
 * what makes a four-flag detour look shorter than a five-flag optimum.
 *
 * The shortest shown is the shortest that keeps as much of the player's route
 * as it can, so the two rows diverge only where the player did.
 */
const traversalReveal = computed(() => {
  const challenge = traversalChallenge.value
  const guesses = selectedScorecard.value?.answers?.submitted
  if (!challenge || !guesses || !gameStore.game) return undefined

  const within = traversalWithin(gameStore.game, challenge.corridor?.members)
  const route = routeThrough(challenge.start, challenge.target, guesses, within)
  const onRoute = new Set(route ?? [])

  return {
    route,
    // Only worth lifting out against a route to compare them to — with no
    // bridge the whole guess row is already the strays.
    strays: route ? guesses.filter(isoCode => !onRoute.has(isoCode)) : [],
    shortest:
      shortestRoute(challenge.start, challenge.target, { within, prefer: guesses }) ??
      challenge.optimalPath,
  }
})

const submittedIsoCodes = computed(
  () => traversalReveal.value?.route ?? selectedScorecard.value?.answers?.submitted ?? []
)

const correctIsoCodes = computed(
  () => traversalReveal.value?.shortest ?? selectedScorecard.value?.answers?.correct ?? []
)

const capitalGuessChallenge = computed(() =>
  isChallengeOfType(roundChallenge.value, 'capital-guess-challenge')
    ? roundChallenge.value
    : undefined
)

const flashpointChallenge = computed(() =>
  isChallengeOfType(roundChallenge.value, 'flashpoint-challenge') ? roundChallenge.value : undefined
)

const cleanSweepChallenge = computed(() =>
  isChallengeOfType(roundChallenge.value, 'clean-sweep-challenge')
    ? roundChallenge.value
    : undefined
)

/** Slot → claimant, so the ledger can tell a rival's claim from a real miss.
 *  Undefined for every other mode, which leaves the ledger untouched. */
const sweepClaimedBy = computed(() =>
  cleanSweepChallenge.value ? claimedByFor(cleanSweepChallenge.value) : undefined
)

const flagPaletteChallenge = computed(() =>
  isChallengeOfType(roundChallenge.value, 'flag-palette-challenge')
    ? roundChallenge.value
    : undefined
)

/** The flag's symbolism, from the lazy table — absent when the Factbook has
 *  only a visual description, and the section hides with it. */
const flagMeaning = ref<FlagMeaning>()
watch(
  flagPaletteChallenge,
  async active => {
    flagMeaning.value = undefined
    if (!active) return
    const entry = await loadFlagMeaning(active.country)
    if (flagPaletteChallenge.value === active) flagMeaning.value = entry
  },
  { immediate: true }
)

const waterChallenge = computed(
  () =>
    // Two kinds, one dossier: a blitz round and a name-the-water round both
    // hang off a single feature.
    (isChallengeOfType(roundChallenge.value, 'water-blitz-challenge')
      ? roundChallenge.value
      : undefined) ??
    (isChallengeOfType(roundChallenge.value, 'name-water-challenge')
      ? roundChallenge.value
      : undefined)
)

/** The feature's official figure, joined by name/alias from the lazy facts
 *  table — undefined for bodies the Factbook doesn't list (most seas, ranges). */
const waterFacts = ref<WaterFacts>()
watch(
  waterChallenge,
  async active => {
    waterFacts.value = undefined
    if (!active) return
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    const feature = WATER_FEATURES[active.featureId] ?? { name: active.featureName }
    const facts = await waterFactsFor(feature)
    if (waterChallenge.value === active) waterFacts.value = facts
  },
  { immediate: true }
)

const waterFactLine = computed(() => {
  const active = waterChallenge.value
  return active ? waterFactLineFor(active, waterFacts.value) : undefined
})

const waterSourceLine = computed(() => {
  if (!waterFactLine.value) return undefined
  const attribution = datasetAttribution('water').find(entry => entry.sourceId === 'cia-factbook')
  return attribution ? attributionLine(attribution) : undefined
})

const motherTongueChallenge = computed(() =>
  isChallengeOfType(roundChallenge.value, 'mother-tongue-challenge')
    ? roundChallenge.value
    : undefined
)

/** The language's Wikidata facts, from the lazy table — absent for languages
 *  it couldn't resolve. */
const tongueFacts = ref<TongueFacts>()
watch(
  motherTongueChallenge,
  async active => {
    tongueFacts.value = undefined
    if (!active) return
    const { TONGUE_FACTS } = await import('~~/data/tongue-facts.gen')
    if (motherTongueChallenge.value === active) tongueFacts.value = TONGUE_FACTS[active.language]
  },
  { immediate: true }
)

const tongueFactLine = computed(() => {
  const active = motherTongueChallenge.value
  return active ? tongueFactLineFor(active.language, tongueFacts.value) : undefined
})

const tongueSourceLine = computed(() => {
  if (!tongueFactLine.value) return undefined
  const attribution = datasetAttribution('tongues').find(
    entry => entry.sourceId === 'wikidata-items'
  )
  return attribution ? attributionLine(attribution) : undefined
})

const challengeHeading = computed(() => roundChallengeHeadline(roundChallenge.value))

/** The audio rounds' dossier: what the clip was, plus the clip itself to hear
 *  again. Both kinds share one reveal — they differ only in what the subject is. */
/** The round's lyric wall, refetched for the scorecard's couplet. Cheap — the
 *  file is already in the browser's cache from the round itself. The shared
 *  composable also owns the race this view is most exposed to: the url
 *  re-fires every round, and a slow round-N response must not land over
 *  round N+1's. */
const lyrics = useAnthemLyrics(() => {
  return isChallengeOfType(roundChallenge.value, 'anthem-buzz-challenge')
    ? roundChallenge.value.lyricsUrl
    : undefined
})

const audioReveal = computed(() => {
  const challenge = roundChallenge.value
  if (!challenge || !('_type' in challenge)) return undefined

  if (challenge._type === 'anthem-buzz-challenge') {
    const anthem = ANTHEMS[challenge.country]
    const era = anthem?.adoptedYear ? `adopted ${anthem.adoptedYear}` : undefined
    return {
      subject: countryName(challenge.country),
      // The answer is a COUNTRY, so its label carries a flag (the
      // chosen-country rule); the tongue round's subject is a language and
      // stays bare text.
      countryCode: challenge.country,
      subtitle: [anthem?.title, anthem?.composer, era].filter(Boolean).join(' · '),
      credit: mediaCreditLine(anthem, 'commons-media'),
      clip: challenge.clip,
      lyrics: lyrics.value,
    }
  }

  if (challenge._type === 'tongue-buzz-challenge') {
    return {
      subject: challenge.language,
      countryCode: undefined,
      subtitle: `${tongueBuzzTally(challenge)} — any of them counted`,
      credit: undefined,
      // The scorecard replays one voice, not the sequence — first sample.
      clip: challenge.clips[0],
    }
  }

  return undefined
})

/**
 * The round's reveal cards, resolved through the registry — which card, with
 * which props, and whether it stands in for the generic ledger, all declared
 * in components/view/scores/reveals.ts rather than by the order of a v-if
 * chain. A card whose subject never resolved drops out here.
 */
const revealContext = computed<ScorecardRevealContext | undefined>(() => {
  const challenge = roundChallenge.value
  const answers = selectedScorecard.value?.answers
  if (!challenge || !answers) return undefined
  return {
    challenge,
    playerId: selectedPlayer.value,
    viewerId: gameStore.seatId,
    answers,
    roundAnswers: currentRound.value?.round.groupAnswers ?? {},
    players: gameStore.game?.players ?? {},
    round: currentRound.value?.round,
    flagMeaning: flagMeaning.value,
    audio: audioReveal.value,
  }
})

const resolvedReveals = computed(() =>
  revealContext.value
    ? scorecardRevealsFor(kind.value, revealContext.value)
    : { replace: undefined, append: [] }
)

const replaceReveal = computed(() => resolvedReveals.value.replace)
const appendReveals = computed(() => resolvedReveals.value.append)

/** Ghosts of empires: the beat-1 name verdict, above the tap ledger. */
const empireVerdict = computed(() => {
  const challenge = roundChallenge.value
  if (!challenge || !('_type' in challenge) || challenge._type !== 'empire-challenge') return ''
  const truth = empireDisplayName(EMPIRES[challenge.empireId]?.name ?? 'the empire')
  const guess = selectedScorecard.value.answers?.empireGuess
  if (!guess) return `Never named — it was ${truth}.`
  const guessName = EMPIRES[guess.id ?? '']?.name
  return guess.correct
    ? `You named ${truth}.`
    : `You named ${guessName ? empireDisplayName(guessName) : 'the wrong power'} — it was ${truth}.`
})

/** The round's scoring, in words — the copy itself lives in lib/scorecard-copy
 *  so every kind stays covered by a test. */
const explainer = computed(() =>
  scorecardExplainer({
    kind: kind.value,
    challenge: roundChallenge.value,
    // Border crossings, not flags — the count the score is actually charged
    // on, and the one the two rows below can be compared by.
    shortestHops: routeHops(
      traversalReveal.value?.shortest ?? traversalChallenge.value?.optimalPath ?? []
    ),
    walkedHops: traversalReveal.value?.route ? routeHops(traversalReveal.value.route) : undefined,
    bridged: !!traversalReveal.value?.route,
    hasTies: rankingTies.value,
    hardMode: isHardMode(gameStore.game),
    maximumGuesses:
      capitalGuessChallenge.value?.maximumGuesses ?? flashpointChallenge.value?.maximumGuesses,
  })
)

/**
 * The ledger's rows, classified and ordered once — set-shaped rounds only.
 *
 * A sequence round's two lists are both real routes, and a country on the
 * player's route that is missing from the shortest one is a detour, not a
 * wrong name; folding them into one ledger would either drop it or libel it.
 * Those keep the rails below. Undefined too when the round banks nothing
 * (heritage hunt, manhunt, unique-or-bust), which reveals through its own
 * beats and must not render an empty ledger.
 */
const breakdown = computed(() => {
  const answers = selectedScorecard.value?.answers
  if (ANSWER_SHAPE_BY_KIND[kind.value] !== 'set') return undefined
  if (!answers || (!answers.submitted.length && !answers.correct.length)) return undefined
  return answerBreakdown({
    submitted: answers.submitted,
    correct: answers.correct,
    kind: kind.value,
  })
})

/** The sequence rounds' fallback: rails, but only with something to put in
 *  them — the empty-payload kinds stay silent here as they do in the ledger. */
const showsAnswerRails = computed(
  () =>
    // Pyramid Scheme states both sides per ROW in its own card (each country
    // beside the shape it belonged to). Two flag rails above that would say the
    // same thing worse — an order the round never asked for.
    kind.value !== 'pyramid-scheme' &&
    (submittedIsoCodes.value.length > 0 || correctIsoCodes.value.length > 0)
)

/** Only the blitz family really pays a point per wrong name (`blitzScore`'s
 *  `- wrong`). Set overlap and membership rounds charge differently, so they
 *  count the misses without quoting a price. */
const strayCost = computed(() =>
  WRONG_COSTS_A_POINT.has(kind.value) ? breakdown.value?.tally.wrong || undefined : undefined
)

/** The score's own arithmetic, in words. A one-country answer has nothing to
 *  tally — the marked tile already says it. */
const tallyLine = computed(() => {
  // A contested pool needs its own arithmetic: "missed" would fold a rival's
  // claim in with a slot nobody reached, and those are different stories.
  const sweep = cleanSweepChallenge.value
  if (sweep) {
    const held = sweepClaimedBy.value ?? {}
    const mine = sweep.members.filter(
      isoCode => held[isoCode] === selectedScorecard.value.player.id
    ).length
    const nobody = sweep.members.filter(isoCode => !held[isoCode]).length
    const rivals = sweep.members.length - mine - nobody
    return [
      `${mine} of ${sweep.members.length} claimed`,
      `${rivals} to rivals`,
      `${nobody} nobody found`,
    ].join(' · ')
  }

  const tally = breakdown.value?.tally
  if (!tally || tally.total <= 1) return undefined

  const parts = [`${tally.found} of ${tally.total} found`]
  if (tally.wrong) {
    const named = `${tally.wrong} wrong ${tally.wrong === 1 ? 'name' : 'names'}`
    parts.push(strayCost.value ? `${named} · −${strayCost.value}` : named)
  }
  return parts.join(' · ')
})

/** The stray tail reads the same everywhere: whatever the round asked for,
 *  these are names the player gave that weren't in the set. */
/** What the two answer rows are called, plus the shared stray tail. */
const sectionLabels = computed(() =>
  scorecardLabels({
    kind: kind.value,
    // The round itself decides what "everywhere" meant — a Europe board's
    // answer set was only ever that board.
    challenge: roundChallenge.value,
    bridged: !!traversalReveal.value?.route,
  })
)

const card = ref<HTMLElement>()
const scoreCard = ref<HTMLElement>()

const { display: animatedPoints } = useCountUp(
  () => selectedScorecard.value?.score?.points.scored ?? 0,
  { delay: 0.3 }
)

// One pip per step, capped so a blowout round stays one or two rows.
const PIP_CAP = 15
const pipCount = computed(() =>
  Math.min(selectedScorecard.value?.score?.points.scored ?? 0, PIP_CAP)
)
const pipOverflow = computed(() => (selectedScorecard.value?.score?.points.scored ?? 0) > PIP_CAP)

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
    {
      opacity: 1,
      x: 0,
      duration: 0.4,
      ease: EASE.enter,
      stagger: 0.1,
      clearProps: 'opacity,transform',
    }
  )
})

// Mini cross-fade when flipping between players' scorecards
watch(selectedPlayer, () => {
  if (!scoreCard.value || prefersReducedMotion()) return
  gsap.fromTo(scoreCard.value, { opacity: 0.2 }, { opacity: 1, duration: 0.25, ease: EASE.cross })
})

// Seat-resolved: the "your scorecard" framing follows whoever this screen is
// ABOUT — self for a racer, the followed racer in the booth (a finisher
// watching must not see personal framing on someone else's card, nor their
// own card framed personally while the director happens to hold them).
const isPersonalScorecard = computed(() => {
  return gameStore.seatId === selectedScorecard.value.player.id
})

const closeScores = () => {
  // The booth guard comes FIRST: `playerId` is the raw OWN id, so a
  // finisher-watcher reaching this body would flip their own local
  // 'victory' record to 'moving' and eject themselves from the booth
  // (today only SpectateMount's `inert` stands between that click and
  // this body).
  if (gameStore.watching) return

  // Optimistic flip for the instant view transition; the server's announce
  // snapshot confirms it and the walk lead covers the board coming up.
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'moving'
  }

  // Delivery is update()'s job (ack + retry — this is a critical event); a
  // fully lost request falls to the server's group-scores cap.
  update({ event: 'enter-movement-phase' })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.group-scores {
  width: 100%;
  margin: auto;
  display: grid;
  max-width: 110rem;
  grid-template-columns: 73% 27%;
}

// Small-caps section labels carry the hierarchy
.step-track .eyebrow {
  margin-bottom: 0.6rem;
}

.pips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.pip {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  border: 1px solid var(--soft-blue);
  transition: background-color 0.25s ease;

  &.filled {
    background: var(--soft-blue);
  }
}

.pip-overflow {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--soft-blue);
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
    // The same arithmetic the explainer describes, run on this round.
    .tally {
      margin: 0.5rem 0 0;
      font-size: 1.4rem;
      font-weight: bold;
      color: var(--dark-blue);
    }
  }

  .empire-verdict {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    padding-top: 0;
    padding-bottom: 0;
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

// `:deep` too — the answer presenters render their own `.ranking` sections,
// and the recipe stays declared once.
.ranking,
:deep(.ranking) {
  padding-top: 2rem;
  padding-right: 0;
  padding-bottom: 2rem;
  border-top: 0.1rem solid $hairline;
}

.reveal-fact {
  margin: 0 0 0.4rem;
  font-size: 1.5rem;
  color: var(--dark-blue);
}

.card-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding-top: 2rem;
  padding-bottom: 2.4rem;
  justify-content: space-between;
  border-top: 0.1rem solid $hairline;
}

// With no steps to show, the close button keeps its right-edge home
.card-nav > :last-child {
  margin-left: auto;
}

// Phone portrait: the 73/27 split becomes a stack — scorecard first, the
// round standings beneath it under a top rule instead of a left one.
@media screen and (max-width: $tablet) {
  .group-scores {
    grid-template-columns: 100%;
    // Bottom breathing room inside the ModalWrapper scroller, past the
    // home indicator.
    margin-bottom: calc(var(--safe-bottom) + 2rem);
  }

  .score-summary {
    gap: 1.4rem;

    .score-stat .points {
      font-size: 4.4rem;
    }
  }
}
</style>
