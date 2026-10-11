<template>
  <section class="government-sides">
    <div
      class="coalition-meter"
      :class="{ carries: withSeats >= majority }"
      role="img"
      :aria-label="`${withSeats} of ${challenge.totalSeats} seats with the government; ${majority} for a majority`"
    >
      <div class="meter-track">
        <span class="meter-fill governing" :style="{ width: share(governingSeats) }" />
        <span
          v-for="bench in benches"
          :key="bench.name"
          class="meter-fill backer"
          :style="{ width: filed[bench.name] === 'government' ? share(bench.seats) : '0%' }"
        />
        <span class="meter-majority" :style="{ left: share(majority) }" />
      </div>
      <p class="meter-label">
        <strong>{{ withSeats }}</strong> with the government
        <span class="meter-need">{{ majority }} for a majority</span>
      </p>
    </div>

    <TransitionGroup tag="ul" name="bench" class="sides-grid" :style="gridRows">
      <li key="head-with" class="column-head with" :style="{ gridRow: headRow }">
        <span class="eyebrow">With</span>
        <span class="column-seats">{{ withSeats }}</span>
      </li>
      <li key="head-against" class="column-head against" :style="{ gridRow: headRow }">
        <span class="eyebrow">Against</span>
        <span class="column-seats">{{ againstSeats }}</span>
      </li>

      <li
        v-if="governing"
        key="governing"
        class="side-chip governing"
        :style="{ gridRow: headRow + 1 }"
      >
        <span class="bench-tag">
          <img v-if="governing.logo" class="bench-logo" :src="governing.logo" alt="" />
          <span v-else class="bench-swatch" :style="{ background: governing.color }" />
          <span class="bench-name">{{ governing.name }}</span>
          <span class="bench-seats">{{ governingSeats }}</span>
        </span>
      </li>

      <li
        v-for="bench in benches"
        :key="bench.name"
        :class="[
          filed[bench.name] ? ['side-chip', filed[bench.name]] : 'tray-row',
          markOf(bench.name),
        ]"
        :style="{ gridRow: placement[bench.name] }"
      >
        <template v-if="!filed[bench.name]">
          <button
            type="button"
            class="side-button with"
            :disabled="locked"
            :aria-label="`${bench.name}: with the government`"
            @click="emit('file', bench.name, 'government')"
          >
            <span aria-hidden="true">‹</span> With
          </button>
          <span class="bench-tag">
            <img v-if="bench.logo" class="bench-logo" :src="bench.logo" alt="" />
            <span v-else class="bench-swatch" :style="{ background: bench.color }" />
            <span class="bench-name">{{ bench.name }}</span>
            <span class="bench-seats">{{ bench.seats }}</span>
          </span>
          <button
            type="button"
            class="side-button against"
            :disabled="locked"
            :aria-label="`${bench.name}: against the government`"
            @click="emit('file', bench.name, 'opposition')"
          >
            Against <span aria-hidden="true">›</span>
          </button>
        </template>
        <button
          v-else
          type="button"
          class="chip-button"
          :disabled="locked"
          :aria-label="`Move ${bench.name} ${filed[bench.name] === 'government' ? 'against' : 'with'} the government`"
          @click="
            emit(
              'file',
              bench.name,
              filed[bench.name] === 'government' ? 'opposition' : 'government'
            )
          "
        >
          <span class="bench-tag">
            <img v-if="bench.logo" class="bench-logo" :src="bench.logo" alt="" />
            <span v-else class="bench-swatch" :style="{ background: bench.color }" />
            <span class="bench-name">{{ bench.name }}</span>
            <span class="bench-seats">{{ bench.seats }}</span>
          </span>
          <span v-if="truth" class="chip-mark" aria-hidden="true">
            {{ truth[bench.name] === filed[bench.name] ? '✓' : '✗' }}
          </span>
        </button>
      </li>
    </TransitionGroup>
  </section>
</template>

<script setup lang="ts">
import { majorityOf, type BenchSide } from '~~/lib/government'
import type { GovernmentChallenge } from '~~/types/challenges/group-modes.type'

/** Beat 3's sorting board: a tray of unsorted benches, the With/Against columns and the coalition they add up to. */
const props = defineProps<{
  challenge: GovernmentChallenge
  governingName?: string
  filed: Record<string, BenchSide>
  locked: boolean
  /** The verdict's truth per bench, once beat 3 resolves. */
  truth?: Record<string, BenchSide>
}>()
const emit = defineEmits<{ file: [name: string, side: BenchSide] }>()

const benchOf = (name: string) => props.challenge.benches.find(bench => bench.name === name)

const benches = computed(() =>
  props.challenge.sorted.map(name => {
    const bench = benchOf(name)
    return { name, logo: bench?.logo, color: bench?.color, seats: bench?.seats ?? 0 }
  })
)

const governing = computed(() => (props.governingName ? benchOf(props.governingName) : undefined))
const governingSeats = computed(() => governing.value?.seats ?? 0)
const majority = computed(() => majorityOf(props.challenge.totalSeats))

