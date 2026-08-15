<template>
  <div v-if="challenge" class="tongue-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Tongues`"
      title="What language is this?"
      :stakes="`Someone speaks for ${challenge.durationSeconds} seconds. Name ANY country ${motherTongueScope(challenge)} where that language is spoken — there is more than one right answer. Buzz early for more points.`"
      @done="onInterstitialDone"
    />

    <ChallengePrompt
      :hint="hint"
      :hint-tone="hintTone"
      :attributions="promptSources"
      attribution-label="Sources"
    >
      <template v-if="!resolved">
        <h1 class="map-caption">Where is this spoken?</h1>
        <span class="map-caption sub">{{ tongueBuzzRule(challenge) }}</span>
      </template>
      <template v-else>
        <h1 class="map-caption">That was {{ challenge.language }}</h1>
        <span class="map-caption sub">{{ tongueBuzzTally(challenge) }}</span>
      </template>
    </ChallengePrompt>

    <AudioScene
      ref="scene"
      :clips="challenge.clips"
      :progress="elapsedFraction"
      :iso-codes="challenge.countries"
      :settled="resolved"
      :stand-down="resolved"
      @started="onAudioStarted"
    >
      <!-- Same ladder as the anthem round: each chip lands as the clock crosses
           its threshold, narrowing the field without naming a country. -->
      <template #hints>
        <!-- Count-neutral on purpose: "one of them" implies plural, and this
             chip lands before the speaker-count hint has earned its reveal. -->
        <li v-if="unlocked.region && challenge.region" key="region" class="hint-chip">
          Spoken in {{ challenge.region }}
        </li>
        <li v-if="unlocked.swatches && challenge.speakerCount" key="count" class="hint-chip">
          Spoken in {{ challenge.speakerCount }}
          {{ challenge.speakerCount === 1 ? 'country' : 'countries' }}
        </li>
        <!-- Seeing the language written is the strongest hint short of naming
             a country: the script alone rules most of the world out. -->
        <li v-if="unlocked.swatches && sample" key="sample" class="hint-chip sample-chip">
          <span class="sample-script">Written in {{ sample.script }}</span>
          <span class="sample-lines" :lang="sample.code">
            <span v-for="(line, index) in sample.lines" :key="index">{{ line }}</span>
          </span>
        </li>
        <li v-if="unlocked.initial && challenge.initial" key="initial" class="hint-chip">
          One starts with “{{ challenge.initial }}”
        </li>
      </template>

      <template #stage>
        <ol v-if="resolved" class="country-chip-list answers" aria-label="Every correct answer">
          <CountryChip
            v-for="isoCode in challenge.countries"
            :key="isoCode"
            class="map-caption"
            :country="getCountry(isoCode)"
          />
        </ol>
      </template>
    </AudioScene>

    <footer v-if="!resolved" class="suggest-berth">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <div class="guess-box">
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started || lockedOut"
            :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — name a country'"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import AudioScene from '~/components/challenge/AudioScene.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { speaksTongue } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import {
  motherTongueScope,
  speaksButOffBoard,
  tongueBuzzRule,
  tongueBuzzTally,
} from '~~/lib/language-rounds'
import { anthemTongueSample, tongueSampleSource } from '~~/lib/tongue-samples'
import { useAnthemLyrics } from '~~/lib/use-anthem-lyrics'
import { useBuzzRound } from '~~/lib/use-buzz-round'
import type { Country } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  elapsedFraction,
  hint,
  hintTone,
  announce,
  entries,
  gameStore,
  resolved,
  lockedOut,
  unlocked,
  revealStage,
  begin,
  guess,
} = useBuzzRound('tongue-buzz-challenge', {
  // The same predicate the server verifies with — a second membership test
  // here would drift the moment the answer set grows a qualifier.
  isCorrect: (active, isoCode) => speaksTongue(active, isoCode),
  maximumPoints: active => active.maximumPoints,
  lockoutHint: name => `${name} doesn't speak it`,
  // A speaker standing off the board is right about the world and wrong only
  // about this round: it must not spend a lockout, and must not be broadcast
  // to the room as a miss.
  reject: (active, isoCode) =>
    speaksButOffBoard(active, isoCode)
      ? `${countryName(getCountry(isoCode))} does have it — but this round is ${motherTongueScope(active)}`
      : undefined,
  onLockoutEnd: () => guessInput.value?.focus(),
  onResolve: () => {
    const active = challenge.value
    if (!active) return
    // Light up every correct country at once — the whole point of the round is
    // that the answer was a set.
    gameStore.map.labels = true
    gameStore.map.focus = active.countries
    for (const isoCode of active.countries) gameStore.map.tints[isoCode] = 'optimal'
  },
})

const scene = ref<InstanceType<typeof AudioScene>>()
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

/** The written-sample hint. The dealer ships one for seeded languages; every
 *  other language borrows a couple of anthem lines through the same home
 *  (`lib/tongue-samples.ts`). Gated on `region`: a dealer with no speaker
 *  country ships no hint fields, and the view must not conjure hints the
 *  dealer withheld. A failed fetch is silent — the round runs without it. */
const borrowedLyrics = useAnthemLyrics(() => {
  const active = challenge.value
  if (!active?.region || active.sample) return undefined
  return tongueSampleSource(active.language)
})
const sample = computed(
  () =>
    challenge.value?.sample ??
    (borrowedLyrics.value ? anthemTongueSample(borrowedLyrics.value) : undefined)
)

/** The clips are Common Voice; a borrowed writing sample adds the anthem
 *  walls it was lifted from. */
const promptSources = computed(() =>
  dedupeAttributions([
    ...datasetAttribution('tongues'),
    ...(borrowedLyrics.value ? datasetAttribution('anthem-lyrics') : []),
  ])
)

/** Show the stage and stop. The round never plays on its own: the player
 *  presses play, and only that starts the clip and the clock together. An
 *  autoplay attempt here would start the countdown on desktop while iOS sat
 *  silent — the same round running two different ways. */
const onInterstitialDone = () => revealStage()

/** The clock hangs off audio genuinely playing, never off a load event, so a
 *  slow download or a withheld autoplay can't eat anyone's buzz time. */
const onAudioStarted = () => {
  begin(() => nextTick(() => guessInput.value?.focus({ auto: true })))
}

const onGuess = (country: Country) => {
  if (guess(country.isoCode, countryName(country.isoCode)) === 'correct') scene.value?.stop()
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The stage, hint row and chip recipe live in `AudioScene` — both audio modes
// share them.

// The answer roll sits clear of the dock's caption rather than under it.
.answers {
  margin-top: 1.6rem;
}

// The written sample is a block rather than a line: two lines of script need
// room to be read, not squeezed onto a pill.
.sample-chip {
  gap: 0.4rem;
  flex-flow: column nowrap;
  align-items: flex-start;
  padding: 0.7rem 1.2rem;
}

.sample-script {
  font-size: 1.1rem;
  opacity: 0.75;
}

.sample-lines {
  gap: 0.15rem;
  display: flex;
  font-size: 1.5rem;
  line-height: 1.4;
  flex-flow: column nowrap;
  color: var(--dark-blue);
}
</style>
