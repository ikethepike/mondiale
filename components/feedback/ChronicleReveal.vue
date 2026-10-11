<template>
  <div
    v-if="rows.length"
    class="chronicle-reveal"
    :style="{ '--row-stagger': `${ROW_STAGGER_MS}ms` }"
  >
    <p class="record-head">
      <span class="eyebrow">History's order</span>
      <span v-if="known" class="tally">{{ keptCount }} of {{ rows.length }} kept in order</span>
    </p>

    <div
      ref="scroller"
      class="record scrollport"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <TransitionGroup tag="ol" name="shuffle" class="chapters" aria-label="The record">
        <li
          v-for="item in items"
          :key="item.key"
          :class="
            item.ghost
              ? 'ghost'
              : [
                  'chapter',
                  {
                    settled,
                    kept: settled && known && !item.row.moved,
                    moved: settled && item.row.moved,
                  },
                ]
          "
          :style="item.ghost ? undefined : { '--row-index': item.row.number - 1 }"
          :aria-label="item.ghost ? `Card ${item.row.number} was filed here` : undefined"
        >
          <template v-if="item.ghost">
            <span class="badge missed ghost-badge">{{ item.row.number }}</span>
            <span class="ghost-label">filed here</span>
          </template>
          <template v-else>
            <span class="badge" :class="{ missed: settled && item.row.moved }">
              {{ item.row.number }}
            </span>
            <button
              type="button"
              class="chapter-open"
              :aria-label="`${item.row.year}: read the story of ${item.row.name}`"
              @click="openDossier(item.row.slug)"
            >
              <img v-if="item.row.image" class="chapter-photo" :src="item.row.image" alt="" />
              <span v-else class="chapter-photo initial" aria-hidden="true">{{
                item.row.name.charAt(0)
              }}</span>
              <span class="chapter-body">
                <span class="chapter-year">{{ item.row.year }}</span>
                <span class="chapter-name">{{ item.row.name }}</span>
              </span>
              <span v-if="known && !item.row.moved" class="chapter-mark" aria-hidden="true">
                ✓
              </span>
            </button>
          </template>
        </li>
      </TransitionGroup>
    </div>

    <p class="span-line">
      <span>{{ formatNumber(spanYears) }} years of {{ countryName(challenge.country) }}</span>
      <span class="read-hint">· tap a chapter for its story</span>
      <SourceInfo :attributions="sources" label="Sources" />
    </p>

    <TimelineDossier
      v-model:open="dossierOpen"
      :slug="dossierSlug"
      :placer-line="dossierRow?.placerLine"
      :missed="dossierRow?.moved"
    />
  </div>
</template>
<script lang="ts" setup>
import TimelineDossier from '~/components/challenge/TimelineDossier.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { chronicleKeptInOrder, chronicleSolution, chronicleSpanYears } from '~~/lib/chronicle'
import { countryName } from '~~/lib/country'
import { formatNumber, formatOrdinal } from '~~/lib/number'
import { REVEAL_BEAT_MS } from '~~/lib/round-beats'
import { formatEventYear, timelineEvent } from '~~/lib/timeline'
import { useRevealSettle } from '~~/lib/use-reveal-settle'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{
  challenge: IndividualChallenge
  /** The order the player locked in, from the gate's shared ledger — empty
   *  for a seat that never answered here (the booth). */
  order: string[]
}>()

const ROW_STAGGER_MS = 90

const dealt = computed(() => props.challenge.chronicle?.events ?? [])
// The truth comes from the SAME module that graded the submit — the record
// shown and the verdict scored cannot disagree.
const solution = computed(() =>
  chronicleSolution(dealt.value).filter(slug => !!timelineEvent(slug))
)
const known = computed(
  () =>
    props.order.length === solution.value.length &&
    solution.value.every(slug => props.order.includes(slug))
)
const kept = computed(() =>
  known.value ? chronicleKeptInOrder(props.order) : new Set(solution.value)
)