const tray = computed(() => benches.value.filter(bench => !props.filed[bench.name]))
const sumOf = (side: BenchSide) =>
  benches.value.reduce(
    (total, bench) => total + (props.filed[bench.name] === side ? bench.seats : 0),
    0
  )
const withSeats = computed(() => governingSeats.value + sumOf('government'))
const againstSeats = computed(() => sumOf('opposition'))

const headRow = computed(() => tray.value.length + 1)

/** Every bench's grid row: the tray stacks above the heads, each column stacks under its own. */
const placement = computed(() => {
  const rows: Record<string, number> = {}
  tray.value.forEach((bench, index) => (rows[bench.name] = index + 1))
  let withRow = headRow.value + (governing.value ? 2 : 1)
  let againstRow = headRow.value + 1
  for (const bench of benches.value.filter(bench => props.filed[bench.name])) {
    rows[bench.name] = props.filed[bench.name] === 'government' ? withRow++ : againstRow++
  }
  return rows
})

const gridRows = computed(() => ({
  gridTemplateRows: `repeat(${Object.keys(placement.value).length + 2}, auto)`,
}))

const share = (seats: number) =>
  `${props.challenge.totalSeats ? Math.min(100, (seats / props.challenge.totalSeats) * 100) : 0}%`

const markOf = (name: string) => {
  if (!props.truth) return undefined
  return props.truth[name] === props.filed[name] ? 'was-right' : 'was-wrong'
}
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/_ink.scss' as *;
@use '~/assets/scss/rules/_breakpoints.scss' as *;

.government-sides {
  @include caption-surface($cardRadius);

  display: grid;
  gap: 14px;
  width: min(calc(100% - 2.4rem), 640px);
  min-height: 0;
  max-height: 100%;
  margin-inline: auto;
  padding: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  pointer-events: auto;
}

.coalition-meter {
  display: grid;
  gap: 6px;
}

.meter-track {
  position: relative;
  display: flex;
  height: 14px;
  overflow: visible;
  border-radius: 7px;
  background: ink(0.08);
}

.meter-fill {
  flex: none;
  height: 100%;
  transition: width var(--motion-base) var(--ease-out-expressive);

  &.governing {
    border-radius: 7px 0 0 7px;
    background: ink(0.88);
  }

  &.backer {
    background: ink(0.5);
    box-shadow: inset 2px 0 0 milk();
  }
}

.meter-majority {
  position: absolute;
  top: -4px;
  bottom: -4px;
  border-left: 2px solid var(--dark-blue);
}

.meter-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.6rem;
  margin: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;

  strong {
    font-size: 20px;
  }
}

.meter-need {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;

  .carries & {
    opacity: 1;
  }
}

.sides-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tray-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch;
  border: 1px solid ink(0.2);
  border-radius: 12px;
  background: milk();
  overflow: hidden;
  animation: row-land var(--motion-base) var(--ease-out-expressive) backwards;

  .bench-tag {
    padding: 8px 10px;
  }
}

.side-button {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 76px;
  min-height: 48px;
  padding: 0 12px;
  border: none;
  background: ink(0.05);
  color: var(--dark-blue);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-quick) var(--ease-smooth);

  &.with {
    justify-content: flex-start;
    border-right: 1px solid ink(0.14);
  }

  &.against {
    justify-content: flex-end;
    border-left: 1px solid ink(0.14);
  }

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: ink(0.12);
    }
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.column-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 4px 2px;
  border-bottom: $hairline;

  &.with {
    grid-column: 1;
  }

  &.against {
    grid-column: 2;
  }

  .eyebrow {
    margin: 0;
  }
}

.column-seats {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.side-chip {
  grid-column: 2;
  border: 1px solid ink(0.2);
  border-radius: 12px;
  background: milk();

  &.government,
  &.governing {
    grid-column: 1;
  }

  &.governing {
    background: ink(0.06);

    .bench-tag {
      padding: 8px 10px;
    }
  }

  &.was-right {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }

  &.was-wrong {
    border-color: var(--hior-ange);
    background: flame(0.18);
  }
}

.tray-row.was-wrong {
  border-color: var(--hior-ange);
}

.chip-button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  .bench-tag {
    flex: 1;
  }
}

.chip-mark {
  flex: none;
  font-size: 16px;
  font-weight: 700;
}

.bench-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  line-height: 1.2;
}

.bench-logo {
  flex: none;
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.bench-swatch {
  flex: none;
  width: 16px;
  aspect-ratio: 1;
  border-radius: 50%;
}

.bench-name {
  display: -webkit-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.bench-seats {
  flex: none;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.bench-move {
  transition: transform var(--motion-base) var(--ease-out-expressive);
}

@media (max-width: $phone) {
  .side-button {
    min-width: 64px;
    padding: 0 8px;
    font-size: 13px;
  }

  .side-chip .bench-seats {
    display: none;
  }
}
</style>
