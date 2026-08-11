<template>
  <div v-if="challenge" class="individual-challenge challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      :title="interstitialTitle"
      :stakes="'Answer correctly to leap ahead — get it wrong and you\'re knocked back.'"
      @done="showInterstitial = false"
    />
    <ChallengePrompt v-else ref="promptHost" :attributions="promptSources">
      <Transition name="caption" mode="out-in">
        <div v-if="!status" key="question" class="question">
          <!-- One component per variant (components/challenge/individual).
               Keyed on gateSeq: a back-to-back gate REMOUNTS it, so its
               clocks, hints and counters reset by construction. -->
          <component :is="GATE_VIEWS[variant].component" :key="gateSeq" :challenge="challenge" />
        </div>
        <ChallengeResult
          v-else-if="status"
          key="result"
          class="result"
          :status="status"
          :incorrect-message="incorrectMessage"
          :wide="reveal?.wide"
        >
          <component :is="reveal.component" v-if="reveal" v-bind="reveal.props" />
          <span v-else-if="gateLesson">{{ gateLesson }}</span>
        </ChallengeResult>
      </Transition>
    </ChallengePrompt>

    <!-- Teleport anchors for the chrome that cannot live inside the prompt
         column: the wide-screen side stage, and the typed console. A typed
         gate's console must stand in the shell footer per the layer contract —
         mid-column it falls under the software keyboard and iOS chases the
         caret on every keystroke. Which variants use them is declared in the
         dispatch table, so `.suggest-berth`'s downward reserve is only paid
         for by gates that actually type. The anchors render before the gate
         mounts (the gate teleports from its own onMounted). A dealt `options`
         table means the variant answers on cards this difficulty, so the
         typed footer (and its berth) isn't paid for (far-flung below hard). -->
    <div v-if="GATE_VIEWS[variant].sideStage" v-show="!status" id="gate-aside" />
    <!-- A dealt `options` table means the variant answers on CARDS in this
         footer instead of typing (far-flung below hard) — same berth, so the
         camera still frames the subject in the band above, but no
         suggest-berth: cards never open a downward list. -->
    <footer
      v-if="GATE_VIEWS[variant].typedConsole"
      v-show="!status"
      id="gate-footer"
      ref="gateFooter"
      :class="{
        'suggest-berth':
          !challenge?.options &&
          (GATE_VIEWS[variant].suggestions !== false ||
            (GATE_VIEWS[variant].easySuggestions && isEasy)),
      }"
    />
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import { GATE_VIEWS, gateRevealFor } from '~/components/challenge/individual/dispatch'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { BORDERS } from '~~/data/borders.gen'
import {
  attributionFor,
  datasetAttribution,
  trendAttribution,
  type Attribution,
} from '~~/lib/attribution'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { governingParty, partiesOf, partySpectrum } from '~~/lib/parties'
import { countriesSpending, currencyName } from '~~/lib/currency'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth } from '~~/lib/map-berth'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { formatAmount } from '~~/lib/number'
import { listJoin } from '~~/lib/strings'
import { provideGateChallenge } from '~~/lib/use-gate-challenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { processReplacements } from '~~/lib/values'
import { REGION_LABELS } from '~~/lib/variant'

const { currentMove, gameStore, clearBoard } = useClientEvents()

const {
  challenge,
  variant,
  country,
  status,
  isHard,
  isEasy,
  submittedISOCode,
  submittedCountry,
  gateSeq,
  showInterstitial,
  missNote,
  duelOutcomes,
  trendDuelOutcomes,
  atlasChain,
  chronicleOrder,
  relatch,
} = provideGateChallenge()

const details = computed(() =>
  challenge.value ? getChallengeDetails(challenge.value.id) : undefined
)

// The typed console stands in this footer, so the camera has to frame its
// subject in the band ABOVE it — and keep doing so as the software keyboard
// grows the footer's padding. `useFooterBerth` owns that (ResizeObserver on the
// border box); the four typed gates had no bottom reservation at all before.
// Its own claim key, because the berth registry lets the prompt hold the top
// band at the same time.
const gateFooter = ref<HTMLElement>()
useFooterBerth(gateFooter, 'individual-challenge-footer')

