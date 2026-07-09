<template>
  <section class="no-mans-land">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — No Man's Land`"
      title="A rock, and everyone who wants it"
      :stakes="`Tap every country that claims it. Some of these nobody claims at all — and there, naming nobody is the right answer. ${DURATION_SECONDS} seconds.`"
      @done="start"
    />
    <template v-else>
      <header>
        <div class="prompt">
          <!-- The NE status line reads "Administered by Eritrea. Claimed by
               Djibouti" — administrator ∪ claimants IS the answer set, so it
               cannot be shown until the round is over. -->
          <template v-if="!submitted">
            <h1 class="map-caption">{{ territory?.name }}</h1>
            <span class="map-caption sub">{{ teaser }} — {{ secondsLeft }}s</span>
          </template>
          <template v-else-if="territory">
            <h1 class="map-caption">{{ verdictHeadline }}</h1>
            <span class="map-caption sub">{{ statusLine }}</span>
          </template>
        </div>
      </header>

      <footer>
        <template v-if="!submitted">
          <p class="map-caption ask">Who claims it?</p>
          <ul v-if="picks.length" class="chips">
            <li v-for="isoCode in picks" :key="isoCode">
              <button type="button" @click="toggle(isoCode)">{{ countryName(isoCode) }}</button>
            </li>
          </ul>
          <ButtonFilled class="lock" @click="submitRound">
            {{ picks.length ? 'Lock it in' : 'Nobody claims it' }}
          </ButtonFilled>
        </template>

        <template v-else-if="territory">
          <p class="map-caption facts">
            <span v-if="territory.administrator">
              <strong>Administered by</strong> {{ countryName(territory.administrator) }}
            </span>
            <span><strong>Claimed by</strong> {{ claimantNames }}</span>
          </p>
        </template>
      </footer>
    </template>
  </section>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref } from 'vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import type { RecognitionTerritory } from '~~/data/recognition.gen'

// The world stays tappable: the answer is a set of countries.
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
} = useGroupChallenge('no-mans-land-challenge', { solo: false })

const DURATION_SECONDS = 30

const territory = ref<RecognitionTerritory>()
const picks = ref<ISOCountryCode[]>([])
/** Mirrors ViewNameThatWater's reveal: praise, or a plain statement of fact. */
const verdictHeadline = ref('')

/**
 * "Admin. by Denmark; Claimed by Canada" → "Administered by Denmark. Claimed
 * by Canada." Reveal-only: administrator ∪ claimants is the answer set, so
 * this line is a complete solution and must never precede the guess.
 */
const statusLine = computed(() =>
  (territory.value?.status ?? '')
    .replace(/^Admin(?:\.|istered)?\s+[Bb]y/i, 'Administered by')
    .replace(/\.?;\s*/g, '. ')
    .replace(/\.?$/, '.')
)

/**
 * Below this projected footprint a territory is a smudge at world zoom and
 * earns a magnifying inset. Twenty of the 2000 units the world is wide — about
 * 13 screen pixels on a laptop. All but one of this cast falls under it: the
 * Courantyne Headwaters are 12 units across, Bassas da India less than half of
 * one. Only West of Essequibo River (47) can be read unaided.
 */
const INSET_FOOTPRINT = 20

const needsInset = (found: RecognitionTerritory) =>
  Math.max(found.bounds[2], found.bounds[3]) < INSET_FOOTPRINT

/**
 * The pre-answer line. It may describe the place but never the dispute — not
 * even the number of claimants, since "nobody claims this" is the whole point
 * of Bir Tawil and would be given away by a count of zero.
 */
const teaser = computed(() =>
  territory.value?.micro
    ? 'Uninhabited. Small enough to miss on the map.'
    : 'Uninhabited. Nobody lives here to ask.'
)

const claimantNames = computed(() => {
  const claimants = challenge.value?.claimants ?? []
  const others = territory.value?.administrator
    ? claimants.filter(isoCode => isoCode !== territory.value!.administrator)
    : claimants
  return others.length ? others.map(countryName).join(', ') : 'No one'
})

