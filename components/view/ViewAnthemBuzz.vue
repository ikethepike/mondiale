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

    <!-- Full-bleed backdrop, behind every other layer: the anthem's own words
         as a "now playing" wall. Masked where they name the country, unmasked
         and translated on the reveal. -->
    <LyricWall
      v-if="lyrics && unlocked.lyrics"
      :lyrics="lyrics"
      :revealed="resolved"
      :translated="translated"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!resolved">
        <h1 class="map-caption">Whose anthem is this?</h1>
        <span class="map-caption sub">Earlier answers score higher</span>
      </template>
      <template v-else>
        <h1 class="map-caption">It was {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">{{ anthem?.title ?? 'The anthem' }}</span>
      </template>
    </ChallengePrompt>

    <section class="stage">
      <AudioDock
        ref="dock"
        :clip="challenge.clip"
        :fraction="remainingFraction"
        idle-label="Tap play to start the round"
        :playing-label="resolved ? 'That was it' : 'Listening…'"
        ended-label="Tap to hear it again — the clock is still running"
        @started="onAudioStarted"
      />

      <!-- Chips land one at a time as the clock crosses each threshold, so
           they arrive on the shared `chip-in` beat rather than blinking on. -->
      <TransitionGroup v-if="!resolved" tag="ul" name="chain" class="hints">
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
      </TransitionGroup>
    </section>

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
import AudioDock from '~/components/challenge/AudioDock.vue'
import LyricWall from '~/components/challenge/LyricWall.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { ANTHEMS } from '~~/data/anthems.gen'
import { BORDERS } from '~~/data/borders.gen'
import { countryName } from '~~/lib/country'
import { useBuzzRound } from '~~/lib/use-buzz-round'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'
import type { Country } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
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
  onResolve: () => {
    const active = challenge.value
    if (!active) return
    // Land the answer as a place, not just a name — the country framed among
    // its neighbours, same as the silhouette reveal.
    const neighbours = BORDERS[active.country] ?? []
    gameStore.map.labels = true
    gameStore.map.reveal = active.country
    gameStore.map.focus = [active.country]
    gameStore.map.focusContext = neighbours
    gameStore.map.tints[active.country] = 'optimal'
    for (const neighbour of neighbours) gameStore.map.tints[neighbour] = 'inefficient'
  },
})

/** The curated wall, fetched rather than inlined — verses are long and most
 *  rounds end before the beat that shows them. A miss is silent: the round
 *  simply runs without a wall, exactly as it did before lyrics existed. */
const lyrics = ref<AnthemLyrics>()
watchEffect(async () => {
  const url = challenge.value?.lyricsUrl
  if (!url) return
  lyrics.value = await $fetch<AnthemLyrics>(url).catch(() => undefined)
})

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

const dock = ref<InstanceType<typeof AudioDock>>()
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const anthem = computed(() => (challenge.value ? ANTHEMS[challenge.value.country] : undefined))

/** The interstitial tap IS the gesture that unblocks autoplay — start the clip
 *  and the clock together, from inside that same user event. */
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
  const verdict = guess(country.isoCode, countryName(country.isoCode))
  if (verdict === 'correct') dock.value?.stop()
  if (verdict === 'wrong') {
    setTimeout(() => guessInput.value?.focus(), 3000)
  }
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.stage {
  flex: 1;
  gap: 1.4rem;
  display: flex;
  min-height: 0;
  padding: 1rem 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
  // Above the lyric backdrop, which pins itself at z-index 0.
  position: relative;
  z-index: 1;
}

.hints {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: row wrap;
  pointer-events: auto;
  justify-content: center;
}

.hint-chip {
  gap: 0.6rem;
  display: flex;
  padding: 0.5rem 1.2rem;
  font-size: 1.3rem;
  font-weight: 600;
  align-items: center;
  // Chips arrive one at a time as the clock passes each threshold, so each one
  // centres its own contents — a lone swatch row would otherwise sit left of
  // the dock it hangs under.
  text-align: center;
  justify-content: center;
  border-radius: 2rem;
  color: var(--soft-blue);
  background: #{milk(0.6)};
  // Entrance belongs to the TransitionGroup, not to the chip — a CSS animation
  // here would replay on every re-render and fight the landing.
}

.swatch {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: var(--swatch);
  border: 1px solid #{ink(0.2)};
}
</style>