// The flag gate's hero card floats over the map; on phones the world-fit
// camera parks the subject band right beneath it. Measure the prompt and
// hand the camera a berth so the world drops into the clear space instead.
const promptHost = ref<InstanceType<typeof ChallengePrompt>>()
const isPhone = useIsPhone()
const BERTH_KEY = 'individual-challenge-prompt'
// The claim below lands a tick late; without the latch a claim queued just
// before unmount would re-register AFTER the release and haunt the next
// round's camera as an ownerless top berth.
let berthClosed = false
onBeforeUnmount(() => {
  berthClosed = true
  claimMapBerth(gameStore, BERTH_KEY, undefined)
})
const placeMapBerth = () => {
  if (!isPhone.value || variant.value !== 'find' || challenge.value?.id !== 'flag') {
    claimMapBerth(gameStore, BERTH_KEY, undefined)
    return
  }
  nextTick(() => {
    if (berthClosed) return
    const prompt = promptHost.value?.$el as HTMLElement | undefined
    const bottom = prompt?.getBoundingClientRect().bottom
    claimMapBerth(
      gameStore,
      BERTH_KEY,
      bottom ? { top: Math.round(bottom) + BERTH_GAP_PX, bottom: 24 } : undefined
    )
  })
}
watch([variant, () => challenge.value?.id, isPhone, showInterstitial], placeMapBerth, {
  immediate: true,
})

watch(currentMove, relatch)

/** The gate's provenance, per variant. Photo variants credit on the photo
 *  frame itself (PhotoOptionChallenge), so the prompt stays quiet there. */
const promptSources = computed<Attribution[] | undefined>(() => {
  const active = challenge.value
  if (!active) return undefined
  switch (variant.value) {
    case 'find':
      // The leader find shows Wikidata facts (and, on easy, a Commons face) —
      // but hard mode shows neither, so it credits the flag like the rest.
      return active.id === 'government.leader' && !isHard.value
        ? datasetAttribution('leaders')
        : [attributionFor('flag')]
    case 'flag-pick':
    case 'flag-twins':
      return [attributionFor('flag')]
    case 'border-detective':
      return datasetAttribution('borders')
    case 'zoom-out':
    case 'outline-reveal':
    case 'errata':
      return datasetAttribution('map')
    case 'money-match':
      return datasetAttribution('currencies')
    case 'odd-one-out':
    case 'rosetta':
    case 'atlas':
      return datasetAttribution('countries')
    case 'leader-pick':
      return datasetAttribution('leaders')
    case 'logo-politics':
      return datasetAttribution('parties')
    case 'higher-lower':
      return active.higherLower ? [attributionFor(active.higherLower.accessorId)] : undefined
    case 'trend-duel': {
      const metric = active.trendDuels?.[0]?.metric
      return metric ? [trendAttribution(metric)] : undefined
    }
    case 'trajectory-match':
      return active.trajectory ? [trendAttribution(active.trajectory.metric)] : undefined
    case 'scriptorium':
      // Seeded samples are editorial; every borrowed one is an anthem wall.
      return datasetAttribution('anthem-lyrics')
    case 'chronicle':
      return datasetAttribution('events')
    case 'far-flung':
      return datasetAttribution('far-flung')
    default:
      return undefined
  }
})

const interstitialTitle = computed(() => {
  const active = challenge.value
  if (!active) return 'Challenge!'
  switch (variant.value) {
    case 'flag-pick':
      return `Which flag belongs to ${countryName(active.country)}?`
    case 'flag-twins':
      return `Spot ${countryName(active.country)} among its palette twins`
    case 'border-detective':
      return 'Name the country these neighbours surround'
    case 'money-match':
      return 'Which country spends this currency?'
    case 'zoom-out':
      return 'Name the country before the map zooms out'
    case 'capital-match':
      return "Which country's capital is this?"
    case 'landmark-quiz':
      return 'Which country is this landmark in?'
    case 'odd-one-out':
      return active.oddOneOut?.propertyLabel ?? 'Find the odd one out'
    case 'leader-pick':
      return `Who leads ${countryName(active.country)}?`
    case 'logo-politics':
      return 'Whose party is this?'
    case 'higher-lower': {
      const duels = active.higherLower?.pairs.length ?? 0
      return `Win ${duels === 2 ? 'both duels' : `all ${duels} duels`}: which country ranks higher?`
    }
    case 'trend-duel':
      return `Win all ${active.trendDuels?.length ?? 0} duels: whose stat is rising, whose is falling?`
    case 'trajectory-match':
      return 'One chart, one country — whose trajectory is this?'
    case 'outline-reveal':
      return 'Name the country before its border finishes drawing itself'
    case 'leader-portrait':
      return 'Whose leader is this?'
    case 'errata':
      return 'One of these countries is wearing the wrong name'
    case 'rosetta':
      return 'Finish the pair — the first one shows you the link'
    case 'atlas':
      return 'Chain countries — each begins where the last one ended'
    case 'scriptorium':
      return 'One language wrote this — name a country that speaks it'
    case 'chronicle':
      return `Put ${countryName(active.country)}'s history in order`
    case 'far-flung':
      return 'A far-flung piece of a country — whose is it?'
    default:
      return processReplacements(details.value?.phrasing || '', active.country)
  }
})

