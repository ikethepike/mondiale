<template>
  <div v-if="challenge" class="two-truths challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Two Truths and a Lie`"
      :title="`Three claims about ${countryName(challenge.country)}`"
      stakes="One of these values secretly belongs to another country. Spot the lie — the sooner you call it, the more it pays. One shot."
      @done="start"
    />

    <ChallengePrompt :attributions="claimSources" attribution-label="Sources">
      <template v-if="!revealed">
        <h1 class="map-caption">Two truths and a lie about {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub"> Tap the claim that doesn't belong </span>
      </template>
      <!-- The question title steps aside so the dossier's head is the only heading
           once the round resolves. That drops the one mention of the SUBJECT
           country, so the body names it: the lie belongs to `lieSource`, and
           without naming `country` too the reveal never says what the three claims
           were even about. -->
      <ChallengeResult
        v-else
        :status="foundLie ? 'correct' : 'incorrect'"
        correct-message="Caught it"
        :incorrect-message="timedOut ? 'Time ran out' : 'That one was true'"
      >
        <template v-if="foundLie">
          That's {{ countryName(challenge.lieSource) }}'s number, not
          {{ countryName(challenge.country) }}'s. The truth: {{ truthDisplay }}
        </template>
        <template v-else>
          The lie was {{ lieLabel }} — {{ countryName(challenge.lieSource) }}'s number, not
          {{ countryName(challenge.country) }}'s
        </template>
      </ChallengeResult>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <section
      ref="stage"
      class="claim-stage"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <!-- Before the pick: the flag. After: the lie's stat as a world strip,
           so the reveal SHOWS where the truth and the borrowed number sit. -->
      <Transition name="caption" mode="out-in">
        <div v-if="!revealed" key="flag" class="flag-frame">
          <CountryFlag
            class="flag"
            :country="getCountry(challenge.country)"
            mode="background"
            fit="contain"
          />
        </div>
        <StatStripPlot
          v-else-if="lieAccessorId"
          key="plot"
          class="plot-frame"
          :accessor-id="lieAccessorId"
          :target="challenge.country"
          :decoy="challenge.lieSource"
        />
      </Transition>
      <ul class="claim-list">
        <li v-for="(statement, index) in challenge.statements" :key="statement.accessorId">
          <StatCard
            tag="button"
            type="button"
            class="claim-card"
            :class="claimClass(index)"
            :label="statementLabel(statement.accessorId)"
            :topic="statementTopic(statement.accessorId)"
            :accessor="statement.accessorId"
            :disabled="revealed || index === eliminatedIndex"
            @click="pick(index)"
          >
            <strong class="claim-value">
              {{ formatAmount(statement) }}
            </strong>
            <ScalePlot v-if="statementScales[index]" v-bind="statementScales[index]" />
            <Transition name="caption">
              <span
                v-if="revealed"
                class="verdict-tag"
                :class="index === challenge.lieIndex ? 'lie' : 'truth'"
              >
                {{
                  index === challenge.lieIndex
                    ? `The lie — ${countryName(challenge.lieSource)}'s number`
                    : 'True'
                }}
              </span>
            </Transition>
          </StatCard>
        </li>
      </ul>
    </section>

    <!-- A round dealt without a duration has no clock to show or race. -->
    <footer v-if="!showInterstitial && !revealed && challenge.durationSeconds" class="clock-footer">
      <div class="hint-row">
        <Transition name="caption">
          <button
            v-if="fiftyFiftyUnlocked"
            class="hint-button"
            type="button"
            @click="buyFiftyFifty"
          >
            <StatTopicIcon class="hint-icon" topic="reveal" />
            50/50 (−{{ hintBitePoints(challenge.maximumPoints) }} pts)
          </button>
        </Transition>
      </div>
      <ChallengeTimerRadial
        class="footer-clock"
        :value="secondsLeft"
        :total="challenge.durationSeconds"
      />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatCard from '~/components/challenge/StatCard.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import ScalePlot from '~/components/feedback/ScalePlot.vue'
import StatStripPlot from '~/components/feedback/StatStripPlot.vue'
import { sample } from '~~/lib/arrays'
import { attributionFor, dedupeAttributions } from '~~/lib/attribution'
import { accessorTopicLabel, getChallengeDetails, getScaleProps } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { isHardMode } from '~~/lib/game-rules'
import {
  buzzScore,
  HINT_UNLOCK_FIRST_ELAPSED,
  hintBitePoints,
  hintDockedScore,
} from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

const {
  challenge,
  currentRound,
  showInterstitial,
  begin,
  announce,
  entries,
  submitOnce,
  gameStore,
  secondsLeft,
  remainingFraction,
  elapsedFraction,
  stopCountdown,
} = useGroupChallenge('two-truths-challenge')

// The stage only scrolls where the claims stack (phones); on a wider board the
// three columns fit and both flags stay false.
const stage = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => stage.value)

