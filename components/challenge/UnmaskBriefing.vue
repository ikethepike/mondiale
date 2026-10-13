<template>
  <BriefingCard
    class="unmask-briefing"
    :participants="participants"
    :ready="ready"
    cta="I'm ready"
    :sent="sent"
    @ready="emit('ready')"
  >
    <span class="eyebrow">Unmask</span>
    <h2>Who is behind the file?</h2>

    <ol class="ladder" aria-label="The file, rung by rung">
      <li v-for="rung in ladder" :key="rung.index" :style="{ '--i': rung.index }">
        <span class="rung-label">{{ rung.label }}</span>
        <span class="rung-pay">{{ rung.pay }}</span>
      </li>
    </ol>

    <ul class="briefing-points">
      <li>
        A rung opens every {{ challenge.secondsPerRung }} seconds: the face sharpens, then the
        facts, then the name.
      </li>
      <li>Every fact rules suspects out, and they dim on the map.</li>
      <li>
        Type the leader or the country, or tap a suspect. Your first pick is your one accusation.
      </li>
      <li>The earlier it lands, the more it pays. A wrong country pays nothing.</li>
    </ul>
  </BriefingCard>
</template>
<script lang="ts" setup>
import BriefingCard from '~/components/challenge/BriefingCard.vue'
import { formatCompact } from '~~/lib/number'
import { buzzScore } from '~~/lib/scoring'
import { UNMASK_RUNG_LABELS } from '~~/lib/unmask'
import { unmaskRemainingFraction } from '~~/lib/unmask-pace'
import type { UnmaskChallenge } from '~~/types/challenges/group-modes.type'

/** Unmask's briefing card: the round's own ladder with what an accusation pays at each rung. */
const props = defineProps<{
  challenge: UnmaskChallenge
  ready: string[]
  participants: string[]
  sent: boolean
}>()
const emit = defineEmits<{ ready: [] }>()

const ladder = computed(() =>
  props.challenge.rungs.map((kind, index) => ({
    index,
    label: UNMASK_RUNG_LABELS[kind],
    pay: formatCompact(
      buzzScore(props.challenge.maximumPoints, unmaskRemainingFraction(props.challenge, index + 1))
    ),
  }))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.ladder {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;

  li {
    gap: 0.5rem;
    display: flex;
    align-items: baseline;
    padding: 0.3rem 0.9rem;
    border-radius: 999px;
    border: 0.1rem solid ink(0.18);
    animation: row-land var(--motion-base) var(--ease-out-expressive) both;
    animation-delay: calc(var(--i) * 0.05s);
  }

  .rung-label {
    font-size: 1.3rem;
  }

  .rung-pay {
    font-weight: 600;
    font-size: 1.2rem;
    color: var(--dark-blue);
    font-variant-numeric: tabular-nums;
  }
}
</style>
