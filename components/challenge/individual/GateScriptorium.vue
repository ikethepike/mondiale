<template>
  <template v-if="challenge.scriptorium">
    <!-- The vellum veil: the world fades back while the writing takes the
         whole stage — the anthem round's scenic posture. It lives in the
         question branch, so answering unmounts it and the map returns in
         time for the result's reveal zoom. FIRST child on purpose: it pins
         z-index 0 and every later sibling rides at 1, so the caption and
         the clock stand ON the vellum, never under it (all inside the
         header's own stacking context — the shell footer's z2 is untouched). -->
    <div class="manuscript-veil" aria-hidden="true" />
    <!-- The LANGUAGE is the question, the script only the clue: the verdict
         accepts speakers of this language, so the copy must never promise
         script-matching (a Bulgarian sample is not "name any Cyrillic
         country" — Russia is a miss). -->
    <h1 class="map-caption">One language wrote this</h1>
    <span class="map-caption sub">Name a country that speaks it — the script is your clue.</span>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="SCRIPTORIUM_SECONDS" />

    <!-- The manuscript page: a couple of lines of the language in its own
         script, and nothing else — the writing IS the question. The `lang`
         attribute is what picks the right font (ViewTongueBuzz's mechanism);
         the script's NAME stays for the reveal, since for a single-country
         script it would answer the gate. -->
    <div v-if="sample" class="manuscript" :lang="sample.code" :dir="rtl ? 'rtl' : 'ltr'">
      <span
        v-for="(line, index) in sample.lines"
        :key="line"
        class="manuscript-line"
        :class="{ rtl }"
        :style="{ '--line-index': index }"
        >{{ line }}</span
      >
    </div>

    <Transition name="caption">
      <span v-if="shownRegion" class="region-note map-caption">
        Spoken mostly in {{ shownRegion }}
      </span>
    </Transition>

    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!shownRegion && regionHint && hintUnlocked"
          class="hint-button"
          type="button"
          @click="buyRegionHint"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Name the region (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
    </div>

    <Teleport v-if="footerReady" to="#gate-footer">
      <div class="guess-box">
        <CountryGuessInput placeholder="Type any country that speaks it" @guess="onGuess" />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import {
  scriptoriumAnswers,
  scriptoriumEntry,
  scriptoriumRegionHint,
  scriptoriumRtl,
} from '~~/lib/scriptorium'
import { anthemTongueSample, seededTongueSample, tongueSampleSource } from '~~/lib/tongue-samples'
import { useAnthemLyrics } from '~~/lib/use-anthem-lyrics'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { SCRIPTORIUM_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, isEasy, submitAnswer, giveUp } = useGateChallenge()

const footerReady = ref(false)
const boughtRegion = ref(false)

const { secondsLeft, remainingFraction, elapsedFraction, stop } = useGateClock(
  SCRIPTORIUM_SECONDS,
  { onExpire: () => giveUp(hintsUsed.value) }
)
const hintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

const language = computed(() => props.challenge.scriptorium?.language)

/** The written sample: a seed for the seeded languages, a couple of anthem
 *  lines through the same home for everyone else — lib/tongue-samples, shared
 *  with the Tongues round. A failed fetch leaves the gate unplayable-blind,
 *  so the safety expiry (`useGateClock`) still resolves it as a miss. */
const borrowedLyrics = useAnthemLyrics(() => {
  const active = language.value
  if (!active || seededTongueSample(active)) return undefined
  return tongueSampleSource(active, scriptoriumEntry(active)?.code)
})
const sample = computed(() => {
  const active = language.value
  if (!active) return undefined
  return (
    seededTongueSample(active) ??
    (borrowedLyrics.value ? anthemTongueSample(borrowedLyrics.value) : undefined)
  )
})

/** Easy mode gets the region for free (rosetta's freebie posture — the
 *  difficulty, not a purchase); everyone else can buy it once unlocked. */
const regionHint = computed(() =>
  language.value ? scriptoriumRegionHint(language.value) : undefined
)
const rtl = computed(() => !!language.value && scriptoriumRtl(language.value))
const shownRegion = computed(() =>
  isEasy.value || boughtRegion.value ? regionHint.value : undefined
)
const hintsUsed = computed(() => (boughtRegion.value ? 1 : 0))

onMounted(() => {
  footerReady.value = true
})
const buyRegionHint = () => {
  if (boughtRegion.value || status.value) return
  boughtRegion.value = true
}

const onGuess = (country: Country) => {
  if (status.value) return
  stop()
  submitAnswer(country.isoCode, {
    remainingFraction: remainingFraction.value,
    hintsUsed: hintsUsed.value,
  })
  // Fills = knowledge: light every accepted speaker for the reveal frame,
  // the same set the verdict just graded against (submitAnswer cleared the
  // board first, so this paint is the reveal's alone).
  if (language.value) {
    for (const isoCode of scriptoriumAnswers(language.value)) {
      gameStore.map.highlighted.add(isoCode)
    }
  }
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The world recedes to a cream hush so the writing is the whole stage —
// denser at the centre where the manuscript sits, thinner at the edges so
// the room still reads as the map's. Non-interactive by construction.
.manuscript-veil {
  inset: 0;
  z-index: 0;
  position: fixed;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 42%, milk(0.94) 30%, milk(0.72) 100%);
  animation: veil-in 1.2s var(--ease-out-expressive) both;
}

// Everything that follows the veil stands ON the vellum: a fixed sibling
// paints over statics regardless of DOM order, so the caption, clock, page
// and hint chips each take an explicit rung above it.
.manuscript-veil ~ * {
  position: relative;
  z-index: 1;
}

@keyframes veil-in {
  from {
    opacity: 0;
  }
}

// The page is the stage: unfamiliar glyphs rendered large on a cream leaf.
// The block-not-line posture from the tongue round's sample applies — two
// lines of script need room to breathe or the glyph shapes smear together.
.manuscript {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  margin-top: 1.6rem;
  padding: 2.2rem 3rem;
  max-width: min(56rem, 92vw);
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.92);
  border: 0.1rem solid ink(0.25);

  // The page is this column's giver: the header is capped at the console's
  // top edge, so on a short band the leaf shrinks and scrolls its own glyphs
  // rather than pushing the hint chip out of the band. It takes touches
  // itself — the question column stays pass-through so map-tap gates keep
  // working, which would leave an inherited scroller dead to a finger.
  min-height: 0;
  overflow-y: auto;
  pointer-events: auto;
  overscroll-behavior: contain;
}

.manuscript-line {
  font-size: 3rem;
  line-height: 1.5;
  text-align: center;
  color: var(--dark-blue);
  overflow-wrap: anywhere;

  // The write-on: a soft mask edge sweeps each line in READING direction,
  // like a pen's wake — the whole shaped line renders at once (no DOM
  // splitting, so Arabic joining and Tamil clusters are untouchable) and the
  // mask merely uncovers it. Line two follows a beat behind; the gate mounts
  // only after the interstitial clears, so the wipe starts with the clock.
  -webkit-mask-image: linear-gradient(to right, #000 45%, transparent 55%);
  mask-image: linear-gradient(to right, #000 45%, transparent 55%);
  -webkit-mask-size: 220% 100%;
  mask-size: 220% 100%;
  // Slow enough to savour — the expressive ease front-loads, so a short
  // clip read as a snap rather than a pen.
  animation: ink-wipe 2.4s var(--ease-out-expressive) both;
  animation-delay: calc(0.5s + var(--line-index, 0) * 1.4s);

  &.rtl {
    -webkit-mask-image: linear-gradient(to left, #000 45%, transparent 55%);
    mask-image: linear-gradient(to left, #000 45%, transparent 55%);
    animation-name: ink-wipe-rtl;
  }
}

// LTR: the mask's clear window slides left→right over the line; RTL mirrors.
@keyframes ink-wipe {
  from {
    -webkit-mask-position: 100% 0;
    mask-position: 100% 0;
  }
  to {
    -webkit-mask-position: 0% 0;
    mask-position: 0% 0;
  }
}
@keyframes ink-wipe-rtl {
  from {
    -webkit-mask-position: 0% 0;
    mask-position: 0% 0;
  }
  to {
    -webkit-mask-position: 100% 0;
    mask-position: 100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .manuscript-line {
    animation: none;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .manuscript-veil {
    animation: none;
  }
}

.region-note {
  margin-top: 0.8rem;
  padding: 0.4rem 1.4rem;
}

@media (max-width: $tablet) {
  .manuscript {
    padding: 1.6rem 2rem;
  }
  .manuscript-line {
    font-size: 2.3rem;
  }
}

// The keyboard is up: the band above the console is a couple of hundred
// pixels, and the page is the only thing in it worth the room. The
// instruction line goes (the player is already typing, and the h1 carries the
// question — Silhouette's posture), the clock steps down, and the glyphs
// take the size the band can hold instead of scrolling out of sight. Wins on
// specificity over the phone block above, so source order is not load-bearing.
:root.keyboard-up {
  .sub {
    display: none;
  }

  // The title pill keeps its words and gives up its cushion — every row it
  // spares is a row of glyphs.
  h1.map-caption {
    padding: 0.5rem 1.4rem;
  }

  .gate-clock {
    --clock-size: 4rem;
    --clock-seconds-size: 1.4rem;
  }

  // The column's own gap is separation enough here — the leaf's extra
  // top margin is another line of glyphs.
  .manuscript {
    gap: 0.6rem;
    margin-top: 0;
    padding: 1rem 1.4rem;
  }

  .manuscript-line {
    font-size: 2rem;
    line-height: 1.35;
  }
}
</style>
