<template>
  <div v-if="challenge" class="anthem-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Opening Ceremony`"
      title="Whose anthem is this?"
      :stakes="`A national anthem plays for ${challenge.durationSeconds} seconds — buzz in early for more points. Hints arrive as it runs, and a wrong buzz locks you out for a moment.`"
      @done="onInterstitialDone"
    />

    <ChallengePrompt
      :hint="hint"
      :attributions="promptSources"
      attribution-label="Sources"
      :attribution-credit="resolved ? anthemCredit : undefined"
    >
      <template v-if="!resolved">
        <h1 class="map-caption">Whose anthem is this?</h1>
        <span class="map-caption sub">Earlier answers score higher</span>
      </template>
      <template v-else>
        <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">{{ anthem?.title ?? 'The anthem' }}</span>
      </template>
    </ChallengePrompt>

    <AudioScene
      ref="scene"
      :clips="[challenge.clip]"
      :progress="elapsedFraction"
      :iso-codes="[challenge.country]"
      :settled="resolved"
      @started="onAudioStarted"
    >
      <template #backdrop>
        <!-- Behind the stage but above the field: the anthem's own words as a
             "now playing" wall, masked where they name the country. -->
        <LyricWall
          v-if="lyrics && unlocked.lyrics"
          :lyrics="lyrics"
          :revealed="resolved || unlocked.lyricsUnmask"
          :translated="translated"
        />
      </template>

      <template #hints>
        <li v-if="unlocked.region && challenge.region" key="region" class="hint-chip">
          Region: {{ challenge.region }}
        </li>
        <li
          v-if="unlocked.swatches && challenge.swatches?.length"
          key="swatches"
          class="hint-chip swatch-chip"
        >
          Flag:
          <span
            v-for="colour in challenge.swatches"
            :key="colour"
            class="swatch"
            :style="{ '--swatch': colour }"
          />
        </li>
        <li v-if="unlocked.initial && challenge.initial" key="initial" class="hint-chip">
          Starts with “{{ challenge.initial }}”
        </li>
      </template>
    </AudioScene>

    <footer v-if="!resolved" class="suggest-berth">
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      <div class="guess-box">
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started || lockedOut"
            :placeholder="lockedOut ? 'Locked out…' : 'Buzz in — type the country'"
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
import LyricWall from '~/components/challenge/LyricWall.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { ANTHEMS } from '~~/data/anthems.gen'
import { datasetAttribution, dedupeAttributions, mediaCreditLine } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
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
  announce,
  entries,
  gameStore,
  resolved,
  lockedOut,
  unlocked,
  revealStage,
  registerCleanup,
  begin,
  guess,
} = useBuzzRound('anthem-buzz-challenge', {
  isCorrect: (active, isoCode) => active.country === isoCode,
  maximumPoints: active => active.maximumPoints,
  lockoutHint: name => `Not ${name} — locked out for 3 seconds`,
  onLockoutEnd: () => nextTick(() => guessInput.value?.focus()),
  // No map reveal. "Whose anthem" is not a geography question, and flying a
  // camera to one country adds nothing the name and the settled field do not
  // already say. The payoff is realising the colours WERE the answer, forming
  // all along; the flag, title and composer land on the scorecard moments
  // later, so a second scorecard here would only compete with the verse.
})

/** The curated wall, fetched rather than inlined — verses are long and most
 *  rounds end before the beat that shows them. */
const lyrics = useAnthemLyrics(() => challenge.value?.lyricsUrl)

/** The closing beat: masks come off with the answer, then the verse turns to
 *  English a moment later, so the two reveals read as separate movements
 *  rather than one busy flash. */
const translated = ref(false)
const TRANSLATE_AFTER_MS = 1600
watch(resolved, isResolved => {
  if (!isResolved) return
  const timer = setTimeout(() => (translated.value = true), TRANSLATE_AFTER_MS)
  registerCleanup(() => clearTimeout(timer))
})

const scene = ref<InstanceType<typeof AudioScene>>()
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const anthem = computed(() => (challenge.value ? ANTHEMS[challenge.value.country] : undefined))

/** The recording and, once the wall is up, the lyric text behind it. */
const promptSources = computed(() =>
  dedupeAttributions([
    ...datasetAttribution('anthems'),
    ...(lyrics.value ? datasetAttribution('anthem-lyrics') : []),
  ])
)

/** The performer's line stays sealed until the reveal — it can name the country. */
const anthemCredit = computed(() => mediaCreditLine(anthem.value, 'commons-media'))

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
// share them. Only the swatch is this round's own.
.swatch {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: var(--swatch);
  border: 1px solid #{ink(0.2)};
}
</style>
