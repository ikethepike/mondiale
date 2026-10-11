<template>
  <div
    v-if="rows.length"
    class="chronicle-reveal"
    :style="{ '--row-stagger': `${ROW_STAGGER_MS}ms` }"
  >
    <p class="record-head">
      <span class="eyebrow">History's order</span>
      <span v-if="known" class="tally">{{ rightCount }} of {{ rows.length }} in place</span>
    </p>

    <!-- The slots hold still while the chapters trade places through them, so
         the correction reads as re-dating rather than re-listing. -->
    <div
      ref="scroller"
      class="record scrollport"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <div class="record-grid">
        <ol class="slots" aria-hidden="true">
          <li v-for="slot in rows.length" :key="slot" class="slot">{{ slot }}</li>
        </ol>
        <TransitionGroup
          tag="ol"
          name="shuffle"
          class="chapters"
          aria-label="The record, earliest first"
        >
          <li
            v-for="row in shown"
            :key="row.slug"
            class="chapter"
            :class="{
              settled,
              right: settled && known && row.right,
              missed: settled && known && !row.right,
            }"
            :style="{ '--row-index': row.chosen }"
          >
            <button
              type="button"
              class="chapter-open"
              :aria-label="`${row.year}: read the story of ${row.name}`"
              @click="openDossier(row.slug)"
            >
              <img v-if="row.image" class="chapter-photo" :src="row.image" alt="" />
              <span v-else class="chapter-photo initial" aria-hidden="true">{{
                row.name.charAt(0)
              }}</span>
              <span class="chapter-body">
                <span class="chapter-year">{{ row.year }}</span>
                <span class="chapter-name">{{ row.name }}</span>
              </span>
              <span v-if="known" class="chapter-mark">
                {{ row.right ? '✓' : `was ${formatOrdinal(row.chosen + 1)}` }}
              </span>
            </button>
          </li>
        </TransitionGroup>
      </div>
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
      :missed="known && dossierRow ? !dossierRow.right : undefined"
    />
  </div>
</template>
<script lang="ts" setup>
import TimelineDossier from '~/components/challenge/TimelineDossier.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { chronicleSolution, chronicleSpanYears } from '~~/lib/chronicle'
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
const solution = computed(() => chronicleSolution(dealt.value))
const known = computed(() => props.order.length === solution.value.length)

const rows = computed(() =>
  solution.value.flatMap((slug, index) => {
    const event = timelineEvent(slug)
    if (!event) return []
    const chosen = known.value ? props.order.indexOf(slug) : index
    const right = props.order[index] === slug
    return [
      {
        slug,
        chosen,
        right,
        name: event.name,
        year: formatEventYear(event.year),
        image: event.image,
        placerLine: right
          ? 'You put it in its place.'
          : `You had it ${formatOrdinal(chosen + 1)} — it belongs ${formatOrdinal(index + 1)}.`,
      },
    ]
  })
)

const rightCount = computed(() => rows.value.filter(row => row.right).length)

/** Opens on the player's own order, then the misplaced chapters move. */
const { settled } = useRevealSettle(
  () => known.value && rightCount.value < rows.value.length,
  () => REVEAL_BEAT_MS + rows.value.length * ROW_STAGGER_MS
)
const shown = computed(() =>
  settled.value || !known.value ? rows.value : [...rows.value].sort((a, b) => a.chosen - b.chosen)
)

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
  --row-gap: 0.8rem;
  --slot-size: 2.8rem;

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

.record-grid {
  gap: 0 1rem;
  display: grid;
  grid-template-columns: var(--slot-size) minmax(0, 1fr);
}

.slots,
.chapters {
  gap: var(--row-gap);
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  grid-auto-rows: var(--row-height);
}

.slots {
  position: relative;

  &::before {
    content: '';
    top: calc(var(--row-height) / 2);
    bottom: calc(var(--row-height) / 2);
    left: calc(var(--slot-size) / 2 - 0.1rem);
    position: absolute;
    border-left: 0.2rem dashed ink(0.3);
  }
}

.slot {
  z-index: 1;
  display: grid;
  align-self: center;
  place-items: center;
  box-sizing: border-box;
  width: var(--slot-size);
  height: var(--slot-size);
  font-size: 1.3rem;
  font-weight: bold;
  border-radius: 50%;
  color: var(--dark-blue);
  background: milk(1);
  border: 0.2rem solid ink(0.45);
}

.shuffle-move {
  z-index: 1;
  transition: transform calc(var(--motion-slow) * 1.6) var(--ease-out-expressive);
}

.chapter {
  min-width: 0;
  position: relative;
}

// The entrance rides the button: a held keyframe transform on the <li> would
// override the inline transform the shuffle's FLIP move sets.
.chapter-open {
  all: unset;
  gap: 1.2rem;
  width: 100%;
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

  &:hover {
    box-shadow: 0 0.4rem 1.2rem ink(0.16);
  }

  &:focus-visible {
    outline: 0.2rem solid var(--soft-blue);
    outline-offset: 0.2rem;
  }

  .shuffle-move & {
    box-shadow: 0 0.8rem 1.6rem ink(0.25);
  }

  .right & {
    border-color: var(--soft-blue);
  }

  .missed & {
    border-color: flame(0.85);
    box-shadow: inset 0.4rem 0 0 flame(0.75);
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

  .missed & {
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
  font-size: 1.2rem;
  font-weight: bold;
  white-space: nowrap;
  color: var(--soft-blue);
  transition: opacity var(--motion-base);

  .right &,
  .missed & {
    opacity: 1;
  }

  .right & {
    font-size: 1.6rem;
  }

  .missed & {
    color: flame(0.9);
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
    --row-gap: 0.6rem;
    --slot-size: 2.4rem;
  }

  .record-grid {
    gap: 0 0.8rem;
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