const rows = computed(() =>
  solution.value.map((slug, index) => {
    const event = timelineEvent(slug)!
    const filed = known.value ? props.order.indexOf(slug) : index
    const moved = !kept.value.has(slug)
    return {
      slug,
      moved,
      number: filed + 1,
      name: event.name,
      year: formatEventYear(event.year),
      image: event.image,
      placerLine: moved
        ? `You filed it ${formatOrdinal(filed + 1)} — history puts it ${formatOrdinal(index + 1)}.`
        : 'You had it in order.',
    }
  })
)
type Row = (typeof rows.value)[number]

const keptCount = computed(() => rows.value.filter(row => !row.moved).length)

/** Each moved card's gap on the finished line: just after the nearest kept
 *  card the player filed ahead of it. */
const gapOf = (slug: string): number => {
  for (let at = props.order.indexOf(slug) - 1; at >= 0; at--) {
    const before = props.order[at]
    if (kept.value.has(before)) return solution.value.indexOf(before) + 1
  }
  return 0
}

/** The line opens as the player filed it, then the moved cards lift out to
 *  where history put them and leave a ghost in the gap they came from. */
const { settled } = useRevealSettle(
  () => keptCount.value < rows.value.length,
  () => REVEAL_BEAT_MS + rows.value.length * ROW_STAGGER_MS
)

const items = computed(() => {
  const moved = props.order
    .map(slug => rows.value.find(row => row.slug === slug))
    .filter((row): row is Row => !!row?.moved)
    .map(row => ({ row, gap: gapOf(row.slug) }))
  const items: { key: string; row: Row; ghost?: true }[] = []
  const atGap = (gap: number) => {
    for (const entry of moved.filter(candidate => candidate.gap === gap)) {
      items.push(
        settled.value
          ? { key: `ghost-${entry.row.slug}`, row: entry.row, ghost: true }
          : { key: entry.row.slug, row: entry.row }
      )
    }
  }
  rows.value.forEach((row, index) => {
    atGap(index)
    if (settled.value || !row.moved) items.push({ key: row.slug, row })
  })
  atGap(rows.value.length)
  return items
})

const spanYears = computed(() => chronicleSpanYears(dealt.value))
const sources = datasetAttribution('events')

const scroller = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => scroller.value)

const dossierOpen = ref(false)
const dossierSlug = ref<string>()
const dossierRow = computed(() => rows.value.find(row => row.slug === dossierSlug.value))
const openDossier = (slug: string) => {
  dossierSlug.value = slug
  dossierOpen.value = true
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

.chronicle-reveal {
  --row-height: 6.4rem;
  --ghost-height: 3.2rem;
  --row-gap: 0.8rem;
  --badge-size: 2.6rem;

  gap: 1rem;
  width: min(48rem, 100%);
  margin-inline: auto;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;
}

.record-head {
  gap: 1rem;
  margin: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.tally {
  font-size: 1.3rem;
  font-weight: bold;
  color: var(--soft-blue);
  font-variant-numeric: tabular-nums;
}

.record {
  max-height: calc(var(--viewport-height) - 26rem);
  min-height: calc(var(--row-height) * 2);
  overflow-y: auto;
  overscroll-behavior: contain;

  @include scroll-fade($top: 1.6rem, $bottom: 2.4rem);
}

.chapters {
  gap: var(--row-gap);
  margin: 0;
  padding: 0.2rem 0.4rem 0.4rem 0;
  display: flex;
  position: relative;
  list-style: none;
  flex-flow: column nowrap;

  // The rail the badges hang on; it holds still while the cards move.
  &::before {
    content: '';
    top: calc(var(--row-height) / 2);
    bottom: calc(var(--row-height) / 2);
    left: calc(var(--badge-size) / 2 - 0.1rem);
    position: absolute;
    border-left: 0.2rem dashed ink(0.3);
  }
}

.chapter,
.ghost {
  gap: 1rem;
  flex: none;
  display: flex;
  min-width: 0;
  position: relative;
  align-items: center;
}

.chapter {
  height: var(--row-height);
}

.ghost {
  height: var(--ghost-height);
}

.badge {
  flex: none;
  z-index: 1;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--badge-size);
  height: var(--badge-size);
  font-size: 1.2rem;
  font-weight: bold;
  border-radius: 50%;
  color: var(--background-color);
  background: var(--dark-blue);
  border: 0.15rem solid var(--dark-blue);
  box-shadow: 0 0 0 0.3rem var(--background-color);
  transition:
    color var(--motion-base),
    background-color var(--motion-base),
    border-color var(--motion-base);

  &.missed {
    color: flame(0.95);
    background: var(--background-color);
    border-color: flame(0.85);
  }
}

.ghost-badge {
  border-style: dashed;
}

.ghost-label {
  font-size: 1.2rem;
  font-style: italic;
  color: flame(0.9);
}

.shuffle-move {
  transition: transform calc(var(--motion-slow) * 1.6) var(--ease-out-expressive);
}

.chapter.moved.shuffle-move {
  z-index: 2;

  .chapter-open {
    box-shadow: 0 0.8rem 1.6rem ink(0.25);
  }
}

.shuffle-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-smooth),
    transform var(--motion-base) var(--ease-out-expressive);
  transition-delay: var(--motion-slow);
}