const picked = ref<number>()
const timedOut = ref(false)
const revealed = computed(() => picked.value !== undefined || timedOut.value)

const start = () =>
  begin({
    onTimeout: () => {
      timedOut.value = true
      submitOnce([], 0)
    },
  })

// The 50/50: buys away one true claim, leaving the lie and one truth. Unlocks
// a third of the clock in (the buzz curve pays most early — an instant 50/50
// would be a strictly optimal buy), and hard mode stays unassisted.
const eliminatedIndex = ref<number>()
const hintsUsed = computed(() => (eliminatedIndex.value === undefined ? 0 : 1))
const fiftyFiftyUnlocked = computed(
  () =>
    !isHardMode(gameStore.game) &&
    eliminatedIndex.value === undefined &&
    elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED
)

const buyFiftyFifty = () => {
  const active = challenge.value
  if (!active || revealed.value || eliminatedIndex.value !== undefined) return
  const truths = active.statements
    .map((_, index) => index)
    .filter(index => index !== active.lieIndex)
  eliminatedIndex.value = sample(truths)
}

/** One panel for all three claims — the cards themselves are buttons, so the
 *  provenance lives on the prompt. */
const claimSources = computed(() =>
  dedupeAttributions(
    (challenge.value?.statements ?? []).map(statement => attributionFor(statement.accessorId))
  )
)

const statementLabel = (accessorId: GroupChallengeAccessorId) => accessorTopicLabel(accessorId)
const statementTopic = (accessorId: GroupChallengeAccessorId) =>
  getChallengeDetails(accessorId)?.topic

// Bounded indices get scale context on the card. The plot shows the CLAIMED
// amount — for the lie too, since plotting the truth would give it away.
const statementScales = computed(() =>
  (challenge.value?.statements ?? []).map(statement =>
    getScaleProps(statement.accessorId, statement.amount)
  )
)

const lieAccessorId = computed(() => {
  const active = challenge.value
  return active ? active.statements[active.lieIndex].accessorId : undefined
})

const foundLie = computed(
  () => picked.value !== undefined && picked.value === challenge.value?.lieIndex
)

const lieLabel = computed(() => {
  const active = challenge.value
  if (!active) return ''
  return statementLabel(active.statements[active.lieIndex].accessorId)
})

const truthDisplay = computed(() => {
  const active = challenge.value
  if (!active) return ''
  const real = getValueByAccessorID(active.country, active.statements[active.lieIndex].accessorId)
  return real ? formatAmount(real) : '—'
})

const claimClass = (index: number) => {
  const active = challenge.value
  if (!active) return undefined
  if (!revealed.value) return index === eliminatedIndex.value ? 'is-eliminated' : undefined
  if (index === active.lieIndex) return 'is-lie'
  if (index === picked.value) return 'was-picked'
  return 'is-truth'
}

