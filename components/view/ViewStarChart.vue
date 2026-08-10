<template>
  <div v-if="challenge" class="star-chart challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — The Star Chart`"
      title="The lights go out"
      :stakes="`${stars.length} capitals pulse where they really stand. Type which city each one is — ${challenge.durationSeconds} seconds, no suggestions, and wrong names cost points.`"
      @done="begin"
    />

    <!-- The stars ride the live camera; the night skin fades them mid-gesture -->
    <NightLights :lights="lights" />

    <ChallengePrompt :hint="hint" :attributions="promptSources">
      <h1 class="map-caption night">
        {{ revealed ? 'The sky, named' : 'Which capitals are these?' }}
      </h1>
      <span class="map-caption sub night">
        {{ found.length }} of {{ stars.length }} named
        <template v-if="!revealed && initialsUnlocked"> · initials showing</template>
      </span>
    </ChallengePrompt>

    <footer ref="consoleFooter">
      <NightConsole
        v-show="!revealed"
        :lit="found.length"
        :quota="stars.length"
        :seconds-left="secondsLeft"
        :duration-seconds="challenge.durationSeconds"
      >
        <input
          ref="field"
          v-model="entry"
          type="text"
          aria-label="Name a capital city"
          autocomplete="off"
          autocapitalize="words"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          :disabled="!started || revealed"
          @keydown.enter.prevent="commit"
        />
        <!-- The prompt as an inert twin, never the placeholder attribute — its
             words put Safari's AutoFill Contact over the console (see
             templates/_ghost-placeholder.scss) -->
        <span v-if="!entry" class="ghost-placeholder" aria-hidden="true">Name a capital…</span>
      </NightConsole>
      <GuessTicker
        class="night-ticker"
        :entries="entries"
        :players="gameStore.game?.players ?? {}"
      />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import NightConsole from '~/components/challenge/NightConsole.vue'
import NightLights, { type NightLight } from '~/components/challenge/NightLights.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { capitalCountryByName, capitalStar } from '~~/lib/capitals'
import { countryName, getCountry } from '~~/lib/country'
import { HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { starChartAnswers, starChartStars } from '~~/lib/star-chart'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useNocturne } from '~~/lib/use-nocturne'
import { useIsCoarsePointer } from '~~/lib/use-viewport'

/**
 * The Star Chart: the map goes nocturne-dark and three stars pulse at their
 * capitals' true coordinates — type which city each one is.
 *
 * A capital-guess round asks which country owns a skyline; this asks what city
 * sits at a spot, so the answer is typed as a CITY and scored as the country
 * that owns it (`capitalCountryByName`). That single resolution is what lets
 * the round ride the shared collect-a-set engine and be graded, server-side,
 * by the same `blitzScore` every other set round uses.
 *
 * No suggestion list, on any difficulty: the list of capitals would BE the
 * answer sheet (the nocturne rule). Outside hard mode the stars whisper their
 * initials a third of the way in instead.
 */
const promptSources = [...datasetAttribution('capitals'), ...datasetAttribution('cities')]

// The night IS the map, so this mode keeps the real country shapes rather
// than the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  elapsedFraction,
  begin: beginRound,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('star-chart-challenge', { solo: false })

const field = ref<HTMLInputElement>()
const entry = ref('')
const isCoarsePointer = useIsCoarsePointer()

// The sky stays visible above the console (and the software keyboard)
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

/** The dealt stars as points — resolved through the shared join, so the dots
 *  and the scorecard's ledger can never name different cities. */
const stars = computed(() => (challenge.value ? starChartStars(challenge.value) : []))

/** What the round is scored on — the SAME resolved list the server grades, so
 *  the early finish fires exactly when the pot is full. */
const answers = computed(() => (challenge.value ? starChartAnswers(challenge.value) : []))

/** The reveal is the server-paced beat behind the submit (ROUND_BEATS' hold
 *  for this kind): every star names itself, so a miss still teaches. */
