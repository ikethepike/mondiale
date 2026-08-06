<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="odd-one-out-reveal">
    <span class="dossier">
      <OrganizationLogo
        v-if="challenge._type === 'membership-challenge'"
        class="logo"
        :organization="challenge.organization"
      />
      <TreatySeal
        v-if="challenge._type === 'treaty-challenge'"
        class="seal"
        :treaty="challenge.treaty"
      />
      <strong class="subject">{{ subject.name }}</strong>
      <span class="meta">{{ subject.meta }}</span>
      <span class="purpose">{{ subject.purpose }}</span>
    </span>
    <!-- The four ways to stand toward an instrument, as one bar. A club has
         no equivalent: you are on its books or you are not. -->
    <span v-if="census" class="census">
      <span class="census-bar" aria-hidden="true">
        <span
          v-for="band in census"
          :key="band.key"
          class="band"
          :class="band.key"
          :style="{ width: `${band.share}%` }"
        />
      </span>
      <span class="census-keys">
        <span v-for="band in census" :key="band.key" class="census-key" :class="band.key">
          <span class="swatch" aria-hidden="true" />
          {{ band.count }} {{ band.label }}
        </span>
      </span>
    </span>
    <span class="verdict-row" :class="standingKey">
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
import TreatySeal from '~/components/challenge/TreatySeal.vue'
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
  treatyCensus,
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

/** Smallest slice of the census bar a standing may occupy, in percent. */
const MIN_BAND_SHARE = 4

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
  const { party } = treatyCensus(props.challenge.treaty)
  return {
    name: meta.name,
    // Same shape as the club's "founded 1993 · 27 members" — the two
    // questions are siblings and should read like it
    meta: `adopted ${meta.adopted} · ${party} countries bound`,
    purpose: meta.purpose,
  }
})

/**
 * The standing spread as bands, widest first among the outsiders so the bar
 * reads left to right from bound to absent. Empty bands drop out rather than
 * leaving a legend entry for a count of zero.
 */
const census = computed(() => {
  if (props.challenge._type !== 'treaty-challenge') return undefined
  const counts = treatyCensus(props.challenge.treaty)
  const total = counts.party + counts.signatory + counts.withdrawn + counts.absent
  if (!total) return undefined
  const bands = [
    { key: 'party' as const, label: 'bound', count: counts.party },
    { key: 'signatory' as const, label: 'signed only', count: counts.signatory },
    { key: 'withdrawn' as const, label: 'withdrew', count: counts.withdrawn },
    // Not "never joined": this band also holds the places with no standing to
    // take — Taiwan and Kosovo have no row in a UN depositary's table, and
    // calling that a choice would be a lie the bar repeats every round.
    { key: 'absent' as const, label: 'outside it', count: counts.absent },
  ]
  const shown = bands.filter(band => band.count > 0)
  // One country out of 194 is a third of a pixel. Floor each band and take
  // the room back proportionally, so a band that exists can always be seen
  // and the widths still sum to the whole.
  const floor = Math.min(MIN_BAND_SHARE, 100 / shown.length)
  const slack = 100 - floor * shown.length
  return shown.map(band => ({
    ...band,
    share: floor + (band.count / total) * slack,
  }))
})

/** The holdout's band, so the verdict row wears the same colour as the bar
 *  segment it belongs to. */
const standingKey = computed(() =>
  props.challenge._type === 'treaty-challenge'
    ? props.challenge.standing === 'absent'
      ? 'absent'
      : props.challenge.standing
    : undefined
)

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

// min-width, never max-width — the same contract .ranked-bars keeps. The
// lesson pill sizes itself to max-content (capped at 60rem), and this card's
// own text is what drove it there; capping the card at 42rem left it stranded
// against the pill's left edge with a dead gutter beside it, because a
// block-level flex box does not answer the ancestor's text-align: center.
.odd-one-out-reveal {
  gap: 1rem;
  display: flex;
  flex-flow: column nowrap;
  min-width: min(42rem, 100%);
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

  .seal {
    margin-bottom: 0.3rem;
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

// One hue per standing, shared by the census bar, its legend and the verdict
// row — the holdout's row is literally the colour of its slice.
$standings: (
  'party': hsl(202, 44%, 46%),
  'signatory': hsl(38, 72%, 54%),
  'withdrawn': hsl(8, 62%, 54%),
  // Dark enough to read as a border on the verdict row's amber wash, not
  // just as a band on the bar's pale track
  'absent': hsl(215, 16%, 52%),
);

.census {
  gap: 0.5rem;
  display: flex;
  flex-flow: column nowrap;
}

.census-bar {
  height: 0.8rem;
  display: flex;
  overflow: hidden;
  border-radius: 0.4rem;
  background: hsla(216, 40%, 25%, 0.1);

  .band {
    height: 100%;
    display: block;
    transform-origin: left center;
    animation: bar-grow 0.5s var(--ease-smooth) backwards;
    animation-delay: 220ms;
  }
}

.census-keys {
  gap: 0.3rem 1rem;
  display: flex;
  flex-wrap: wrap;
  font-size: 1.2rem;
  justify-content: center;
}

.census-key {
  gap: 0.35rem;
  opacity: 0.85;
  display: flex;
  align-items: center;

  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
  }
}

@each $standing, $color in $standings {
  .band.#{$standing} {
    background: $color;
  }

  .census-key.#{$standing} .swatch {
    background: $color;
  }
}

@media (prefers-reduced-motion: reduce) {
  .census-bar .band {
    animation: none;
  }
}

.verdict-row {
  gap: 0.8rem;
  display: flex;
  padding: 0.5rem 0.8rem;
  align-items: center;
  border-radius: 0.6rem;
  background: hsla(45, 90%, 74%, 0.35);

  // A treaty holdout's row takes its standing's colour as a left edge, so the
  // census bar above and the country below are visibly the same fact.
  @each $standing, $color in $standings {
    &.#{$standing} {
      border-left: 0.3rem solid $color;
    }
  }

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
