<template>
  <article class="coalition">
    <header class="panel-head">
      <span class="eyebrow">The government</span>
      <span class="head-end">
        <span class="kind" :class="summary.kind">{{ KIND_LABELS[summary.kind] }}</span>
        <SourceInfo :attributions="sources" :item-credit="portraitCredit" />
      </span>
    </header>

    <div class="head">
      <span
        v-if="leader?.image"
        class="portrait"
        :style="{ backgroundImage: `url(${leader.image})` }"
        aria-hidden="true"
      />
      <div class="ident">
        <strong class="name">{{ title }}</strong>
        <span v-if="leader" class="led-by">
          Led by {{ leader.name }}<template v-if="office">, {{ office }}</template>
        </span>
      </div>
    </div>

    <div class="composition">
      <div class="bar">
        <div class="fill">
          <span
            v-for="member in [...summary.members, ...summary.backers]"
            :key="member.name"
            class="segment"
            :class="member.standing"
            :style="{
              width: `${percentOf(member.seats)}%`,
              '--party-color': colorOf(member.name),
            }"
            :title="`${member.name} — ${formatNumber(member.seats)}`"
          />
        </div>
        <span class="majority-tick" :style="{ left: `${percentOf(summary.majority)}%` }" />
      </div>
      <div class="bar-scale">
        <span class="majority-label" :style="{ left: `${percentOf(summary.majority)}%` }">
          {{ formatNumber(summary.majority) }} for a majority
        </span>
      </div>
      <p class="margin">{{ marginLine }}</p>
    </div>

    <ol class="members">
      <li
        v-for="(member, index) in summary.members"
        :key="member.name"
        class="member"
        :style="{ '--member-delay': `${index * 60}ms` }"
      >
        <img
          v-if="benchOf(member.name)?.logo"
          class="party-logo"
          :src="benchOf(member.name)?.logo"
          alt=""
        />
        <span v-else class="party-swatch" :style="{ background: colorOf(member.name) }" />
        <span class="member-text">
          <span class="member-name">{{ member.name }}</span>
          <span v-if="leaningOf(member)" class="member-leaning">{{ leaningOf(member) }}</span>
        </span>
        <span class="member-seats">
          {{ formatNumber(member.seats) }}
          <em v-if="summary.members.length > 1">{{ weightOf(member.seats) }}</em>
        </span>
      </li>
    </ol>

    <template v-if="summary.backers.length">
      <span class="backers-head">Backing it from outside the cabinet</span>
      <ul class="backers">
        <li v-for="member in summary.backers" :key="member.name" class="backer">
          <img
            v-if="benchOf(member.name)?.logo"
            class="party-logo"
            :src="benchOf(member.name)?.logo"
            alt=""
          />
          <span v-else class="party-swatch" :style="{ background: colorOf(member.name) }" />
          <span class="member-name">{{ member.name }}</span>
          <span class="member-seats">{{ formatNumber(member.seats) }}</span>
        </li>
      </ul>
    </template>

    <figure v-if="summary.span" class="spectrum">
      <ol class="bands">
        <li
          v-for="(band, index) in SPECTRUM_BANDS"
          :key="band"
          class="band"
          :class="{ spanned: index >= spanFrom && index <= spanTo }"
        >
          <span class="band-marks">
            <span
              v-for="member in membersIn(band)"
              :key="member.name"
              class="band-mark"
              :style="{ '--party-color': colorOf(member.name) }"
              :title="member.name"
            />
          </span>
          <span class="band-label">{{ SPECTRUM_LABELS[band] }}</span>
        </li>
      </ol>
      <figcaption class="spectrum-caption">{{ spanLine }}</figcaption>
    </figure>

    <p v-if="lesson" class="lesson">{{ lesson }}</p>
  </article>
</template>

