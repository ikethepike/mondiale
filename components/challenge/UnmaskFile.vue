<template>
  <article class="unmask-file" :class="{ compact }">
    <header class="file-head">
      <span class="eyebrow">Case file</span>
      <span v-if="!revealed" class="bounty" :aria-label="`Worth ${bounty} points now`">
        <Transition name="bounty" mode="out-in">
          <strong :key="bounty">{{ bounty }}</strong>
        </Transition>
        <span class="unit">pts now</span>
      </span>
    </header>

    <div class="file-body">
      <UnmaskMosaic class="mosaic" :tiers="tiers" :photo="photo" :photo-label="photoLabel" />
      <ol class="rungs">
        <li
          v-for="row in visibleRows"
          :key="row.index"
          class="rung"
          :class="{ open: row.open, fresh: row.index === newest }"
        >
          <span class="label">{{ row.label }}</span>
          <span v-if="!row.open" class="redaction" aria-label="Redacted" />
          <img v-else-if="row.logo" class="logo" :src="row.logo" alt="The governing party's mark" />
          <span v-else class="line">{{ row.line }}</span>
        </li>
      </ol>
    </div>

    <footer class="file-foot">
      <ol class="pips" :aria-label="`Rung ${shown} of ${rungs.length}`">
        <li v-for="(rung, index) in rungs" :key="index" :class="{ lit: index < shown }" />
      </ol>
      <span class="suspects"> {{ suspects }} {{ suspects === 1 ? 'suspect' : 'suspects' }} </span>
    </footer>
  </article>
</template>
<script lang="ts" setup>
import UnmaskMosaic from '~/components/challenge/UnmaskMosaic.vue'
import { UNMASK_RUNG_LABELS, unmaskClueLine } from '~~/lib/unmask'
import type { UnmaskClue, UnmaskRungKind } from '~~/types/challenges/group-modes.type'

/** The case file: the portrait mosaic and a redacted row per fact, each one
 *  peeling open as its rung lands. */
const props = defineProps<{
  rungs: UnmaskRungKind[]
  clues: UnmaskClue[]
  bounty: number
  suspects: number
  revealed?: boolean
  photo?: string
  photoLabel?: string
  /** Phone: only the rows already open and the next one down. */
  compact?: boolean
}>()

const shown = computed(() => props.clues.length)
const newest = computed(() => shown.value - 1)

const tiers = computed(() =>
  props.clues.flatMap(clue =>
    clue.kind === 'portrait' ? [{ size: clue.size, pixels: clue.pixels }] : []
  )
)

const rows = computed(() =>
  props.rungs.flatMap((kind, index) => {
    if (kind === 'portrait') return []
    const clue = props.clues[index]
    const printed = clue ? unmaskClueLine(clue) : undefined
    return [
      {
        index,
        open: !!clue,
        label: printed?.label ?? UNMASK_RUNG_LABELS[kind],
        line: printed?.line,
        logo: clue?.kind === 'logo' ? clue.logo : undefined,
      },
    ]
  })
)

const visibleRows = computed(() => {
  if (!props.compact || props.revealed) return rows.value
  const open = rows.value.filter(row => row.open)
  const next = rows.value.find(row => !row.open)
  return [...open.slice(-2), ...(next ? [next] : [])]
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.unmask-file {
  @include caption-surface($cardRadius);
  display: grid;
  gap: 1rem;
  width: clamp(26rem, 28vw, 34rem);
  padding: 1.4rem 1.6rem 1.2rem;
  text-align: left;
  color: var(--dark-blue);
  background: milk(0.94);
  box-shadow: 0 1rem 3rem ink(0.18);
}

.file-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;

  .eyebrow {
    margin: 0;
  }
}

.bounty {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;

  strong {
    display: inline-block;
    font-size: 2.4rem;
    font-variant-numeric: tabular-nums;
  }

  .unit {
    font-size: 1.1rem;
    opacity: 0.6;
  }
}

.bounty-enter-active,
.bounty-leave-active {
  transition:
    opacity var(--motion-quick) var(--ease-smooth),
    translate var(--motion-base) var(--ease-out-expressive);
}

.bounty-leave-to {
  opacity: 0;
  translate: 0 0.8rem;
}

.bounty-enter-from {
  opacity: 0;
  translate: 0 -0.8rem;
}

.file-body {
  display: grid;
  gap: 1.2rem;
}

.rungs {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
  list-style: none;
}

.rung {
  display: grid;
  min-height: 2.4rem;
  align-items: center;
  column-gap: 1rem;
  grid-template-columns: 8.4rem 1fr;

  .label {
    font-size: 1.1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.55;
  }

  .line {
    font-size: 1.5rem;
    line-height: 1.25;
  }

  .logo {
    max-width: 9rem;
    max-height: 3.2rem;
    object-fit: contain;
    justify-self: start;
  }
}

.redaction {
  height: 1.2rem;
  border-radius: 0.2rem;
  background: ink(0.88);
  width: 100%;

  .rung:nth-child(3n + 1) & {
    width: 72%;
  }

  .rung:nth-child(3n + 2) & {
    width: 88%;
  }
}

// The bar lifts off as the rung lands: the line underneath slides in from
// where the ink stood.
.rung.fresh.open {
  .line,
  .logo {
    animation: rung-peel var(--motion-slow) var(--ease-out-expressive) both;
  }
}

@keyframes rung-peel {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
}

.file-foot {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
}

.pips {
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.4rem;
  list-style: none;

  li {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 0.1rem solid ink(0.4);
    transition: background var(--motion-base) var(--ease-smooth);

    &.lit {
      background: ink(0.8);
      border-color: transparent;
    }
  }
}

.suspects {
  font-size: 1.2rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

// Phone: the mosaic sits beside the rows, the card spans the column.
.compact {
  width: 100%;
  padding: 1rem 1.2rem;
  gap: 0.6rem;

  .file-body {
    gap: 1rem;
    align-items: center;
    grid-template-columns: 9rem 1fr;
  }

  .rung {
    grid-template-columns: 6.4rem 1fr;
    min-height: 2rem;

    .line {
      font-size: 1.3rem;
    }
  }

  .bounty strong {
    font-size: 1.9rem;
  }
}
</style>
