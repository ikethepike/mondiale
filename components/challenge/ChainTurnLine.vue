<template>
  <span class="map-caption sub chain-turn-line" aria-live="polite">
    <span class="turn-dot" :style="{ background: color }" />
    <span>{{ label }}</span>
    <ChallengeTimerRadial v-if="total" class="turn-clock" :value="seconds ?? 0" :total="total" />
  </span>
  <ol v-if="seats && seats.length > 1" class="seat-row" aria-label="The table">
    <li
      v-for="seat in seats"
      :key="seat.id"
      class="seat map-caption"
      :class="{ active: seat.active, out: seat.out }"
      :style="{ '--player-color': seat.color }"
    >
      <span class="seat-dot" />
      <span class="seat-name">{{ seat.name }}</span>
      <ParachuteGlyph v-for="cord in seat.cords" :key="`cord-${cord}`" class="seat-cord" />
      <span v-for="strike in seat.strikes" :key="`strike-${strike}`" class="seat-strike" />
      <span class="visually-hidden">
        {{ seat.out ? 'out' : seat.active ? 'on the clock' : '' }}
        {{ seat.cords ? `${seat.cords} rip cord` : '' }}
        {{ seat.strikes ? `${seat.strikes} strike left` : '' }}
      </span>
    </li>
  </ol>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ParachuteGlyph from '~/components/challenge/ParachuteGlyph.vue'

/** A turn-chain round's header line: who is up, the shot clock when no
 *  console carries it, and the table — cords and spare strikes per seat. */
defineProps<{
  label: string
  color?: string
  seconds?: number
  /** Omit while the console's own dial is on screen — one clock at a time. */
  total?: number
  seats?: {
    id: string
    name: string
    color?: string
    active: boolean
    out: boolean
    cords: number
    strikes: number
  }[]
}>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.chain-turn-line {
  gap: 0.6rem;
  display: inline-flex;
  align-items: center;

  .turn-dot {
    flex: none;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .turn-clock {
    --clock-size: 2.8rem;
    --clock-seconds-size: 1.1rem;
  }
}

.seat-row {
  margin: 0;
  padding: 0;
  gap: 0.4rem;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.seat {
  gap: 0.35rem;
  display: inline-flex;
  align-items: center;
  font-size: 1.15rem;
  padding: 0.15rem 0.7rem;
  border-radius: 1rem;
  border: 0.1rem solid transparent;
  transition: border-color 0.3s var(--ease-smooth);

  &.active {
    border-color: var(--player-color);
  }

  &.out {
    opacity: 0.45;
    text-decoration: line-through;
  }
}

.seat-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--player-color);
}

.seat-cord {
  width: 1.3rem;
  height: 1.3rem;
  color: var(--soft-blue);
}

.seat-strike {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  border: 0.1rem solid ink(0.5);
}

// A phone keeps the dots and the marks; the names live in the turn line.
@media screen and (max-width: $phone) {
  .seat-name {
    display: none;
  }
}
</style>
