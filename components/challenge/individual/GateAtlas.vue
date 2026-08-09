<template>
  <template v-if="challenge.atlas">
    <h1 class="map-caption">Atlas</h1>
    <span class="map-caption sub">
      Bank {{ challenge.atlas.target }} links — each name begins where the last one ended{{
        challenge.atlas.overlaps ? ', and any shared ending counts' : ''
      }}
    </span>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="ATLAS_SECONDS" />

    <AtlasChainRail
      :chain="atlasChain"
      :overlaps="challenge.atlas.overlaps"
      :next-letter="letter"
    />

    <span class="map-caption tally">{{ banked }} / {{ challenge.atlas.target }}</span>

    <Transition name="hint">
      <span v-if="note" class="map-caption hint">{{ note }}</span>
    </Transition>

    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="hintUnlocked && !hintName && !hintSpent"
          class="hint-button"
          type="button"
          @click="buyHint"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Name one that works (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
        <span v-else-if="hintName" class="map-caption hint-offer">Try {{ hintName }}</span>
      </Transition>
    </div>

    <Teleport v-if="footerReady" to="#gate-footer">
      <div class="guess-box">
        <CountryGuessInput
          ref="guessInput"
          :suggest="false"
          :excluded="atlasChain"
          :placeholder="`Starts with ${letter}…`"
          @guess="onGuess"
          @miss="bounce('No country by that name')"
        />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import AtlasChainRail from '~/components/challenge/AtlasChainRail.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import {
  atlasChainCredit,
  atlasTailLetter,
  isAtlasLink,
  pickAtlasHint,
} from '~~/lib/atlas-chain'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { playableWorldCountries } from '~~/lib/game-rules'
import { DWELL } from '~~/lib/motion'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { ATLAS_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { status, missNote, atlasChain, submitAnswer, giveUp } = useGateChallenge()
const { gameStore } = useClientEvents()

const rule = computed(() => ({ overlaps: !!props.challenge.atlas?.overlaps }))
const pool = computed(() =>
  playableWorldCountries(gameStore.game ?? { variant: 'world', difficulty: 'normal' })
)

const head = computed(() => atlasChain.value.at(-1) ?? props.challenge.atlas?.seed)
const letter = computed(() => (head.value ? atlasTailLetter(head.value).toUpperCase() : ''))
const banked = computed(() => atlasChainCredit(atlasChain.value, rule.value))

const footerReady = ref(false)
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The transient layer: one note at a time, self-clearing — the rail is the
// durable record, this is commentary.
const note = ref<string>()
let noteTimer: ReturnType<typeof setTimeout> | undefined
const bounce = (message: string) => {
  note.value = message
  if (noteTimer) clearTimeout(noteTimer)
  noteTimer = setTimeout(() => (note.value = undefined), DWELL.hint)
}
onBeforeUnmount(() => noteTimer && clearTimeout(noteTimer))

const { secondsLeft, remainingFraction, elapsedFraction, stop } = useGateClock(ATLAS_SECONDS, {
  onExpire: () => {
    missNote.value = `Time ran out on “${letter.value}”`
    giveUp(hintsUsed.value)
  },
})
const hintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

/** The bought continuation's name — cleared when its letter is answered, but
 *  the purchase stays spent (one hint, one bite). */
const hintName = ref<string>()
const hintSpent = ref(false)
const hintsUsed = computed(() => (hintSpent.value ? 1 : 0))
const buyHint = () => {
  if (hintSpent.value || status.value || !head.value) return
  const pick = pickAtlasHint(head.value, atlasChain.value, pool.value, rule.value)
  if (!pick) return bounce('No help left on this letter')
  hintSpent.value = true
  hintName.value = countryName(pick)
}

onMounted(() => {
  if (props.challenge.atlas && !atlasChain.value.length) {
    atlasChain.value = [props.challenge.atlas.seed]
  }
  footerReady.value = true
})

// The chain paints itself: green fills, directed arcs junction to junction,
// a widening camera and the ember pulse on the head. The shell's clearBoard
// resets all of it for the next gate; the paint survives the result beat on
// purpose — it is the reveal's backdrop.
watch(
  atlasChain,
  chain => {
    if (!chain.length) return
    gameStore.map.highlighted = new Set(chain)
    gameStore.map.tints = Object.fromEntries(chain.map(isoCode => [isoCode, 'optimal' as const]))
    gameStore.map.landRoutes = chain.slice(1).map((isoCode, index) => `${chain[index]}>${isoCode}`)
    gameStore.map.focus = [...chain]
    gameStore.map.pulsing = status.value ? [] : [chain[chain.length - 1]]
  },
  { immediate: true }
)

const onGuess = (country: Country) => {
  if (status.value || !props.challenge.atlas) return
  const chain = atlasChain.value
  const anchor = head.value
  if (!anchor) return

  if (chain.includes(country.isoCode)) {
    return bounce(`${countryName(country)} is already in the chain`)
  }
  if (!isAtlasLink(anchor, country.isoCode, rule.value)) {
    return bounce(
      rule.value.overlaps
        ? `${countryName(country)} doesn't chain from ${countryName(anchor)}`
        : `${countryName(country)} doesn't start with ${letter.value}`
    )
  }

  atlasChain.value = [...chain, country.isoCode]
  hintName.value = undefined
  note.value = undefined

  if (banked.value >= props.challenge.atlas.target) {
    stop()
    gameStore.map.pulsing = []
    return submitAnswer(props.challenge.country, {
      remainingFraction: remainingFraction.value,
      hintsUsed: hintsUsed.value,
      reveal: false,
    })
  }
  // Mid-round refocus — the keyboard is already up, keep the rally going.
  guessInput.value?.focus()
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Shared recipes carry the layout (map-caption, hint-row, guess-box,
// country-chip-list); only the gate's own accents live here.
.tally {
  font-size: 1.4rem;
  font-weight: 700;
  padding: 0.2rem 0.9rem;
}

.hint-offer {
  padding: 0.3rem 1rem;
  color: var(--soft-blue);
}
</style>