// --- Result beat ---------------------------------------------------------------
const reveal = computed(() => {
  const active = challenge.value
  if (!active || !status.value) return undefined
  return gateRevealFor(variant.value, {
    challenge: active,
    submittedISOCode: submittedISOCode.value,
    duelOutcomes: duelOutcomes.value,
    trendDuelOutcomes: trendDuelOutcomes.value,
    atlasChain: atlasChain.value,
    chronicleOrder: chronicleOrder.value,
  })
})

const incorrectMessage = computed(() => {
  // A miss line only the variant could phrase ("Norway ranks higher"), set by
  // the gate before it submitted.
  if (missNote.value) return missNote.value
  const active = challenge.value
  const picked = submittedCountry.value
  switch (variant.value) {
    case 'flag-pick':
      return picked ? `That flag belongs to ${countryName(picked)}` : 'Not that flag.'
    case 'flag-twins':
      return picked ? `That's ${countryName(picked)} — a close twin` : 'Not that one.'
    case 'border-detective':
      return active ? `It was ${countryName(active.country)}` : 'Not quite.'
    case 'money-match':
      return active
        ? `That's the ${currencyName(getCountry(active.country).currency)} (${getCountry(active.country).currency})`
        : 'Not quite.'
    case 'zoom-out':
      return active ? `It was ${countryName(active.country)}` : 'Not quite.'
    case 'capital-match':
      return active
        ? `That's ${getCountry(active.country).geography.capital.name}, ${countryName(active.country)}`
        : 'Not quite.'
    case 'landmark-quiz':
      // The dossier below carries the landmark's name and story.
      return active ? `It's in ${countryName(active.country)}` : 'Not quite.'
    case 'odd-one-out':
      return active ? `The odd one out was ${countryName(active.country)}` : 'Not quite.'
    case 'leader-pick':
      return picked ? `That's ${countryName(picked)}'s leader` : 'Not that one.'
    case 'logo-politics':
      return picked ? `That's a party of ${countryName(picked)}` : 'Not that one.'
    case 'trajectory-match':
      return active ? `That trajectory belongs to ${countryName(active.country)}` : 'Time ran out.'
    case 'outline-reveal':
      return active ? `That border belongs to ${countryName(active.country)}` : 'Time ran out.'
    case 'leader-portrait':
      return active?.portrait
        ? `That's ${active.portrait.name} — ${countryName(active.country)}'s leader`
        : 'Not quite.'
    case 'errata':
      // The reveal below restores the whole lineup, culprits marked.
      return 'Not the misprint.'
    case 'rosetta':
      return active ? `The pair was ${countryName(active.country)}` : 'Time ran out.'
    case 'atlas':
      // The gate always phrases its own missNote; this is the safety line.
      return 'The chain broke.'
    case 'scriptorium':
      // Language-framed, never script-framed: Eritrea writes Geʽez too, but
      // an Amharic deal is asking for Amharic's countries.
      return picked ? `It isn't an official language of ${countryName(picked)}` : 'Time ran out.'
    case 'chronicle':
      // The reveal below sets the record straight, year by year.
      return 'History disagrees.'
    case 'far-flung':
      return active ? `That piece belongs to ${countryName(active.country)}` : 'Time ran out.'
    default:
      // Currency find gate: name what the pressed country actually spends —
      // clearer than the reveal zoom alone, since shared currencies mean the
      // dealt subject isn't the only right answer.
      if (active?.id === 'currency' && picked?.currency) {
        return `${countryName(picked)} spends the ${currencyName(picked.currency)}`
      }
      return picked ? `Sorry, you pressed: ${countryName(picked)}` : 'Not quite.'
  }
})

/**
 * The teachable moment for gates without a bespoke reveal card — a factual
 * line about the answer, shown on wins and losses alike (the verdict line
 * above already handles "you picked X").
 */
