<template>
  <h1 class="map-caption">{{ prompt }}</h1>
  <div v-if="challenge.partyLogo" class="logo-frame">
    <img class="party-logo" :src="challenge.partyLogo.image" alt="" />
  </div>

  <div v-if="ask === 'origin'" class="gate-options card-options logo-options">
    <button
      v-for="option in challenge.options"
      :key="option"
      class="card-option"
      type="button"
      @click="submitAnswer(option)"
    >
      <CountryChip tag="span" :country="getCountry(option)" />
    </button>
  </div>

  <div v-else-if="ask === 'ruling'" class="gate-options card-options ruling-options">
    <button
      v-for="choice in [true, false]"
      :key="String(choice)"
      class="card-option"
      type="button"
      :disabled="answered"
      :class="verdictOn(choice === truthOfRuling)"
      @click="answer(choice === truthOfRuling)"
    >
      {{ choice ? 'Yes, they govern' : 'No, they do not' }}
    </button>
  </div>

  <div v-else-if="ask === 'spectrum'" class="spectrum-stage">
    <div class="spectrum-axis" :class="{ answered }">
      <div class="axis-track">
        <span
          v-for="band in SPECTRUM_BANDS"
          :key="band"
          class="axis-band"
          :class="{ truth: answered && band === challenge.partyLogo?.band }"
        />
        <!-- The truth marker only appears once the answer is in, or it would
             read the axis out before the player has committed to it. -->
        <span v-if="answered" class="axis-truth" :style="{ left: `${truthAt * 100}%` }" />
        <span
          class="axis-thumb"
          :class="answered ? (picked ? 'was-right' : 'was-wrong') : undefined"
          :style="{ left: `${slid * 100}%`, '--thumb-hue': thumbColor }"
        />
      </div>
      <input
        class="axis-input"
        type="range"
        min="0"
        max="1000"
        :value="Math.round(slid * 1000)"
        :disabled="answered"
        :aria-label="prompt"
        :aria-valuetext="SPECTRUM_LABELS[spectrumAt(slid)]"
        @input="onSlide"
      />
      <div class="axis-labels">
        <span v-for="band in SPECTRUM_BANDS" :key="band" :class="{ on: spectrumAt(slid) === band }">
          {{ SPECTRUM_LABELS[band] }}
        </span>
      </div>
    </div>
    <ButtonFilled v-if="!answered" @click="answer(spectrumAt(slid) === challenge.partyLogo?.band)">
      Place them here
    </ButtonFilled>
  </div>
</template>

<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { countryName, getCountry } from '~~/lib/country'
import { REVEAL_BEAT_MS } from '~~/lib/motion'
import { useGateChallenge, wrongTokenFor } from '~~/lib/use-gate-challenge'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import {
  logoPoliticsPrompt,
  SPECTRUM_BANDS,
  SPECTRUM_LABELS,
  spectrumAt,
  spectrumCentre,
} from '~~/lib/parties'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

/**
 * A party's logo, and one of three things to know about it — which country it
 * belongs to, whether it governs there, or where it sits left-to-right.
 *
 * The logo stands alone above the options with nothing else to read: a party
 * NAME beside it would answer the origin question outright for half the roster
 * ("Sweden Democrats"). The name only appears in the reveal.
 *
 * `origin` answers with a country and grades on the wire. The other two do
 * not answer with a country at all, so they take the repo's client-trust route
 * (`higher-lower`, `chronicle`, `atlas`): grade here, then submit
 * `challenge.country` on a win or `wrongTokenFor` on a miss. The wash is held
 * briefly first so the player sees which choice was true.
 */
const props = defineProps<{ challenge: IndividualChallenge }>()

const { submitAnswer } = useGateChallenge()

const ask = computed(() => props.challenge.partyLogo?.ask ?? 'origin')
const truthOfRuling = computed(() => !!props.challenge.partyLogo?.rules)

const prompt = computed(() =>
  logoPoliticsPrompt(ask.value, countryName(props.challenge.country))
)

// Which option the player took, so the hold can wash both the choice and the
// truth without a second flag. `false` is a real answer, so every gate reads
// `answered` rather than truthiness — a wrong pick is still a pick.
const picked = ref<boolean | undefined>()
const answered = computed(() => picked.value !== undefined)

// The slider starts dead centre: any other resting place is a hint.
const slid = ref(0.5)
const truthAt = computed(() =>
  props.challenge.partyLogo?.band ? spectrumCentre(props.challenge.partyLogo.band) : 0.5
)

// The thumb wears the hue it is sitting on, so the drag reads as travel along
// the axis rather than a marker floating over it.
//
// Red and blue are held FIXED and the saturation is what travels: sweeping the
// hue between them instead would run 18°→198° straight through yellow and
// green, which is a third colour the axis does not mean. The midpoint is a
// washed grey — a party at the centre is not a vivid anything.
const thumbColor = computed(() => {
  const fromCentre = (slid.value - 0.5) * 2
  const hue = fromCentre < 0 ? 18 : 198
  return `hsl(${hue}, ${Math.round(Math.abs(fromCentre) * 62)}%, ${Math.round(58 - Math.abs(fromCentre) * 12)}%)`
})

