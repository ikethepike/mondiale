<template>
  <div class="stat-detective-reveal">
    <!-- The round's clues, kept this time: every number the detective saw,
         browsable — tap one to see where the country sits in the world. -->
    <ul class="clue-recap">
      <li v-for="clue in clues" :key="clue.accessorId">
        <button
          type="button"
          class="clue-row"
          :class="{ selected: clue.accessorId === selectedId }"
          @click="selectedId = clue.accessorId"
        >
          <StatTopicIcon class="row-icon" :topic="clue.topic" :accessor="clue.accessorId" />
          <span class="row-label">{{ clue.label }}</span>
          <strong class="row-value">{{ clue.value }}</strong>
        </button>
      </li>
    </ul>

    <div v-if="selectedId" class="spread">
      <span class="spread-caption">
        {{ countryName(challenge.country) }} among every country — {{ selectedLabel }}
      </span>
      <StatStripPlot :accessor-id="selectedId" :target="challenge.country" />
      <span v-if="sourceLine" class="source-line">
        {{ sourceLine }}
        <SourceInfo v-if="sourceAttribution" :attributions="[sourceAttribution]" />
      </span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import StatStripPlot from '~/components/feedback/StatStripPlot.vue'
import { attributionFor, statSourceLine } from '~~/lib/attribution'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { StatDetectiveChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

const props = defineProps<{
  challenge: StatDetectiveChallenge
}>()

const clues = computed(() =>
  props.challenge.clues.map(accessorId => {
    const value = getValueByAccessorID(props.challenge.country, accessorId)
    return {
      accessorId,
      label: accessorTopicLabel(accessorId),
      topic: getChallengeDetails(accessorId)?.topic,
      value: value ? formatAmount(value) : '—',
    }
  })
)

const selectedId = ref<GroupChallengeAccessorId | undefined>(props.challenge.clues[0])

const selectedLabel = computed(() => (selectedId.value ? accessorTopicLabel(selectedId.value) : ''))

const selectedValue = computed(() =>
  selectedId.value ? getValueByAccessorID(props.challenge.country, selectedId.value) : undefined
)

const sourceLine = computed(() =>
  selectedId.value ? statSourceLine(selectedId.value, selectedValue.value) : undefined
)
const sourceAttribution = computed(() =>
  selectedId.value ? attributionFor(selectedId.value, selectedValue.value) : undefined
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.stat-detective-reveal {
  gap: 1.6rem;
  display: flex;
  flex-flow: column nowrap;
}

.clue-recap {
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));

  li {
    display: flex;
  }
}

.clue-row {
  gap: 0.8rem;
  flex: 1;
  display: flex;
  cursor: pointer;
  min-width: 0;
  align-items: center;
  font-family: inherit;
  text-align: left;
  padding: 0.8rem 1.1rem;
  border-radius: 1rem;
  color: var(--dark-blue);
  background: milk(0.88);
  border: 0.1rem solid ink(0.25);
  transition: border-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover {
      border-color: var(--dark-blue);
    }
  }

  &.selected {
    border-color: var(--soft-blue);
    box-shadow: 0 0 0 0.1rem var(--soft-blue);
  }
}

.row-icon {
  flex: none;
  opacity: 0.5;
}

.row-label {
  opacity: 0.65;
  min-width: 0;
  overflow: hidden;
  font-size: 1.2rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.row-value {
  margin-left: auto;
  font-size: 1.4rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.spread {
  gap: 0.6rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .stat-strip-plot {
    --swarm-height: clamp(8rem, 14vh, 12rem);
  }
}

.spread-caption {
  opacity: 0.65;
  font-size: 1.3rem;
  text-align: center;
}

@media screen and (max-width: $tablet) {
  .clue-recap {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