<script setup lang="ts">
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution, dedupeAttributions, mediaCreditLine } from '~~/lib/attribution'
import { coalitionName, type CoalitionMember, type CoalitionSummary } from '~~/lib/government'
import { leaderTitle, politicalLeader } from '~~/lib/leaders'
import { formatNumber } from '~~/lib/number'
import { SPECTRUM_BANDS, SPECTRUM_LABELS, type Spectrum } from '~~/lib/parties'
import { sentenceCase } from '~~/lib/strings'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import type { GovernmentChallenge } from '~~/types/challenges/group-modes.type'

/** The reveal's portrait of who governs: the cabinet's parties, its props, and how far it sits from carrying the house. */
const props = defineProps<{
  summary: CoalitionSummary
  challenge: GovernmentChallenge
  lesson?: string
}>()

const KIND_LABELS: Record<CoalitionSummary['kind'], string> = {
  majority: 'Majority',
  backed: 'Minority, backed',
  minority: 'Minority',
}

const leader = computed(() => politicalLeader(props.challenge.country))
const office = computed(() => (leader.value ? leaderTitle(leader.value) : undefined))

const sources = computed(() =>
  dedupeAttributions([
    ...datasetAttribution('parties'),
    ...(leader.value ? datasetAttribution('leaders') : []),
  ])
)
const portraitCredit = computed(() =>
  leader.value?.image ? mediaCreditLine(leader.value, 'commons-media') : undefined
)

const title = computed(() => sentenceCase(coalitionName(props.summary)))

const benchOf = (name: string) => props.challenge.benches.find(bench => bench.name === name)

const colorOf = (name: string) => benchOf(name)?.color ?? BOARD_COLORS.darkBlue

const percentOf = (seats: number) =>
  props.challenge.totalSeats ? Math.min(100, (seats / props.challenge.totalSeats) * 100) : 0

const weightOf = (seats: number) =>
  `${Math.round((seats / Math.max(1, props.summary.seats)) * 100)}%`

const leaningOf = (member: CoalitionMember) =>
  [member.spectrum ? SPECTRUM_LABELS[member.spectrum] : undefined, member.ideology]
    .filter(Boolean)
    .join(' · ')

const marginLine = computed(() => {
  const { seats, backedSeats, majority, kind, backers } = props.summary
  if (kind === 'majority') {
    const spare = seats - majority
    return spare
      ? `${formatNumber(seats)} seats: ${formatNumber(spare)} to spare over a majority.`
      : `${formatNumber(seats)} seats: a majority with not one to spare.`
  }
  const short = `${formatNumber(seats)} seats: ${formatNumber(majority - seats)} short on its own`
  if (kind === 'backed') return `${short}, carried past the line by its backers.`
  return backers.length
    ? `${short}, and ${formatNumber(majority - backedSeats)} short even with its backers.`
    : `${short}.`
})

const spanFrom = computed(() =>
  props.summary.span ? SPECTRUM_BANDS.indexOf(props.summary.span[0]) : -1
)
const spanTo = computed(() =>
  props.summary.span ? SPECTRUM_BANDS.indexOf(props.summary.span[1]) : -1
)

const membersIn = (band: Spectrum) =>
  props.summary.members.filter(member => member.spectrum === band)

const spanLine = computed(() => {
  const span = props.summary.span
  if (!span) return ''
  const [left, right] = span.map(band => SPECTRUM_LABELS[band].toLowerCase())
  const { members } = props.summary
  if (members.length === 1) return `Sits ${left}.`
  if (left !== right) return `Spans ${left} to ${right}.`
  return members.every(member => member.spectrum) ? `All sit ${left}.` : `Sits ${left}.`
})
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;

.coalition {
  display: grid;
  gap: 1rem;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: $hairline;
}

