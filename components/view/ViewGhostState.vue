<template>
  <section class="ghost-state">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Ghost State`"
      title="A country almost nobody recognizes"
      :stakes="`All you get is the flag. Point to where on Earth it is — the closer you land, the more you score. ${DURATION_SECONDS} seconds.`"
      @done="start"
    />
    <template v-else>
      <header>
        <div ref="flagHost" class="flag" />

        <div class="prompt">
          <!-- Before the answer, never the name or the claimant: both hand the
               round over. A population says what kind of place it is. -->
          <template v-if="!submitted">
            <h1 class="map-caption">Where on Earth is this?</h1>
            <span class="map-caption sub">{{ teaser }}</span>
            <ChallengeTimer
              v-if="challenge"
              class="timer"
              :value="secondsLeft"
              :total="challenge.durationSeconds"
            />
          </template>
          <template v-else-if="territory">
            <h1 class="map-caption">{{ verdictHeadline }} — {{ territory.name }}</h1>
            <span class="map-caption sub">{{ statusLine }}</span>
          </template>
        </div>
      </header>

      <footer v-if="submitted && territory" class="dossier">
        <p class="map-caption facts">
          <span><strong>Claimed by</strong> {{ parentName }}</span>
          <span><strong>Internationally recognized by</strong> {{ recogniserNames }}</span>
          <span v-if="population"><strong>People</strong> {{ population }}</span>
        </p>
        <p v-for="line in recognitionLines" :key="line" class="map-caption note">{{ line }}</p>
      </footer>
    </template>
  </section>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref, watchEffect } from 'vue'
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import type { RecognitionTerritory } from '~~/data/recognition.gen'

// The whole world must stay tappable — the answer is a place, not a shape.
const {
  challenge,
  currentRound,
  showInterstitial,
  submitted,
  secondsLeft,
  begin,
  announce,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('ghost-state-challenge', { solo: false })

const DURATION_SECONDS = 25

const territory = ref<RecognitionTerritory>()
const flagSvg = ref('')
const flagHost = ref<HTMLElement>()
/** Mirrors ViewNameThatWater's reveal: praise, or a plain "It was". */
const verdictHeadline = ref('')

/**
 * Parse and sanitize before the flag enters the DOM — no scripts, no
 * foreignObject, no on* handlers. Same trust boundary as CountryFlag's inline
 * mode, and stricter than v-html.
 */
watchEffect(() => {
  if (!flagHost.value || !flagSvg.value) return

  const parsed = new DOMParser().parseFromString(flagSvg.value, 'image/svg+xml')
  const svg = parsed.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg') return

  svg.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
    }
  }

  // These flags run 2:1 and 3:2, unlike the 4:3 country set. Let the SVG keep
  // its own ratio inside the host box.
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  flagHost.value.replaceChildren(svg)
})

/**
 * Rebuilt from our own resolved data rather than echoing Natural Earth's
 * prose, which abbreviates ("Claimed by Azer.") and punctuates inconsistently.
 * Reveal-only: it names the claimant, which IS the answer.
 */
const statusLine = computed(() =>
  parentName.value ? `Self administered. Claimed by ${parentName.value}.` : ''
)

const population = computed(() =>
  territory.value?.pop ? new Intl.NumberFormat().format(territory.value.pop) : ''
)

/**
 * The pre-answer line. It must not name the place or its claimant — either
 * hands the round over. A population and a self-governing status say what
 * kind of place it is; the flag says the rest.
 */
const teaser = computed(() => {
  const people = territory.value?.pop
  if (!people) return 'Governs itself. Recognized by almost no one.'
  const rounded =
    people >= 1_000_000
      ? `${(people / 1_000_000).toFixed(1).replace(/\.0$/, '')} million`
      : new Intl.NumberFormat().format(people)
  return `Governs itself. ${rounded} people. Recognized by almost no one.`
})

/**
 * Governments that explicitly call it a country. Deliberately NOT the ones
 * that merely draw it as its own outline — the US and UK draw Abkhazia's
 * de-facto border and recognize no such state.
 */
const recognisers = computed(() =>
  Object.entries(territory.value?.povs ?? {})
    .filter(([, pov]) => pov.recognizes)
    .map(([code]) => code)
)

/**
 * Territories that are themselves one of NE's 31 points of view. Taiwan has a
 * TW column, so it would otherwise "recognize" itself. Saying so out loud is
 * true and useless.
 */
const SELF_POV: Record<string, string> = { taiwan: 'TW' }

/**
 * Named recognizers among Natural Earth's 31 points of view — NOT the world.
 * Abkhazia reads "Russia" here while four more UN members recognize it, and
 * Western Sahara reads as none while roughly 40 states recognize the SADR.
 *
 * The label is "Internationally recognized by" precisely so an empty value is
 * a claim about international law, not about how many columns this dataset
 * happens to carry. Never phrase it as a survey ("not one of 31 governments").
 */
const recogniserNames = computed(() => {
  const own = territory.value ? SELF_POV[territory.value.id] : undefined
  const named = recognisers.value
    .filter(code => code !== own)
    .map(code => (isValidISOCode(code) ? countryName(code) : code))
  // "Almost no one" rather than "no one": Taiwan has a dozen UN recognizers and
  // Western Sahara around forty, none of which NE gives a column.
  return named.length ? named.join(', ') : 'Almost no one'
})

/**
 * Attributed, never asserted: we say what each government says, never what
 * the place "is". The disagreement is the point.
 */
/**
 * Per-territory footnotes. Each is a fact the recognition count alone would
 * hide, and each is the reason its territory is interesting.
 */
const FOOTNOTES: Record<string, string> = {
  // Moscow recognized Abkhazia and South Ossetia in August 2008 and never did
  // the same here — while stationing ~1,500 troops at the Cobasna depot.
  transnistria: 'Not even Moscow, which has kept troops there since 1992.',
  // Its sole recognizer is itself recognized by fewer than half the world.
  somaliland:
    'Its only recognizer is Taiwan, which most of the world will not call a country either.',
  artsakh: 'Russia calls it a breakaway, and stops short of calling it a country.',
  abkhazia: 'Four other UN members recognize it: Nicaragua, Venezuela, Nauru and Syria.',
  'south-ossetia': 'Four other UN members recognize it: Nicaragua, Venezuela, Nauru and Syria.',
  'n-cyprus': 'Turkey alone. Every other government treats it as occupied Cyprus.',
  // NE gives Taiwan its own POV column, so it "recognizes itself". About a
  // dozen UN members plus the Holy See recognize it; most of the rest draw it
  // as a separate country without ever saying the word.
  taiwan: 'Most of the world draws it as its own country, and will not say so out loud.',
  // Recognition of the SADR fluctuates (36–47 UN members depending on the year
  // and the source), so the copy stays deliberately unquantified.
  'w-sahara':
    'Drawn apart by most of the world. Dozens of UN members recognize the Sahrawi republic.',
}

/**
 * The colour commentary under the dossier's facts.
 *
 * Deliberately no counts. Natural Earth carries 31 points of view, not 195,
 * so "not one of 31 governments" implies a survey of the world that this
 * dataset never took — and for Abkhazia it is simply false: five UN members
 * recognize it, four of which have no POV column here. The `<dl>` states what
 * the data supports; the footnote carries what it cannot.
 */
const recognitionLines = computed(() => {
  const found = territory.value
  return found && FOOTNOTES[found.id] ? [FOOTNOTES[found.id]] : []
})

const parentName = computed(() => (challenge.value ? countryName(challenge.value.parent) : ''))

const start = async () => {
  const active = challenge.value
  if (!active) return

  const [{ RECOGNITION_TERRITORIES }, { RECOGNITION_FLAGS }] = await Promise.all([
    import('~~/data/recognition.gen'),
    import('~~/data/recognition-flags.gen'),
  ])
  territory.value = RECOGNITION_TERRITORIES[active.territoryId]
  flagSvg.value = RECOGNITION_FLAGS[active.territoryId] ?? ''

  begin({ onTimeout: () => submitRound(undefined) })
}

const submitRound = (isoCode: ISOCountryCode | undefined) => {
  const active = challenge.value
  if (!active || submitted.value) return

  const correct = isoCode === active.parent
  verdictHeadline.value = !isoCode ? 'Out of time' : correct ? 'Well placed' : 'It was'

  // Reveal: bloom the outline (a marker when it's too small to draw), highlight
  // the state that claims it, and frame the two together.
  const found = territory.value
  if (found) {
    gameStore.map.feature = {
      d: found.d,
      kind: 'area',
      bounds: found.bounds,
      ...(found.micro ? { marker: found.micro } : {}),
    }
    gameStore.map.highlighted = new Set([active.parent])
    gameStore.map.focus = [active.parent]
  }
  // Green wash on success, nothing on failure — as ViewCapitalGuess and
  // ViewFlagPalette do. `'incorrect'` floods every country orange, which here
  // reads as "the whole world is wrong" rather than "you missed".
  gameStore.map.status = correct ? 'correct' : undefined

  submitOnce(isoCode ? [isoCode] : [])
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event) || submitted.value || showInterstitial.value) return
  const { isoCode } = event.detail
  if (!isValidISOCode(isoCode)) return
  // `announce` honours the room's guess policy; this mode broadcasts presence
  // only, since naming the claimant state would hand over the answer.
  announce({ kind: isoCode === challenge.value?.parent ? 'correct' : 'wrong', isoCode })
  submitRound(isoCode)
}

onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.ghost-state {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  gap: 1rem;
  z-index: 2;
  width: 100%;
  display: flex;
  padding: 2rem 4rem;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;

  h1 {
    margin: 0;
  }

  .sub {
    padding: 0.4rem 1.4rem;
    max-width: min(80vw, 40rem);
  }

  // Match the teaser's measure so the bar reads as part of the prompt.
  .timer {
    max-width: min(80vw, 40rem);
  }

  // Question, then teaser, stacked — never side by side.
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

// The whole prompt: a flag, and nothing that names the place.
.flag {
  width: min(34vw, 220px);
  border-radius: 0.4rem;
  box-shadow: 0 0.6rem 2rem hsla(215.7, 76.4%, 21.6%, 0.35);

  :deep(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
}

// The reveal: what the round withheld, in the map-caption idiom.
.dossier {
  gap: 0.6rem;
  z-index: 2;
  display: flex;
  padding: 0 2rem 2rem;
  align-items: center;
  flex-flow: column nowrap;
}

.facts {
  gap: 0.4rem 2rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;

  strong {
    opacity: 0.55;
    margin-right: 0.5rem;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
}

.note {
  margin: 0;
  max-width: min(90vw, 44rem);
  font-size: 1rem;
  text-align: center;
  line-height: 1.55;
  padding: 0.6rem 1.6rem;
}

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));
  }
}
</style>