.shuffle-enter-from {
  opacity: 0;
  transform: scale(0.6);
}

// The entrance rides the button: a held keyframe transform on the <li> would
// override the inline transform the shuffle's FLIP move sets.
.chapter-open {
  all: unset;
  gap: 1.2rem;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
  align-items: center;
  border-radius: 1rem;
  background: milk(0.94);
  border: 0.1rem solid ink(0.25);
  box-shadow: 0 0.2rem 0.6rem ink(0.08);
  transition:
    border-color var(--motion-base),
    box-shadow var(--motion-base);
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: calc(var(--row-index) * var(--row-stagger));

  // A reorder re-inserts the node, which would replay the entrance mid-move.
  .settled & {
    animation: none;
  }

  &:hover {
    box-shadow: 0 0.4rem 1.2rem ink(0.16);
  }

  &:focus-visible {
    outline: 0.2rem solid var(--soft-blue);
    outline-offset: 0.2rem;
  }

  .kept & {
    border-color: var(--soft-blue);
  }

  .moved & {
    border-color: flame(0.85);
    outline: 0.15rem solid flame(0.75);
    outline-offset: 0.1rem;
  }
}

.chapter-photo {
  flex: none;
  width: 8.4rem;
  height: 100%;
  object-fit: cover;
  border-right: 0.1rem solid ink(0.18);

  &.initial {
    display: grid;
    place-items: center;
    font-size: 3rem;
    font-family: 'Lusitana', serif;
    color: var(--dark-blue);
    background: ink(0.07);
  }
}

.chapter-body {
  gap: 0.2rem;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}

.chapter-year {
  opacity: 0;
  line-height: 1;
  font-size: 1.4rem;
  font-weight: bold;
  color: var(--soft-blue);
  font-variant-numeric: tabular-nums;
  transition: opacity var(--motion-base);

  .settled & {
    opacity: 1;
  }

  .moved & {
    color: flame(0.9);
  }
}

.chapter-name {
  overflow: hidden;
  display: -webkit-box;
  font-size: 1.5rem;
  line-height: 1.25;
  color: var(--dark-blue);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.chapter-mark {
  flex: none;
  opacity: 0;
  margin-right: 1.2rem;
  font-size: 1.6rem;
  font-weight: bold;
  color: var(--soft-blue);
  transition: opacity var(--motion-base);

  .kept & {
    opacity: 1;
  }
}

.span-line {
  gap: 0.4rem 0.6rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  color: var(--soft-blue);
}

.read-hint {
  opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
  .chapter-open {
    animation: none;
  }
}

@media screen and (max-width: $tablet) {
  .chronicle-reveal {
    --row-height: 5.2rem;
    --ghost-height: 2.8rem;
    --row-gap: 0.6rem;
    --badge-size: 2.4rem;
  }

  .chapter,
  .ghost {
    gap: 0.8rem;
  }

  .chapter-open {
    gap: 0.9rem;
  }

  .chapter-photo {
    width: 6rem;
  }

  .chapter-name {
    font-size: 1.35rem;
  }

  .chapter-mark {
    margin-right: 0.9rem;
  }
}
</style>