const start = () => {
  const active = challenge.value
  if (!active) return

  import('~~/data/recognition.gen').then(({ RECOGNITION_TERRITORIES }) => {
    const found = RECOGNITION_TERRITORIES[active.territoryId]
    territory.value = found
    if (!found) return

    // Draw the outline, plus a marker when the territory is too small to see —
    // Bassas da India is a speck in the Mozambique Channel, and without the
    // marker the player is asked to name claimants for something invisible.
    //
    // Deliberately no `bounds` and no `map.focus`: both frame the camera, and
    // zooming to a rock beside Madagascar hands over a claimant. It also holds
    // `.is-interacting` on the map, which kills pointer-events on every country
    // path and makes the mode unplayable. The reveal does the zooming.
    gameStore.map.feature = {
      d: found.d,
      kind: 'area',
      ...(found.micro ? { marker: found.micro } : {}),
    }

    // A marker says where it is; the inset shows what it is. Half of this cast
    // is illegible at world zoom — the Courantyne Headwaters span 12 projected
    // units of a 2000-unit world, and a dot big enough to notice would be
    // larger than the territory it points at.
    if (needsInset(found)) {
      gameStore.map.inset = { bounds: found.bounds, label: found.name }
    }
  })

  begin({ onTimeout: submitRound })
}

const toggle = (isoCode: ISOCountryCode) => {
  if (submitted.value) return
  const index = picks.value.indexOf(isoCode)
  if (index >= 0) picks.value.splice(index, 1)
  else picks.value.push(isoCode)

  gameStore.map.highlighted = new Set(picks.value)
}

const submitRound = () => {
  const active = challenge.value
  if (!active || submitted.value) return

  const truth = new Set(active.claimants)
  const guess = new Set(picks.value)
  const hit = [...guess].filter(isoCode => truth.has(isoCode)).length
  const union = new Set([...guess, ...truth]).size

  const perfect = hit === truth.size && guess.size === truth.size

  if (!truth.size && !guess.size)
    // The whole point of Bir Tawil: naming nobody is a real, correct answer.
    verdictHeadline.value = 'Exactly — it belongs to no one'
  else if (perfect) verdictHeadline.value = 'Every claimant, and no one else'
  else if (hit) verdictHeadline.value = `${hit} of ${truth.size} claimants`
  else verdictHeadline.value = union ? 'None of them' : 'Nothing named'

  // Now the answer is in, framing is safe — and for a nine-metre rock the zoom
  // is the only way the player ever sees where the argument actually was.
  const found = territory.value
  if (found) {
    gameStore.map.feature = {
      d: found.d,
      kind: 'area',
      bounds: found.bounds,
      ...(found.micro ? { marker: found.micro } : {}),
    }
  }
  // The reveal frames the claimants, which may be a wide shot — the inset would
  // linger, magnifying a rock nobody is looking at any more.
  gameStore.map.inset = undefined
  gameStore.map.highlighted = new Set(active.claimants)
  gameStore.map.focus = active.claimants
  // Green wash on a perfect answer, nothing otherwise — as ViewCapitalGuess and
  // ViewFlagPalette do. `'incorrect'` floods every country orange.
  gameStore.map.status = perfect ? 'correct' : undefined

  submitOnce(picks.value)
}

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event) || submitted.value || showInterstitial.value) return
  const { isoCode } = event.detail
  if (!isValidISOCode(isoCode)) return
  // Presence only: seeing someone tap Denmark on Hans Island IS the answer.
  announce({ kind: 'probe', isoCode })
  toggle(isoCode)
}

onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))
</script>

<style lang="scss" scoped>
.no-mans-land {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  display: flex;
  padding: 2rem 4rem;
  text-align: center;
  justify-content: center;

  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 3.2rem);
  }

  .sub {
    padding: 0.4rem 1.4rem;
    max-width: min(80vw, 40rem);
  }

  // Title, then status, stacked — never side by side.
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

footer {
  gap: 1rem;
  z-index: 2;
  display: flex;
  padding: 0 2rem 2rem;
  align-items: center;
  flex-flow: column nowrap;

  .ask {
    margin: 0;
    padding: 0.4rem 1.4rem;
    font-size: 1.1rem;
  }
}

// The countries picked so far. Tapping one takes it back off the list.
.chips {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  max-width: min(90vw, 46rem);
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
  pointer-events: auto;

  button {
    color: var(--dark-blue);
    cursor: pointer;
    padding: 0.35rem 0.9rem;
    font-size: 0.95rem;
    font-family: inherit;
    background: hsla(36, 100%, 98%, 0.85);
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
    border-radius: 999px;
    backdrop-filter: blur(0.5rem);
  }
}

.lock {
  pointer-events: auto;
}

// The reveal, in the shared map-caption idiom.
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
</style>