const revealed = computed(() => submitted.value)

/** The non-hard aid: a star's first letter, a third of the way in. */
const initialsUnlocked = computed(
  () => !!challenge.value?.initials && elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED
)

const {
  found,
  start: begin,
  onGuess,
} = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers,
    // Both copies speak in CITIES: the player typed a city, and being told
    // about a country they never named would read as a different question.
    wrongHint: country =>
      `${capitalStar(country.isoCode)?.name ?? countryName(country)} isn't one of tonight's stars`,
    wrongLabel: country => capitalStar(country.isoCode)?.name ?? countryName(country),
    // The stars frame themselves — the camera holds the whole constellation.
    decorate: () => {
      gameStore.map.focus = answers.value
    },
    focusInput: () => {
      // Round-start autofocus is desktop-only, same policy as the input homes
      if (!isCoarsePointer.value) field.value?.focus()
    },
  }
)

// Found countries glow through the night while the round runs; at the reveal
// every star's country lights, so the table sees where all three really sit.
// Declared after the round engine — the spotlight getter reads `found`.
const { nightfall } = useNocturne(() => (revealed.value ? answers.value : found.value))

/** A typed line: resolve the city to the country whose capital it is, then let
 *  the shared engine judge it. A name no capital answers to is a plain miss
 *  hint — it never spends a guess, because there is nothing to score. */
const commit = () => {
  const typed = entry.value.trim()
  if (!typed || !started.value || revealed.value) return
  entry.value = ''

  const isoCode = capitalCountryByName(typed)
  const country = isoCode ? getCountry(isoCode) : undefined
  if (!country) return announce({ hint: `No capital called “${typed}”` })
  onGuess(country)
}

const lights = computed<NightLight[]>(() =>
  stars.value.map((star, index) => {
    const named = found.value.includes(star.isoCode)
    // Keyed off the DEALT position, not the rendered one: a star that stopped
    // resolving shifts the rendered indices and would slide every aid by one.
    const initial = challenge.value?.initials?.[challenge.value.stars.indexOf(star.isoCode)]
    if (named || revealed.value) {
      // The map speaks the local tongue once a star is named: type "Moscow",
      // light "Москва" — canonical beneath, and only when it's another word.
      const label = star.native ?? star.local ?? star.name
      return {
        key: star.isoCode,
        lat: star.lat,
        lng: star.lng,
        state: named ? 'lit' : 'missed',
        size: 1.1,
        label,
        sublabel:
          label.toLowerCase() === star.name.toLowerCase()
            ? countryName(star.isoCode)
            : `${star.name} · ${countryName(star.isoCode)}`,
        badge: `${index + 1}`,
      }
    }
    return {
      key: star.isoCode,
      lat: star.lat,
      lng: star.lng,
      state: 'pulsing',
      size: 1.1,
      ...(initialsUnlocked.value && initial ? { label: `${initial}…` } : {}),
      badge: `${index + 1}`,
    }
  })
)

// Nightfall lands with the round, not with the mount: the interstitial is a
// day-lit card, and darkening the world behind it wastes the beat.
watch(started, live => {
  if (live) nightfall()
})
</script>
<style lang="scss" scoped>
// The prompt column wears the night instead of the cream pill: over a black
// map the parchment caption is the brightest thing on screen, and it fights
// the stars for the eye. The recipe stays ChallengePrompt's — this only
// repaints it.
.map-caption.night {
  border: none;
  background: none;
  color: hsla(45, 96%, 90%, 0.95);
  text-shadow: 0 0.1rem 1.2rem hsla(216, 58%, 4%, 0.95);

  &.sub {
    color: hsla(216, 30%, 80%, 0.9);
  }
}

// Chips over the console, so the room's ephemeral traffic reads against the
// dark rather than under the input.
footer {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column-reverse nowrap;
}

.night-ticker {
  pointer-events: auto;
}
</style>
