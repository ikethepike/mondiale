<template>
  <div class="final-scales">
    <!-- The verdict: a real balance, pans hanging plumb, settling into tilt -->
    <template v-if="result">
      <svg class="balance" viewBox="0 0 200 116" aria-hidden="true">
        <polygon class="pivot" points="100,60 93,78 107,78" />
        <rect class="base" x="80" y="78" width="40" height="4" rx="2" />
        <g class="beam" :style="{ transform: `rotate(${angle}deg)` }">
          <rect class="bar" x="28" y="56" width="144" height="4" rx="2" />
          <circle class="hub" cx="100" cy="58" r="4.5" />
          <g class="pan" :style="{ transform: `rotate(${-angle}deg)` }" style="transform-origin: 30px 58px">
            <line x1="30" y1="58" x2="20" y2="86" />
            <line x1="30" y1="58" x2="40" y2="86" />
            <path d="M 16 86 Q 30 102 44 86 Z" />
          </g>
          <g class="pan" :style="{ transform: `rotate(${-angle}deg)` }" style="transform-origin: 170px 58px">
            <line x1="170" y1="58" x2="160" y2="86" />
            <line x1="170" y1="58" x2="180" y2="86" />
            <path d="M 156 86 Q 170 102 184 86 Z" />
          </g>
        </g>
      </svg>
      <div class="readout" :class="result.balanced ? 'balanced' : 'off'">
        <div class="side">
          <span class="map-caption side-label">{{ targetName }}</span>
          <strong>{{ result.targetDisplay }}</strong>
        </div>
        <span class="verdict map-caption">{{
          result.balanced ? 'Balanced' : `Off by ${result.offBy}%`
        }}</span>
        <div class="side">
          <span class="map-caption side-label">Your side</span>
          <strong>{{ result.combinedDisplay }}</strong>
        </div>
      </div>
      <div v-if="waffle" class="waffle">
        <div class="block" :title="`${targetName} · ${result.targetDisplay}`">
          <div class="squares">
            <span
              v-for="index in waffle.targetSquares"
              :key="index"
              class="square"
              :style="{ background: TARGET_COLOR }"
            />
          </div>
        </div>
        <div class="block" :title="`Your side · ${result.combinedDisplay}`">
          <div class="squares">
            <template v-for="entry in waffle.picks" :key="entry.isoCode">
              <span
                v-for="index in entry.squares"
                :key="`${entry.isoCode}-${index}`"
                class="square"
                :style="{ background: entry.color }"
              />
            </template>
          </div>
        </div>
        <ul class="legend">
          <li>
            <span class="swatch" :style="{ background: TARGET_COLOR }" />
            {{ targetName }} · {{ result.targetDisplay }}
          </li>
          <li v-for="entry in waffle.picks" :key="entry.isoCode">
            <span class="swatch" :style="{ background: entry.color }" />
            {{ entry.name }} · {{ entry.display }}
          </li>
        </ul>
        <span class="unit map-caption">▪ = {{ waffle.unitDisplay }}</span>
      </div>
    </template>
    <template v-else>
      <div class="pans">
        <div class="pan-card target">
          <span class="map-caption side-label">Their side</span>
          <strong>{{ targetName }}</strong>
        </div>
        <span class="versus">⚖</span>
        <div class="pan-card picks">
          <span class="map-caption side-label"
            >Your side · {{ picks.length }}/{{ challenge.maxPicks }}</span
          >
          <strong v-if="!picks.length" class="hint">Tap countries on the map</strong>
          <strong v-else>{{ pickNames }}</strong>
        </div>
      </div>
      <footer>
        <ButtonLine :disabled="!picks.length" @click="$emit('clear')">Clear</ButtonLine>
        <ButtonFilled :disabled="!picks.length" @click="$emit('weigh')">Weigh in</ButtonFilled>
      </footer>
    </template>
  </div>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ButtonLine from '~/components/button/ButtonLine.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName } from '~~/lib/country'