const pick = (index: number) => {
  const active = challenge.value
  if (!active || revealed.value || showInterstitial.value) return
  if (index === eliminatedIndex.value) return
  picked.value = index
  // The clock must not decay through the reveal hold — the score is what the
  // player saw at the moment of the pick.
  stopCountdown()
  // Only three statements, all on screen — naming the pick would name the lie.
  announce({ kind: 'presence' })

  const correct = index === active.lieIndex
  // A round dealt without a duration has no clock to race — pay it in full.
  const fraction = active.durationSeconds ? remainingFraction.value : 1
  const score = correct
    ? hintDockedScore(
        buzzScore(active.maximumPoints, fraction),
        active.maximumPoints,
        hintsUsed.value
      )
    : 0
  // Submit at the pick — the reveal is pure display, and the server's flip
  // (the kind's reveal hold in ROUND_BEATS) ends the beat.
  submitOnce(correct ? [active.country] : [], score, fraction)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

.claim-stage {
  flex: 1;
  gap: 2.4rem;
  display: flex;
  min-height: 0;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

.plot-frame {
  pointer-events: auto;
  width: min(46rem, 92vw);
}

.flag-frame {
  padding: 1rem;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);

  .flag {
    width: 16rem;
    height: 9rem;
    display: block;
  }
}

.claim-list {
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  pointer-events: auto;
  grid-template-columns: repeat(3, minmax(20rem, 26rem));

  // The grid stretches the list items; the card fills its item, so all
  // three claims share one height regardless of how their copy wraps.
  li {
    display: flex;
  }
}

// Card chrome lives in StatCard — only behaviour and verdicts here.
.claim-card {
  cursor: pointer;
  font-size: 1.8rem;
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive),
    background-color var(--motion-base) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-0.3rem);
      border-color: var(--dark-blue);
    }
  }
  &:active:not(:disabled) {
    border-color: var(--dark-blue);
  }
  &:disabled {
    cursor: default;
  }

  .claim-value {
    font-size: 2.4rem;
  }

  // Post-pick, every card names its role — the washes carry the mood, the
  // tags carry the fact.
  .verdict-tag {
    font-size: 1.2rem;
    font-weight: bold;

    &.lie {
      color: var(--hior-ange);
    }
    &.truth {
      color: hsl(170.5, 34.7%, 38%);
    }
  }

  // A bought 50/50 greys its truth out of contention until the reveal washes
  // it like the others.
  &.is-eliminated {
    opacity: 0.35;
    filter: grayscale(1);
  }

  // Reveal: the lie glows coral, truths settle to mint
  &.is-lie {
    border-color: var(--hior-ange);
    background: flame(0.18);
  }
  &.is-truth {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }
  &.was-picked:not(.is-lie) {
    outline: 0.25rem solid var(--hior-ange);
    outline-offset: 0.2rem;
  }
}

.clock-footer {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

@media screen and (max-width: $tablet) {
  // Three 20rem columns overflow any phone: stack the claims full-width and
  // compact them so flag + all three cards share one screen.
  .claim-stage {
    gap: 1.2rem;
    width: 100%;
    overflow-y: auto;
    // Centering + overflow pushes the reveal's plot above the scroll origin,
    // where it can never be scrolled back into view — anchor to the top.
    justify-content: flex-start;
    // .main-board kills pointer events; the scroll container must take
    // touches itself or drags between the cards won't scroll.
    pointer-events: auto;
    overscroll-behavior: contain;
    padding-inline: 1.6rem;
    // The flag and the claims carry on under the prompt pills instead of
    // stopping dead short of them — with nothing behind the stage but the live
    // map, the fade has to be alpha rather than a cream wash. The stage's own
    // block padding rides the bleed (it lands on the same property).
    //
    // The TOP only: the clock footer is conditional (a round dealt without a
    // duration has none), so the stage is often flush with the shell's bottom
    // edge, and a bottom bleed there hangs the fade band below the shell — off
    // screen, exactly the nested-scroller trap the ledger was in. The bottom
    // fade sits on the real edge instead, which is where the cut was.
    @include scroll-mask;
    @include scroll-bleed(
      $top: 2.8rem,
      $pad-top: 0.4rem,
      $pad-bottom: calc(1.2rem + var(--safe-bottom))
    );
    @include snap-rows('> .claim-list > li');
  }

  .flag-frame .flag {
    width: 12rem;
    height: 6.75rem;
  }

  .claim-list {
    gap: 1rem;
    width: 100%;
    grid-auto-rows: 1fr;
    grid-template-columns: minmax(0, 1fr);
  }

  .claim-card {
    padding: 1rem 1.2rem;

    .claim-value {
      font-size: 2rem;
    }
  }
}
</style>