const gateLesson = computed(() => {
  const active = challenge.value
  const answer = country.value
  if (!active || !answer || !status.value) return undefined
  switch (variant.value) {
    case 'flag-twins': {
      const palette = answer.identity.simplifiedColors
      if (!palette.length) return undefined
      return `All ${active.options?.length ?? 4} flags fly ${palette.join(' + ')} — the emblem and layout are the tell.`
    }
    case 'border-detective': {
      const neighbours = BORDERS[active.country] ?? []
      if (!neighbours.length) return undefined
      const shown = active.neighbours?.length ?? 0
      const roster = listJoin(neighbours.map(isoCode => countryName(isoCode)))
      const benched = neighbours.length - shown
      return `${countryName(answer)} borders ${neighbours.length}: ${roster}${
        benched > 0 ? ` — the ring showed ${shown} of them` : ''
      }.`
    }
    case 'money-match': {
      const code = answer.currency
      if (!code) return undefined
      const spenders = countriesSpending(code)
      return spenders.length > 1
        ? `The ${currencyName(code)} is legal tender in ${spenders.length} countries — any of them counted.`
        : `The ${currencyName(code)} is ${countryName(answer)}'s own.`
    }
    // The logo stood alone as the question; naming it is the lesson.
    case 'logo-politics': {
      const party = active.partyLogo
      if (!party) return undefined
      const spectrum = partiesOf(active.country).find(entry => entry.name === party.name)
      const band = spectrum ? partySpectrum(spectrum) : undefined
      return band
        ? `That's ${party.name} — a ${band} party in ${countryName(answer)}.`
        : `That's ${party.name}, a party in ${countryName(answer)}.`
    }
    case 'odd-one-out': {
      const shared = active.oddOneOut
      if (!shared?.kind || !shared.value) return undefined
      switch (shared.kind) {
        case 'region':
          return `${countryName(answer)} is in ${REGION_LABELS[answer.region]} — the other three are in ${shared.value}.`
        case 'language': {
          const spoken = listJoin(answer.languages?.slice(0, 3) ?? [])
          return spoken
            ? `${countryName(answer)} speaks ${spoken} — the other three share ${shared.value}.`
            : `${countryName(answer)} doesn't speak ${shared.value}.`
        }
        case 'organization':
          return `${countryName(answer)} isn't a member of ${shared.value} — the other three are.`
        case 'party-family': {
          const governing = governingParty(answer.isoCode)
          return governing
            ? `${countryName(answer)} is governed by ${governing.name} — the other three are governed by a party of the ${shared.value} family.`
            : `${countryName(answer)} isn't governed by a party of the ${shared.value} family — the other three are.`
        }
      }
      return undefined
    }
    case 'zoom-out':
    case 'outline-reveal': {
      const neighbourCount = BORDERS[active.country]?.length ?? 0
      const facts = [
        answer.geography.area.total ? formatAmount(answer.geography.area.total) : undefined,
        neighbourCount
          ? `${neighbourCount} ${neighbourCount === 1 ? 'neighbour' : 'neighbours'}`
          : 'no land neighbours',
        REGION_LABELS[answer.region],
      ].filter(Boolean)
      return `${countryName(answer)} — ${facts.join(' · ')}`
    }
    case 'find': {
      const facts = [
        answer.geography.capital.name ? `capital ${answer.geography.capital.name}` : undefined,
        REGION_LABELS[answer.region],
        answer.people.population ? formatAmount(answer.people.population) : undefined,
      ].filter(Boolean)
      return facts.length ? `${countryName(answer)} — ${facts.join(' · ')}` : undefined
    }
    default:
      return undefined
  }
})

onBeforeMount(() => {
  // Clear out our global state — each gate view then sets what it needs
  // (solo for the shape mysteries, labels and focus for errata).
  clearBoard()
})
onBeforeUnmount(clearBoard)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
header {
  position: absolute;
  justify-content: center;
}

// With the prompt header absolute, the typed gates' footer is the shell's
// only in-flow child — space-between alone would park it at the top.
footer {
  margin-top: auto;
}

header .question,
header .result {
  gap: 1rem;
  width: 100%;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  // Fallback: scroll to the options if a tall hero + cards overflow.
  max-height: var(--viewport-height);
  overflow-y: auto;
}

// The round is resolved — nothing behind the reveal needs taps, and the
// scroll container must take touches itself under .main-board's
// pointer-events: none. The play-state .question stays pass-through so
// map-tap variants keep working.
header .result {
  pointer-events: auto;
  overscroll-behavior: contain;
}

// The provenance ⓘ hangs off the prompt's true corner (top:0 right:0), which
// in this shell rides the verdict card's border radius — half on the card,
// half off, and its opened panel with it. Tuck it inside the card's head
// padding instead; during the question beat the centred captions leave the
// corner clear, so one inset serves both beats.
header :deep(.prompt .prompt-corner) {
  top: 1.1rem;
  right: 1.2rem;
}
</style>
