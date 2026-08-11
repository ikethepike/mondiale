<template>
  <div v-if="challenge" class="terra-incognita challenge-shell" :class="{ collapsing }">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — Terra Incognita`"
      title="The atlas is failing"
      :stakes="`Countries are being erased from the map, one every ${cadenceSeconds} seconds. Name a missing country to put it back. Let ${challenge.collapseThreshold} go at once and the world starts coming apart.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">{{ revealed ? 'What you never noticed' : "What's missing?" }}</h1>
      <span class="map-caption sub">
        <template v-if="revealed">
          {{ found.length }} of {{ deck.length }} restored{{
            missed.length ? ` · ${missed.length} still gone, named on the map` : ' · a clean world'
          }}
        </template>
        <template v-else>
          {{ found.length }} restored · {{ outstanding.length }} still gone
        </template>
      </span>

      <!-- The state of the world, as a bar of slots rather than a number: the
           mode's tension is how many holes stand open at once, and a row
           filling toward the collapse line says that at a glance. It rides
           the header rather than the shell's column — the shell centres a
           stray middle child, which put the gauge out in the South Atlantic
           reading as a map annotation. -->
      <ul
        v-if="!revealed"
        class="collapse-gauge"
        :aria-label="`${outstanding.length} countries missing`"
      >
        <li
          v-for="slot in challenge.collapseThreshold"
          :key="slot"
          class="slot"
          :class="{ lost: slot <= outstanding.length }"
        />
      </ul>
    </ChallengePrompt>

    <footer v-if="!revealed" ref="consoleFooter" class="suggest-berth">
      <TransitionGroup tag="ol" name="chain" class="country-chip-list">
        <CountryChip
          v-for="isoCode in guesses"
          :key="isoCode"
          class="map-caption"
          :class="{ stray: !answerSet.has(isoCode) }"
          :country="getCountry(isoCode)"
        />
      </TransitionGroup>
      <div class="guess-box">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started"
            :excluded="guesses"
            placeholder="Name a missing country…"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { MOTION } from '~~/lib/motion'
import { terraVanishedBy } from '~~/lib/terra-incognita'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Terra Incognita: the world map, minus pieces of itself.
 *
 * The whole round is a function of the clock. The challenge carries the deck
 * and the cadence, so the view never learns which country went from the wire —
 * it derives the failing atlas from elapsed time through `terraVanishedBy`,
 * the same way the reveal and the scorecard later replay it. That is what lets
 * every seat and the booth watch one identical world come apart with nothing
 * broadcast between them.
 *
 * The answer set GROWS with the clock: only countries that have actually gone
 * can be named. A country still sitting on the map is a plain wrong guess with
 * a plain wrong guess's cost — never a bounce, because a bounce that said "not
 * yet" would tell the player it was coming.
 */
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
  registerCleanup,
  gameStore,
} = useGroupChallenge('terra-incognita-challenge', { solo: false })

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

const cadenceSeconds = computed(() => Math.round((challenge.value?.cadenceMs ?? 0) / 1000))

/** Milliseconds into the round. The clock ticks per second and the cadence is
 *  measured in whole seconds, so second-granularity is exact here. */
const elapsedMs = computed(() =>
  challenge.value ? elapsedFraction.value * challenge.value.durationSeconds * 1000 : 0
)

/** What the atlas has lost so far — the live answer set. */
const gone = computed(() =>
  challenge.value ? terraVanishedBy(challenge.value, elapsedMs.value) : []
)

const {
  guesses,
  answerSet,
  found,
  start: begin,
  onGuess,
} = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers: gone,
    // True of every country still drawn, whether or not it is in the deck —
    // so the miss copy costs the player a point without telling them one is
    // on its way.
    wrongHint: country => `${countryName(country)} is still on the map`,
    focusInput: () => guessInput.value?.focus({ auto: true }),
  }
)

/** Gone and not yet named back — what the collapse gauge counts. */
const outstanding = computed(() => gone.value.filter(isoCode => !found.value.includes(isoCode)))

/** The server's reveal hold (ROUND_BEATS) runs from the seat's own submit;
 *  everything below is display-only, and the server's flip ends the beat. */
const revealed = computed(() => submitted.value)
const deck = computed(() => challenge.value?.vanishings ?? [])
const missed = computed(() => deck.value.filter(isoCode => !found.value.includes(isoCode)))

const collapsing = computed(
  () => !!challenge.value && outstanding.value.length >= challenge.value.collapseThreshold
)

/**
 * Paint the failing atlas. The erased set is everything gone that the player
 * has not restored; `restoring` holds a country for one beat so its outline
 * draws itself back on rather than snapping back with the layer swap.
 */
const restoring = ref<ISOCountryCode[]>([])
watch(found, (now, before = []) => {
  const fresh = now.filter(isoCode => !before.includes(isoCode))
  if (!fresh.length) return
  restoring.value = [...restoring.value, ...fresh]
  // Held exactly as long as the outline takes to draw itself (the same token
  // the map's `.atlas-restored` animation runs on), then dropped so the
  // country is plain map again.
  const settle = setTimeout(() => {
    restoring.value = restoring.value.filter(isoCode => !fresh.includes(isoCode))
  }, MOTION.slow * 1000)
  registerCleanup(() => clearTimeout(settle))
})

/**
 * The map IS the reveal. When the round resolves, the countries the player
 * saved stay whole and the ones they never noticed stay erased — each one
 * wearing its own name, written across the hole where it should have been.
 * A labelled blank is the single most useful frame this mode can end on: it
 * puts the name and the place together at the exact moment the player has
 * just proved they had not connected them.
 */
watchEffect(() => {
  gameStore.map.vanished = revealed.value ? missed.value : outstanding.value
  gameStore.map.restoring = restoring.value
  gameStore.map.countryLabels = revealed.value
    ? Object.fromEntries(missed.value.map(isoCode => [isoCode, countryName(isoCode)]))
    : undefined
  gameStore.map.focus = revealed.value ? missed.value : []
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The gauge sits under the prompt, centred: a row of slots that fill as the
// world empties out. It is the only chrome the round adds — everything else
// the player needs to read is the map itself.
// It stands over open map, so it takes the same cream scrim every caption
// wears — without it the slots read as a dashed annotation drawn ON the
// world rather than chrome floating above it.
.collapse-gauge {
  @include caption-surface(999px);
  gap: 0.6rem;
  display: flex;
  list-style: none;
  align-items: center;
  pointer-events: none;
  margin: 0.8rem auto 0;
  padding: 0.6rem 1rem;
}

.slot {
  width: 1.6rem;
  height: 0.5rem;
  border-radius: 999px;
  background: ink(0.12);
  transition: background var(--motion-base) var(--ease-smooth);

  &.lost {
    background: flame(0.85);
  }
}

// Past the line the page itself takes on the alarm — a wash at the edges, not
// a banner, so nothing covers the map the player is scanning.
.terra-incognita.collapsing::before {
  content: '';
  inset: 0;
  position: fixed;
  pointer-events: none;
  box-shadow: inset 0 0 12rem flame(0.28);
  animation: collapse-breath 2.4s var(--ease-smooth) infinite;
}

@keyframes collapse-breath {
  50% {
    box-shadow: inset 0 0 16rem flame(0.42);
  }
}

footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
