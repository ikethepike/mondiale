<template>
  <ButtonFilled class="browse-continue-button" :disabled="waiting" @click="emit('continue')">
    <span v-if="waiting">{{ waitingLabel }}</span>
    <!-- Button copy, not view chrome — a round's shared radial is the clock;
         a dial inside a button label wouldn't read. -->
    <span v-else-if="secondsLeft <= BROWSE_HINT_S">Continuing in {{ secondsLeft }}s</span>
    <span v-else>Continue</span>
  </ButtonFilled>
</template>
<script lang="ts" setup>
/**
 * THE browsable reveal's exit button: every player-paced reveal (trend-race,
 * the timeline chronicle, the gate record) leaves through this one component,
 * so the countdown flip, the hint window and the width discipline cannot
 * drift between them. `secondsLeft` counts down the reveal's cap; inside the
 * final `BROWSE_HINT_S` stretch the label becomes the countdown. `waiting`
 * disables the exit once this seat has acked but the table hasn't (the
 * timeline's table-atomic settle) — `waitingLabel` says why.
 */
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import { BROWSE_HINT_S } from '~~/lib/round-beats'

withDefaults(
  defineProps<{
    secondsLeft: number
    waiting?: boolean
    waitingLabel?: string
  }>(),
  { waiting: false, waitingLabel: 'Waiting for the table' }
)

const emit = defineEmits<{ continue: [] }>()
</script>
<style lang="scss" scoped>
// The widest label owns the width, so the countdown flip (or the waiting
// state) never walks the layout — one min-width for every browse exit.
.browse-continue-button {
  min-width: 26rem;
}
</style>