const onSlide = (event: Event) => {
  if (answered.value) return
  slid.value = Number((event.target as HTMLInputElement).value) / 1000
}

// The true option wears the verdict: green when the player found it, amber
// when they did not. Everything else stays plain — only one option is ever
// the truth, so a losing choice needs no separate stamp here.
const verdictOn = (isTruth: boolean) => {
  if (picked.value === undefined || !isTruth) return undefined
  return picked.value ? 'was-right' : 'was-truth'
}

let verdictTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(verdictTimer))

const answer = (correct: boolean) => {
  if (picked.value !== undefined) return
  picked.value = correct
  verdictTimer = setTimeout(() => {
    submitAnswer(correct ? props.challenge.country : wrongTokenFor(props.challenge))
  }, REVEAL_BEAT_MS)
}
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.logo-frame {
  // Party logos are wordmarks on transparent backgrounds, drawn for a white
  // page — the cream scrim is what keeps a dark one legible over the map.
  @include caption-surface($cardRadius);

  display: grid;
  place-items: center;
  width: min(22rem, 68vw);
  aspect-ratio: 3 / 2;
  margin: 0 auto;
  padding: 1.25rem;
  pointer-events: auto;
}

.party-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-options {
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (min-width: $tablet) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.ruling-options {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

// The left–right axis IS the question, so it is answered by sliding along it
// rather than picking one of five buttons — the shape of the control carries
// the meaning that a row of options throws away.
.spectrum-stage {
  display: grid;
  justify-items: center;
  gap: 1.4rem;
  width: min(46rem, 92vw);
  margin: 1.2rem auto 0;
  pointer-events: auto;
}

.spectrum-axis {
  @include caption-surface($cardRadius);

  position: relative;
  width: 100%;
  padding: 2rem 2.2rem 1.5rem;
}

// Red on the left, blue on the right — the axis carries its own meaning
// before anything is dragged, and the thumb picks the hue up beneath it.
.axis-track {
  position: relative;
  display: flex;
  gap: 3px;
  height: 1.6rem;
  border-radius: 3px;
  // Both halves fade to the SAME washed grey at the centre rather than
  // interpolating red→blue directly, which would travel through green.
  background: linear-gradient(
    to right,
    hsl(18, 62%, 46%) 0%,
    hsl(18, 30%, 62%) 30%,
    hsl(210, 8%, 72%) 50%,
    hsl(198, 30%, 62%) 70%,
    hsl(198, 62%, 46%) 100%
  );
}

// The bands stay as hairline dividers over the gradient rather than blocks of
// their own — the wash IS the scale, and five opaque swatches would hide it.
.axis-band {
  flex: 1;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px hsla(0, 0%, 100%, 0.25);
  transition: box-shadow var(--motion-base) var(--ease-smooth);

  &.truth {
    box-shadow:
      inset 0 0 0 2px hsl(170.5, 40%, 30%),
      inset 0 0 12px hsla(170.5, 40%, 40%, 0.5);
  }
}

// The player's marker and the true one share a footprint, so they are drawn
// differently rather than only coloured differently — a filled thumb against
// a hollow ring stays readable when they land on the same spot.
.axis-thumb,
.axis-truth {
  position: absolute;
  top: 50%;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.axis-thumb {
  border: 3px solid var(--sour-milk);
  background: var(--thumb-hue, var(--dark-blue));
  box-shadow: 0 2px 8px hsla(215.7, 36%, 9.8%, 0.4);
  transition:
    left var(--motion-quick) var(--ease-smooth),
    background var(--motion-quick) var(--ease-smooth);

  &.was-right {
    background: hsl(170.5, 34.7%, 38%);
  }
  // A missed drop stays where the player left it and turns amber, with the
  // dashed truth ring showing how far off it landed — the distance IS the
  // lesson on an axis question.
  &.was-wrong {
    background: var(--hior-ange);
  }
}

.axis-truth {
  width: 3rem;
  height: 3rem;
  border: 3px dashed hsl(170.5, 34.7%, 34%);
  background: transparent;
}

// A native range input drives the thumb: it brings pointer capture, keyboard
// steps and touch behaviour that a hand-rolled drag would have to rebuild.
// It sits invisible ON the track, so the styled thumb above is what shows.
.axis-input {
  position: absolute;
  inset: 2rem 2.2rem auto;
  width: calc(100% - 4.4rem);
  height: 2.6rem;
  margin: -0.5rem 0 0;
  opacity: 0;
  cursor: grab;
  appearance: none;

  &:disabled {
    cursor: default;
  }
}

.axis-labels {
  display: flex;
  margin-top: 1rem;
  font-size: 0.95rem;
  text-align: center;

  span {
    flex: 1;
    opacity: 0.45;
    transition: opacity var(--motion-quick) var(--ease-smooth);

    &.on {
      font-weight: 600;
      opacity: 1;
    }
  }
}
</style>
