<template>
  <div v-if="leader" class="leader-reveal">
    <div class="lead">
      <span
        v-if="leader.image"
        class="portrait"
        :style="{ backgroundImage: `url(${leader.image})` }"
        aria-hidden="true"
      />
      <div class="ident">
        <strong class="name">{{ leader.name }}</strong>
        <span v-if="title" class="title">{{ title }}</span>
        <!-- The party, with its mark where Commons had one. Its own row rather
             than a `.fact`: the fact row's opacity would wash a logo out, and
             a two-line chip breaks its interpunct list. -->
        <span v-if="partyName" class="party-chip">
          <img v-if="party?.logo" class="party-logo" :src="party.logo" alt="" />
          <span class="party-text">
            <span class="party-name">{{ partyName }}</span>
            <span v-if="leaning" class="party-leaning">{{ leaning }}</span>
          </span>
        </span>
        <span v-if="tenure || age" class="facts fact-row">
          <span v-if="tenure" class="fact">{{ tenure }}</span>
          <span v-if="age" class="fact">{{ age }}</span>
        </span>
      </div>
    </div>
    <p v-if="otherRole" class="other-role">
      {{ otherRole.role }}: <strong>{{ otherRole.leader.name }}</strong>
    </p>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" :item-credit="itemCredits" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </div>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, dedupeAttributions, mediaCreditLine } from '~~/lib/attribution'
import { leaderRoles, leaderTitle, partyLabel, politicalLeader } from '~~/lib/leaders'
import { governingParty, partyLeaning } from '~~/lib/parties'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ country: ISOCountryCode }>()

const leader = computed(() => politicalLeader(props.country))

/** The roster party behind the leader's party STRING — `governingParty` IS
 *  that join, so this never re-matches a name of its own. */
const party = computed(() => governingParty(props.country))

/** The roster's own spelling where the two joined (it is the name the logo
 *  belongs to), else the leader's raw string, so an unresolved party still
 *  reads exactly as it does today. */
const partyName = computed(
  () => party.value?.name ?? (leader.value?.party ? partyLabel(leader.value.party) : undefined)
)

const leaning = computed(() => (party.value ? partyLeaning(party.value) : undefined))

/** The leader and, once a party resolved, the roster behind its logo and
 *  politics. Deduped: both datasets credit Wikidata and Commons. */
const sources = computed(() =>
  dedupeAttributions([
    ...datasetAttribution('leaders'),
    ...(party.value ? datasetAttribution('parties') : []),
  ])
)

/** Two files on this card, two authors: the portrait and the party's mark.
 *  The logo's credit belongs to the FILE, so it rides only when shown. */
const itemCredits = computed(() =>
  [
    leader.value ? mediaCreditLine(leader.value, 'commons-media') : undefined,
    party.value?.logo ? mediaCreditLine(party.value, 'commons-media') : undefined,
  ].filter((credit): credit is string => !!credit)
)

const title = computed(() => (leader.value ? leaderTitle(leader.value) : undefined))

// "in office since 2019 · 6 yrs" — tenure of the surfaced leader.
const tenure = computed(() => {
  const since = leader.value?.sinceYear
  if (!since) return undefined
  const years = new Date().getFullYear() - since
  return years >= 1
    ? `in office since ${since} · ${years} yr${years === 1 ? '' : 's'}`
    : `in office since ${since}`
})

const age = computed(() => {
  const born = leader.value?.bornYear
  return born ? `b. ${born}` : undefined
})

// The OTHER role (head of state vs government), when it's a different person.
const otherRole = computed(() =>
  leaderRoles(props.country).find(entry => entry.leader.name !== leader.value?.name)
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
.leader-reveal {
  display: grid;
  gap: 0.8rem;
  justify-items: center;
  text-align: center;
}

.lead {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  text-align: left;
}

.portrait {
  flex: 0 0 auto;
  width: 6.4rem;
  height: 6.4rem;
  border-radius: 50%;
  background-size: cover;
  background-position: center top;
  border: 0.2rem solid milk(0.9);
  box-shadow: 0 2px 8px ink(0.3);
}

.ident {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.name {
  font-size: 1.9rem;
  color: var(--dark-blue);
}

.title {
  font-size: 1.4rem;
  color: var(--dark-blue);
  opacity: 0.85;
}

.facts {
  margin-top: 0.2rem;
}

.party-chip {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-top: 0.4rem;
  min-width: 0;
}

// Party logos are wordmarks with no common shape: the governing set runs from
// a taller-than-wide roundel to a 9:1 wordmark. A fixed box would render the
// widest of them a few pixels tall, so BOTH axes are capped and `width: auto`
// lets whichever one binds do the work — every mark keeps its proportions.
.party-logo {
  flex: none;
  width: auto;
  height: auto;
  max-width: 72px;
  max-height: 26px;
  object-fit: contain;
}

.party-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.party-name {
  font-size: 1.35rem;
  color: var(--dark-blue);
  opacity: 0.9;
}

// The leaning carries the fact row's weight — same class of information, just
// on its own line under the party it describes.
.party-leaning {
  font-size: 1.2rem;
  color: ink(0.55);
}

.other-role {
  margin: 0;
  font-size: 1.3rem;
  opacity: 0.7;
}
</style>
