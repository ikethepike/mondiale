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
    <!-- The page never arrived. Say so rather than staging an empty leaf: an
         unreadable question the player can't tell is broken is the one shape
         this gate had no move out of. -->
    <div v-else-if="blind" class="manuscript manuscript-blank">
      <span class="blank-note">The page didn't load — every hint is open.</span>
    </div>

    <!-- The ladder's bought rungs, weakest first — they accumulate rather
         than replace, so a player who paid for three is looking at all
         three while they type. -->
    <TransitionGroup name="caption" tag="div" class="hint-notes">
      <span v-for="note in shownHints" :key="note" class="hint-note map-caption">{{ note }}</span>
    </TransitionGroup>

    <!-- One chip at a time: the ladder is a descent, so the rung on offer is
         always the topmost still standing. -->
    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="ladder.offered"
          class="hint-button"
          type="button"
          @click="buyHint(ladder.offered)"
        >
          <StatTopicIcon
            class="hint-icon"
            :topic="ladder.offered === 'region' ? 'question' : 'reveal'"
          />
          {{ offeredLabel }} (−{{ GATE_HINT_BITE_STEPS }} from the pot)
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
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import {
  SCRIPTORIUM_RUNGS,
  scriptoriumAnswers,
  scriptoriumEntry,
  scriptoriumLadder,
  scriptoriumRegionHint,
  scriptoriumRtl,
  type ScriptoriumRung,
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

/**
 * The hint ladder, weakest rung first. Three rungs rather than one because a
 * single region chip ("Spoken mostly in Asia" — eighteen of the pool's thirty
 * languages) narrowed nothing, and a player who could not read the page had
 * no second move: the mode's only progression was to run the clock out and
 * forfeit the walk. Each rung genuinely narrows further than the last, and the
 * bottom one ends the gate outright — it pays no leap (three bites clear the
 * pot), but a correct answer still keeps the walk a miss would forfeit.
 */
const bought = reactive(new Set<ScriptoriumRung>())

/** What each rung's chip is called in the shop. */
const RUNG_LABELS: { [rung in ScriptoriumRung]: string } = {
  region: "Where it's spoken",
  script: 'Name the script',
  country: 'Name one country',
}

const { secondsLeft, remainingFraction, elapsedFraction, stop } = useGateClock(
  SCRIPTORIUM_SECONDS,
  { onExpire: () => giveUp(hintsUsed.value) }
)

const language = computed(() => props.challenge.scriptorium?.language)

/** The written sample: a seed for the seeded languages, a couple of anthem
 *  lines through the same home for everyone else — lib/tongue-samples, shared
 *  with the Tongues round. A failed fetch leaves nothing to read, which `blind`
 *  below turns into an open ladder rather than a gate with no move in it. */
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

const rtl = computed(() => !!language.value && scriptoriumRtl(language.value))

/**
 * The page never arrived: no seed, no lyric wall, or the fetch failed. The
 * player is being asked to read nothing at all, so the whole ladder opens at
 * once rather than leaving them to watch a blank leaf run the clock out. The
 * first wave is the tell — before it, `sample` is merely still in flight.
 */
const blind = computed(() => !sample.value && elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

/** What each rung actually says, in the ladder's own order. */
const notes = computed<{ [rung in ScriptoriumRung]: string | undefined }>(() => {
  const active = language.value
  // Rung 1: where its speakers are. Just the region — an answer tally was
  // tried here and read as bookkeeping, not as a clue.
  const region = active ? scriptoriumRegionHint(active) : undefined
  // Rung 2: the script by name. For a family script (Cyrillic, Devanagari) it
  // narrows; for a one-country script it all but answers — which is exactly
  // the grading the ladder wants, and the deal decides which you get. Read
  // from the pool entry, the same field ScriptoriumReveal names it by.
  const entry = active ? scriptoriumEntry(active) : undefined
  return {
    region: region ? `Spoken mostly in ${region}` : undefined,
    script: entry ? `Written in ${entry.script}` : undefined,
    // Rung 3, the last resort (border-detective's ISO chip, one rung down):
    // the dealt subject is the most populous in-play speaker and always grades
    // correct, so this ends the gate. It stakes nothing and saves the walk.
    country: `${countryName(props.challenge.country)} counts`,
  }
})

/** What the shop shows — whose rules are lib/scriptorium's, not this view's.
 *  Easy mode gets rung 1 free (rosetta's freebie posture — the difficulty,
 *  not a purchase), so it shows without ever counting against the pot. */
const ladder = computed(() =>
  scriptoriumLadder({
    elapsedFraction: elapsedFraction.value,
    bought,
    free: isEasy.value ? ['region'] : [],
    mute: SCRIPTORIUM_RUNGS.filter(rung => !notes.value[rung]),
    blind: blind.value,
    resolved: !!status.value,
  })
)
const shownHints = computed(() =>
  ladder.value.shown.map(rung => notes.value[rung]).filter((note): note is string => !!note)
)
const offeredLabel = computed(() => (ladder.value.offered ? RUNG_LABELS[ladder.value.offered] : ''))

const hintsUsed = computed(() => bought.size)

onMounted(() => {
  footerReady.value = true
})
const buyHint = (rung: ScriptoriumRung) => {
  if (status.value || bought.has(rung)) return
  bought.add(rung)
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

.manuscript-blank {
  min-height: 8rem;
  justify-content: center;
}

.blank-note {
  font-size: 1.4rem;
  text-align: center;
  color: var(--soft-blue);
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

// The bought rungs stack under the leaf, narrowest last — a short column so
// three of them never crowd the console out of the band.
.hint-notes {
  gap: 0.4rem;
  display: flex;
  margin-top: 0.8rem;
  align-items: center;
  flex-flow: column nowrap;
}

.hint-note {
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

  // Three bought rungs is three rows the glyphs would otherwise have.
  .hint-notes {
    gap: 0.2rem;
    margin-top: 0.4rem;
  }
  .hint-note {
    padding: 0.2rem 1rem;
  }

  .manuscript-line {
    font-size: 2rem;
    line-height: 1.35;
  }
}
</style>
