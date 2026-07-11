<template>
  <div class="duel-reveal">
    <p class="topic map-caption">
      <StatTopicIcon class="topic-icon" :accessor="accessorId" />
      {{ topic }}
    </p>
    <ol class="duels">
      <li v-for="(duel, index) in rows" :key="index" class="duel">
        <span class="pair-dot" :style="{ background: duel.color }" aria-hidden="true" />
        <div class="side" :class="{ higher: true, missed: !duel.correct && duel.pickedLower }">
          <CountryFlag class="side-flag" :country="getCountry(duel.higher)" mode="background" />
          <span class="side-name">{{ countryName(duel.higher) }}</span>
          <strong class="side-value">{{ duel.higherValue }}</strong>
        </div>
        <span class="versus" aria-hidden="true">›</span>
        <div class="side lower" :class="{ chosen: duel.pickedLower }">
          <CountryFlag class="side-flag" :country="getCountry(duel.lower)" mode="background" />
          <span class="side-name">{{ countryName(duel.lower) }}</span>
          <span class="side-value">{{ duel.lowerValue }}</span>
        </div>
        <!-- Bounded indices: both countries on one track — the gap is the lesson. -->
        <ScalePlot v-if="duel.scale" class="duel-scale" v-bind="duel.scale" />
      </li>
    </ol>
  </div>
</template>
<script lang="ts" setup>
import ScalePlot from '~/components/feedback/ScalePlot.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { getScaleProps } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

interface DuelOutcome {
  picked: ISOCountryCode
  higher: ISOCountryCode
  lower: ISOCountryCode
  correct: boolean
}

const props = defineProps<{
  outcomes: DuelOutcome[]
  accessorId: GroupChallengeAccessorId
  topic: string
  colors: string[]
}>()

const value = (iso: ISOCountryCode) => {
  const amount = getValueByAccessorID(iso, props.accessorId)
  return amount ? formatAmount(amount) : '—'
}

// Bounded indices plot both countries on one shared track; the loser's dot
// echoes the row's color language (orange when wrongly picked, faded otherwise).
const rowScale = (higher: ISOCountryCode, lower: ISOCountryCode, pickedLower: boolean) => {
  const higherAmount = getValueByAccessorID(higher, props.accessorId)?.amount
  const lowerAmount = getValueByAccessorID(lower, props.accessorId)?.amount
  const base = getScaleProps(props.accessorId, higherAmount)
  if (!base || lowerAmount === undefined) return undefined
  const { amount, ...track } = base
  return {
    ...track,
    markers: [
      { amount, tone: 'primary' as const },
      { amount: lowerAmount, tone: pickedLower ? ('missed' as const) : ('muted' as const) },
    ],
  }
}

// The "higher ranks higher" row is the lesson: show both real values, mark
// which side the player chose so a wrong pick reads as "you took the smaller".
const rows = computed(() =>
  props.outcomes.map((outcome, index) => {
    const pickedLower = outcome.picked === outcome.lower
    return {
      higher: outcome.higher,
      lower: outcome.lower,
      higherValue: value(outcome.higher),
      lowerValue: value(outcome.lower),
      pickedLower,
      correct: outcome.correct,
      color: props.colors[index % props.colors.length],
      scale: rowScale(outcome.higher, outcome.lower, pickedLower),
    }
  })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.duel-reveal {
  text-align: left;
}

.topic {
  gap: 0.6rem;
  display: flex;
  align-items: center;
  margin: 0 auto 1rem;
  width: max-content;
  max-width: 100%;
  font-size: 1.4rem;
  padding: 0.4rem 1.2rem;
}

.topic-icon {
  flex: 0 0 auto;
  width: 1.6rem;
  height: 1.6rem;
  opacity: 0.7;
}

.duels {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.7rem;
}

.duel {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  align-items: center;
  gap: 0.9rem;
  padding: 0.7rem 1rem;
  border-radius: 1.2rem;
  background: hsla(0, 0%, 100%, 0.55);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.1);
}

.pair-dot {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.15);
}

.side {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.side-flag {
  flex: 0 0 auto;
  width: 2.2rem;
  height: 1.5rem;
  border-radius: 0.3rem;
  box-shadow: 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.12);
}

.side-name {
  font-size: 1.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-value {
  margin-left: auto;
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.side.higher .side-value {
  color: var(--dark-blue);
}

.side.lower {
  opacity: 0.7;
}

// The country the player wrongly picked — flag it so the miss is legible.
.side.lower.chosen {
  opacity: 1;

  .side-name,
  .side-value {
    color: var(--hior-ange);
  }
}

.versus {
  font-size: 1.6rem;
  color: hsla(215.7, 76.4%, 21.6%, 0.4);
  text-align: center;
}

.duel-scale {
  grid-column: 1 / -1;
}

@media (max-width: $tablet) {
  .duel {
    grid-template-columns: auto 1fr;
    grid-template-areas: 'dot higher' 'dot lower' 'scale scale';
    row-gap: 0.4rem;
  }
  .pair-dot {
    grid-area: dot;
  }
  .side.higher {
    grid-area: higher;
  }
  .side.lower {
    grid-area: lower;
  }
  .duel-scale {
    grid-area: scale;
  }
  .versus {
    display: none;
  }
}
</style>