.head-end {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.head {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.portrait {
  flex: 0 0 auto;
  width: 4.4rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: ink(0.08) center / cover no-repeat;
  box-shadow: 0 0 0 1px #{ink(0.14)};
}

.ident {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 0.2rem;
}

.name {
  font-size: 1.7rem;
  line-height: 1.15;
}

.led-by {
  font-size: 1.2rem;
  opacity: 0.75;
}

.kind {
  flex: 0 0 auto;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  font-size: 1.1rem;
  white-space: nowrap;
  background: ink(0.85);
  color: milk();

  &.backed {
    background: transparent;
    box-shadow: inset 0 0 0 0.15rem #{ink(0.85)};
    color: ink(0.9);
  }

  &.minority {
    background: ink(0.12);
    color: ink(0.9);
  }
}

.composition {
  display: grid;
  gap: 0.3rem;
}

.bar {
  position: relative;
  height: 1.4rem;
  border-radius: 0.7rem;
  background: ink(0.08);
}

.fill {
  display: flex;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  animation: fill-in var(--motion-slow) var(--ease-out-expressive) var(--sweep, 0ms) both;
}

@keyframes fill-in {
  from {
    clip-path: inset(0 100% 0 0);
  }
}

.segment {
  flex: 0 0 auto;
  height: 100%;
  background: var(--party-color);
  box-shadow: inset -1px 0 0 #{milk(0.9)};

  &.backing {
    background: repeating-linear-gradient(-45deg, #{ink(0.7)} 0 0.2rem, transparent 0.2rem 0.45rem);
  }
}

.majority-tick {
  position: absolute;
  inset-block: -0.35rem;
  width: 0;
  border-left: 0.2rem solid #{ink(0.9)};
  transform: translateX(-50%);
}

.bar-scale {
  position: relative;
  height: 1.4rem;
}

.majority-label {
  position: absolute;
  top: 0;
  font-size: 1.05rem;
  white-space: nowrap;
  opacity: 0.7;
  transform: translateX(-50%);
}

.margin {
  margin: 0.2rem 0 0;
  font-size: 1.3rem;
  line-height: 1.4;
}

.members,
.backers {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.member,
.backer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
}

.member {
  animation: row-land var(--motion-base) var(--ease-out-expressive)
    calc(var(--sweep, 0ms) + var(--member-delay, 0ms)) backwards;
}

.party-logo {
  width: 2.4rem;
  height: 2.4rem;
  object-fit: contain;
}

.party-swatch {
  justify-self: center;
  width: 1.2rem;
  aspect-ratio: 1;
  border-radius: 50%;
}

.member-text {
  display: grid;
  min-width: 0;
}

.member-name {
  font-size: 1.3rem;
  line-height: 1.25;
}

.member-leaning {
  font-size: 1.1rem;
  opacity: 0.65;
}

.member-seats {
  display: grid;
  justify-items: end;
  font-size: 1.4rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  em {
    font-size: 1rem;
    font-style: normal;
    font-weight: 400;
    opacity: 0.6;
  }
}

.backers-head {
  padding-top: 0.6rem;
  border-top: $hairline;
  font-size: 1.1rem;
  opacity: 0.7;
}

.backer .member-name {
  font-size: 1.2rem;
}

.backer .member-seats {
  font-size: 1.2rem;
}

.spectrum {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding-top: 0.8rem;
  border-top: $hairline;
}

.bands {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.band {
  display: grid;
  grid-template-rows: 2rem auto;
  justify-items: center;
  gap: 0.3rem;
  padding-top: 0.4rem;
  border-top: 0.3rem solid #{ink(0.1)};
  transition: border-color var(--motion-base) var(--ease-smooth);

  &.spanned {
    border-top-color: ink(0.85);
  }
}

.band-marks {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.band-mark {
  width: 1.2rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--party-color);
  box-shadow:
    0 0 0 1px #{milk()},
    0 0 0 2px #{ink(0.25)};
}

.band-label {
  font-size: 1rem;
  text-align: center;
  opacity: 0.7;
}

.spectrum-caption {
  font-size: 1.2rem;
  opacity: 0.8;
}

.lesson {
  margin: 0;
  padding-top: 0.8rem;
  border-top: $hairline;
  font-size: 1.25rem;
  line-height: 1.5;
}
</style>
