<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="odd-one-out-reveal">
    <span class="dossier">
      <OrganizationLogo
        v-if="challenge._type === 'membership-challenge'"
        class="logo"
        :organization="challenge.organization"
      />
      <strong class="subject">{{ subject.name }}</strong>
      <span class="meta">{{ subject.meta }}</span>
      <span class="purpose">{{ subject.purpose }}</span>
    </span>
    <span class="verdict-row">
      <CountryFlag class="holdout-flag" :country="COUNTRIES[holdout]" mode="background" />
      <span class="holdout">
        <strong class="name">{{ countryName(COUNTRIES[holdout]) }}</strong>
        <span class="standing">{{ standing }}</span>
      </span>
    </span>
    <span v-if="insteadLine" class="instead">{{ insteadLine }}</span>
    <span v-if="pickedLine" class="picked-line">{{ pickedLine }}</span>
    <span class="credit-row">
      <SourceInfo :attributions="sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import OrganizationLogo from '~/components/challenge/OrganizationLogo.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { COUNTRIES } from '~~/data/countries.gen'
import { TREATIES } from '~~/data/treaties.gen'
import { countryName } from '~~/lib/country'
import { listJoin } from '~~/lib/strings'
import {
  familyPeersBinding,
  organizationSize,
  organizationsOf,
  treatyPartyCount,
} from '~~/lib/odd-one-out'
import { oddOneOut, type OddOneOutChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { ORGANIZATION_FACTS, OrganizationVector } from '~~/types/organization.type'
import { treatyMeta } from '~~/types/treaty.type'

/**
 * The odd-one-out dossier, for a club and for an instrument alike: what the
 * thing actually is, how many countries belong to it worldwide, how the
 * holdout stands apart, and what it belongs to instead.
 *
 * "X is the odd one out" was the whole lesson before this — a restatement of
 * the question. The subject is resolved through the shared `oddOneOut`
 * selector, so the card and the verdict can never name different countries.
 */
const props = defineProps<{
  challenge: OddOneOutChallenge
  /** The player's answer, right or wrong. */
  picked?: ISOCountryCode
}>()

const holdout = computed(() => oddOneOut(props.challenge))

const sources = computed(() =>
  datasetAttribution(props.challenge._type === 'treaty-challenge' ? 'treaties' : 'countries')
)

const subject = computed(() => {
  if (props.challenge._type === 'membership-challenge') {
    const facts = ORGANIZATION_FACTS[props.challenge.organization]
    const members = organizationSize(props.challenge.organization)
    return {
      name: OrganizationVector[props.challenge.organization],
      meta: `founded ${facts.founded} · ${members} members`,
      purpose: facts.purpose,
    }
  }
  const meta = treatyMeta(props.challenge.treaty)
  const parties = treatyPartyCount(props.challenge.treaty)
  return {
    name: meta.name,
    meta: `${parties} countries bound`,
    purpose: meta.purpose,
  }
})

/** How the holdout stands apart — the club's plain "not a member", or the
 *  instrument's own three ways of not being bound. */
const standing = computed(() => {
  if (props.challenge._type === 'membership-challenge') return 'not a member'
  const year = TREATIES[props.challenge.treaty]?.[holdout.value]?.year
  switch (props.challenge.standing) {
    case 'signatory':
      return year ? `signed in ${year}, never ratified` : 'signed it, never ratified'
    case 'withdrawn':
      // The scrape can't read UNTC's withdrawal footnote, so the year is only
      // there when a curated entry knew it.
      return year ? `was a party until ${year}` : 'was a party, then withdrew'
    default:
      return 'never joined'
  }
})

/** What it does belong to — a country outside one club is inside others. */
const insteadLine = computed(() => {
  const challenge = props.challenge
  if (challenge._type === 'membership-challenge') {
    const others = organizationsOf(holdout.value).filter(id => id !== challenge.organization)
    if (!others.length) return undefined
    return `It does sit in ${listJoin(others.map(id => ORGANIZATION_FACTS[id].shortName))}.`
  }
  const peers = familyPeersBinding(challenge.treaty, holdout.value)
  if (!peers.length) return undefined
  // Instrument names need their article to read as prose — "bound by the
  // Covenant and the Convention", not "bound by Covenant and Convention".
  return `It is bound by ${listJoin(peers.map(id => `the ${treatyMeta(id).shortName}`))}.`
})

// A wrong pick named a country that does belong — say so, so the mistake lands
const pickedLine = computed(() => {
  if (!props.picked || props.picked === holdout.value) return undefined
  return `Your pick, ${countryName(COUNTRIES[props.picked])}, is on the books.`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.odd-one-out-reveal {
  gap: 1rem;
  display: flex;
  flex-flow: column nowrap;
  max-width: min(42rem, 100%);
}

.dossier {
  gap: 0.35rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .logo {
    width: 4.4rem;
    height: 4.4rem;
    margin-bottom: 0.2rem;
  }

  .subject {
    font-size: 1.7rem;
    line-height: 1.25;
  }

  .meta {
    opacity: 0.75;
    font-size: 1.3rem;
  }

  .purpose {
    font-size: 1.4rem;
    line-height: 1.45;
    text-wrap: balance;
  }
}

.verdict-row {
  gap: 0.8rem;
  display: flex;
  padding: 0.5rem 0.8rem;
  align-items: center;
  border-radius: 0.6rem;
  background: hsla(45, 90%, 74%, 0.35);

  .holdout-flag {
    width: 2.8rem;
    height: 1.9rem;
    flex-shrink: 0;
    border-radius: 0.2rem;
  }

  .holdout {
    gap: 0.15rem;
    display: flex;
    text-align: left;
    flex-flow: column nowrap;
  }

  .name {
    font-size: 1.5rem;
  }

  .standing {
    opacity: 0.8;
    font-size: 1.3rem;
  }
}

.instead,
.picked-line {
  font-size: 1.3rem;
  line-height: 1.45;
}

@media screen and (max-width: $phone) {
  .dossier .subject {
    font-size: 1.5rem;
  }
}
</style>
