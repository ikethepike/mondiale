<template>
  <div class="atlas-tutorial">
    <svg class="briefing-mark" viewBox="0 0 48 24" aria-hidden="true">
      <rect x="2" y="7" width="16" height="10" rx="5" />
      <circle cx="24" cy="12" r="4" />
      <rect x="30" y="7" width="16" height="10" rx="5" />
    </svg>
    <span class="eyebrow">How to play</span>
    <h2>Atlas</h2>
    <p class="lead">
      One chain, taken in turns. Each country must begin where the last one ended — three ways
      count:
    </p>

    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step.kind" class="step">
        <span class="step-number">{{ index + 1 }}</span>
        <div class="step-body">
          <h3>{{ step.title }}</h3>
          <AtlasChainRail :chain="step.chain" finished compact />
          <p>{{ step.line }}</p>
        </div>
      </li>
    </ol>

    <ul class="briefing-points">
      <li>No repeats — every country is named once, across the whole round.</li>
      <li>{{ clockLine }}</li>
      <li v-if="challenge.strikes > 0">A dead clock burns your strike; the next puts you out.</li>
      <li v-else>A dead clock puts you out — sudden death.</li>
      <li>
        If nothing unused can follow, whoever is next is caught in a dead end and out without a
        move.
      </li>
      <li>
        <strong>One rip cord each.</strong> On your turn, swap the country you're stuck on for a
        fresh one. Still holding it at a dead end? It fires by itself and saves you.
      </li>
      <li v-if="challenge.placementOnly">Only your placement pays. Outlast the table.</li>
      <li v-else>Sealing someone's dead end pays bonus links. Outlast the table.</li>
    </ul>

    <p class="confirm-note">The first clock starts once everyone has confirmed.</p>
  </div>
</template>
<script lang="ts" setup>
import AtlasChainRail from '~/components/challenge/AtlasChainRail.vue'
import {
  ATLAS_TUTORIAL_EXAMPLES,
  atlasConsonant,
  atlasLinkTie,
  atlasTailLetter,
  type AtlasTieKind,
} from '~~/lib/atlas-chain'
import { countryName } from '~~/lib/country'
import type { AtlasChallenge } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Atlas's tutorial screen, slotted into the round's BriefingCard. */
const props = defineProps<{ challenge: AtlasChallenge }>()

const TITLES: Record<AtlasTieKind, string> = {
  letter: 'The last letter',
  consonant: 'The consonant before final vowels',
  overlap: 'Any shared ending',
}

const lineFor = (kind: AtlasTieKind, [from, to]: [ISOCountryCode, ISOCountryCode]) => {
  const [head, next] = [countryName(from), countryName(to)]
  const tail = atlasTailLetter(from).toUpperCase()
  if (kind === 'letter') return `${head} ends in ${tail}, so ${next} can follow.`
  if (kind === 'consonant') {
    const consonant = atlasConsonant(from)?.toUpperCase()
    return `${head} ends in vowels, so the ${consonant} before them opens ${next} — as well as any ${tail}.`
  }
  return `${head} and ${next} share “${atlasLinkTie(from, to)?.fragment.toUpperCase()}”.`
}

const steps = computed(() =>
  (Object.keys(ATLAS_TUTORIAL_EXAMPLES) as AtlasTieKind[]).map(kind => ({
    kind,
    title: TITLES[kind],
    chain: ATLAS_TUTORIAL_EXAMPLES[kind],
    line: lineFor(kind, ATLAS_TUTORIAL_EXAMPLES[kind]),
  }))
)

const clockLine = computed(() => {
  const { turnSeconds, turnFloorSeconds } = props.challenge
  return turnFloorSeconds && turnFloorSeconds < turnSeconds
    ? `${turnSeconds} seconds a move, tightening to ${turnFloorSeconds} as the chain grows.`
    : `${turnSeconds} seconds a move.`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.atlas-tutorial {
  gap: 0.9rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.briefing-mark {
  width: 4.4rem;
  fill: none;
  stroke: var(--dark-blue);
  stroke-width: 2;
  stroke-linecap: round;
}

.lead {
  margin: 0;
}

.steps {
  margin: 0;
  padding: 0;
  gap: 0.8rem;
  width: 100%;
  display: flex;
  list-style: none;
  text-align: left;
  flex-flow: column nowrap;
}

.step {
  gap: 0.9rem;
  display: flex;
  align-items: flex-start;
  padding: 0.8rem 1rem;
  border-radius: 1rem;
  border: 0.1rem solid ink(0.15);
  background: milk(0.6);
}

.step-number {
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  border-radius: 50%;
  color: var(--soft-blue);
  border: 0.1rem solid ink(0.25);
}

.step-body {
  gap: 0.5rem;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;

  h3 {
    margin: 0;
    font-size: 1.35rem;
  }

  p {
    margin: 0;
    font-size: 1.2rem;
  }
}

.confirm-note {
  margin: 0;
  opacity: 0.75;
  font-size: 1.15rem;
}
</style>
