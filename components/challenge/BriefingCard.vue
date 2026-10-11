<template>
  <section class="briefing briefing-card pane tr decorator-bottom">
    <slot />

    <div class="ready-row">
      <div
        v-for="playerId in participants"
        :key="playerId"
        class="ready-seat"
        :class="{ waiting: !ready.includes(playerId) }"
      >
        <slot name="seat" :player-id="playerId" />
        <PlayerPawn class="ready-pawn" :player="gameStore.game?.players[playerId]" />
        <span class="seat-name">{{ seatName(playerId) }}</span>
      </div>
    </div>

    <ButtonFilled v-if="canAck" @click="emit('ready')">{{ cta }}</ButtonFilled>
    <p v-else class="briefing-waiting">
      {{ spectating ? 'The table is reading the rules…' : 'Waiting for the rest of the table…' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { seatLabel } from '~~/lib/player'
import { useKeyboardSkip } from '~~/lib/use-keyboard-skip'
import { useGameStore } from '~~/store/game.store'

/** The click-away rules card a briefed round opens on: rules, the table's ready row, the ack. */
const props = defineProps<{
  participants: readonly string[]
  ready: readonly string[]
  cta: string
  /** The ack is already in flight, ahead of the snapshot that records it. */
  sent?: boolean
}>()
const emit = defineEmits<{ ready: [] }>()

const gameStore = useGameStore()

const spectating = computed(
  () => gameStore.watching || !props.participants.includes(gameStore.seatId)
)
const canAck = computed(
  () => !spectating.value && !props.sent && !props.ready.includes(gameStore.seatId)
)

const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.seatId)

useKeyboardSkip(
  () => canAck.value,
  () => emit('ready')
)
</script>