import { formatAmount } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { ScalesChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface ScalesResult {
  /** combined / target — drives the tilt. */
  ratio: number
  offBy: number
  balanced: boolean
  targetDisplay: string
  combinedDisplay: string
}

/**
 * The balance HUD. Blind while picking — no live tilt or numbers, or the
 * scale itself would solve the estimation — then the reveal swings a real
 * beam to the verdict, pans hanging plumb.
 */
const props = defineProps<{
  challenge: ScalesChallenge
  picks: ISOCountryCode[]
  result?: ScalesResult
}>()

defineEmits<{ weigh: []; clear: [] }>()

const targetName = computed(() => countryName(COUNTRIES[props.challenge.target]))
const pickNames = computed(() =>
  props.picks.map(isoCode => countryName(COUNTRIES[isoCode])).join(' + ')
)

// Waffle palette, validated against the parchment surface (dataviz six
// checks); pick colors follow pick order, never rank
const TARGET_COLOR = '#2a5ca8'
const PICK_COLORS = ['#1f9ecf', '#e05a3e', '#b87a10']

/** Snap to a 1/2/2.5/5 × 10^k step so the unit caption reads naturally. */
const niceUnit = (raw: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map(step => step * magnitude).find(step => step >= raw) ?? raw
}

// One square = one unit of the stat, unit sized so the heavier side stays
// around two dozen squares
const waffle = computed(() => {
  if (!props.result) return undefined
  const target = getValueByAccessorID(props.challenge.target, props.challenge.accessorId)
  if (!target) return undefined

  const pickAmounts = props.picks.map(isoCode => ({
    isoCode,
    amount: getValueByAccessorID(isoCode, props.challenge.accessorId)?.amount ?? 0,
  }))
  const combined = pickAmounts.reduce((sum, entry) => sum + entry.amount, 0)
  const unit = niceUnit(Math.max(target.amount, combined) / 22)

  return {
    targetSquares: Math.max(1, Math.round(target.amount / unit)),
    picks: pickAmounts.map((entry, index) => ({
      ...entry,
      name: countryName(COUNTRIES[entry.isoCode]),
      display: formatAmount({ ...target, amount: entry.amount }),
      squares: Math.max(1, Math.round(entry.amount / unit)),
      color: PICK_COLORS[index % PICK_COLORS.length]!,
    })),
    unitDisplay: formatAmount({ ...target, amount: unit }),
  }
})

// Level at perfect balance, band edge ≈ 8°, hard overshoot caps ≈ 13°. The
// heavier side dips: your side is the right pan.
const angle = ref(0)
watch(
  () => props.result,
  result => {
    if (!result) return (angle.value = 0)
    const strain = (result.ratio - 1) / props.challenge.tolerance
    requestAnimationFrame(() => {
      angle.value = Math.max(-1.6, Math.min(1.6, strain)) * 8
    })
  },
  { immediate: true }
)
</script>
<style lang="scss" scoped>
.final-scales {
  gap: 1rem;
  left: 50%;
  bottom: 2.4rem;
  display: flex;
  padding: 1.4rem 2rem;
  position: absolute;
  transform: translateX(-50%);
  pointer-events: auto;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  background: hsla(36, 100%, 98%, 0.92);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem hsla(216, 58%, 10%, 0.18);
  max-width: min(56rem, calc(100vw - 3.2rem));
}

.balance {
  width: 22rem;

  .pivot,
  .base,
  .hub {
    fill: var(--dark-blue);
  }

  .beam {
    transform-origin: 100px 58px;
    transition: transform 1.2s var(--ease-smooth);

    .bar {
      fill: var(--dark-blue);
    }

    .pan {
      transition: transform 1.2s var(--ease-smooth);

      line {
        stroke: var(--dark-blue);
        stroke-width: 1.6;
      }

      path {
        fill: hsla(38, 90%, 55%, 0.9);
      }
    }
  }
}

.readout {
  gap: 1.6rem;
  display: flex;
  align-items: center;

  .side {
    gap: 0.2rem;
    display: flex;
    min-width: 10rem;
    text-align: center;
    align-items: center;
    flex-flow: column nowrap;
  }

  .side-label {
    border: none;
    padding: 0;
    font-size: 1.1rem;
  }

  .verdict {
    padding: 0.3rem 1.2rem;
  }

  &.balanced .verdict {
    color: hsla(145, 45%, 32%, 1);
    border-color: hsla(145, 45%, 32%, 0.4);
  }

  &.off .verdict {
    color: var(--hior-ange);
    border-color: hsla(9.8, 81.3%, 60.2%, 0.35);
  }
}

.waffle {
  gap: 1rem 2rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  justify-items: center;

  .block {
    max-width: 15rem;
  }

  // 2px surface gaps between unit squares (mark spec)
  .squares {
    gap: 0.2rem;
    display: flex;
    flex-wrap: wrap;
  }

  .square {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 0.2rem;
  }

  .legend {
    gap: 0.3rem;
    grid-column: 1 / -1;
    margin: 0;
    padding: 0;
    display: flex;
    list-style: none;
    flex-flow: column nowrap;
    font-size: 1.25rem;
    color: var(--dark-blue);

    li {
      gap: 0.6rem;
      display: flex;
      align-items: center;
    }

    .swatch {
      width: 1.1rem;
      height: 1.1rem;
      flex-shrink: 0;
      border-radius: 0.2rem;
    }
  }

  .unit {
    border: none;
    padding: 0;
    opacity: 0.65;
    grid-column: 1 / -1;
    font-size: 1.1rem;
  }
}

.pans {
  gap: 1.6rem;
  display: flex;
  align-items: center;
}

.pan-card {
  gap: 0.4rem;
  display: flex;
  min-width: 12rem;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
}

.side-label {
  padding: 0.2rem 1rem;
  font-size: 1.1rem;
}

.versus {
  font-size: 2.2rem;
}

.hint {
  opacity: 0.55;
  font-weight: normal;
}

footer {
  gap: 1.2rem;
  display: flex;
}
</style>
