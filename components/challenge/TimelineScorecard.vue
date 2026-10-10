<template>
  <section class="pane-content ranking timeline-scorecard">
    <span class="eyebrow">
      {{ handLabel }}
      <span v-if="cards.length" class="count">
        {{ rightCount }} of {{ cards.length }} right first try
      </span>
    </span>

    <!-- Keyed by seat so flipping scorecards replays the shuffle instead of
         animating the previous seat's line backwards. -->
    <TransitionGroup
      ref="strip"
      :key="playerId"
      tag="ol"
      name="shuffle"
      class="strip"
      :class="{ 'fade-left': scrollableLeft, 'fade-right': scrollableRight }"
      :style="{ '--stop-stagger': `${STOP_STAGGER_MS}ms` }"
      aria-label="The finished line"
      @scroll.passive="syncScrollEdges"
    >
      <li
        v-for="item in stripItems"
        :key="item.key"
        :class="
          item.stop
            ? [
                'stop',
                item.stop.card ? 'mine' : 'other',
                { missed: settled && item.stop.card && !item.stop.card.correct },
              ]
            : 'ghost'
        "
        :style="item.stop ? { '--stop-index': item.stop.index } : undefined"
        :aria-label="item.stop ? undefined : `Card ${item.ghost} was filed here`"
      >
        <template v-if="!item.stop">
          <span class="marker">
            <span class="badge missed ghost-badge">{{ item.ghost }}</span>
          </span>
          <span class="stop-year">filed</span>
        </template>
        <button
          v-else
          type="button"
          class="stop-open"
          :aria-label="`${item.stop.year}: read the story of ${item.stop.name}`"
          @click="openDossier(item.stop.slug)"
        >
          <span class="marker">
            <template v-if="item.stop.card">
              <img
                v-if="item.stop.image"
                class="thumb"
                :src="item.stop.image"
                :alt="item.stop.name"
              />
              <span v-else class="thumb blank" aria-hidden="true" />
              <span class="badge" :class="{ missed: settled && !item.stop.card.correct }">
                {{ item.stop.card.number }}
              </span>
            </template>
            <span v-else class="dot" aria-hidden="true" />
          </span>
          <span class="stop-year">{{ item.stop.year }}</span>
          <span v-if="item.stop.card" class="stop-name">{{ item.stop.name }}</span>
        </button>
      </li>
    </TransitionGroup>

    <ol
      ref="list"
      class="cards"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncListEdges"
    >
      <li
        v-for="card in cards"
        :key="card.slug"
        class="card-row"
        :class="{ missed: !card.correct }"
        :style="{ '--row-index': card.number - 1 }"
      >
        <span class="badge mark" :class="{ missed: !card.correct }">{{ card.number }}</span>
        <img v-if="card.image" class="photo" :src="card.image" alt="" />
        <span v-else class="photo blank" aria-hidden="true" />

        <div class="body">
          <div class="head">
            <span class="year">{{ card.year }}</span>
            <!-- The name is the row's one control; its hit area stretches over
                 the whole row so the verdict and points stay readable text. -->
            <button type="button" class="name row-open" @click="openDossier(card.slug)">
              {{ card.name }}
            </button>
          </div>
          <ul class="country-chip-list place">
            <CountryChip v-if="card.country" compact :country="card.country" />
            <li class="kind">{{ card.kind }}</li>
          </ul>
          <p class="verdict">
            <span class="verdict-word">{{ card.verdictWord }}</span>
            <span class="verdict-line">· {{ card.verdictLine }}</span>
          </p>
        </div>

        <div class="tail">
          <strong class="pts">{{ card.correct ? `+${card.points}` : '0' }}</strong>
          <span class="worth-bar" aria-hidden="true">
            <span class="worth-fill" :style="{ width: `${card.worthShare * 100}%` }" />
          </span>
          <span class="worth">worth {{ card.worthLabel }}</span>
        </div>
      </li>
    </ol>

    <TimelineDossier
      v-model:open="dossierOpen"
      :slug="dossierSlug"
      :placer-line="dossierCard?.placerLine"
      :missed="dossierCard ? !dossierCard.correct : undefined"
    />
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import TimelineDossier from '~/components/challenge/TimelineDossier.vue'
import { getCountry } from '~~/lib/country'
import { prefersReducedMotion } from '~~/lib/motion'
import { REVEAL_BEAT_MS } from '~~/lib/round-beats'
import { seatLabel } from '~~/lib/player'
import {
  EVENT_KIND_COPY,
  formatEventYear,
  lineWhenPlayed,
  slotNeighbours,
  timelineCardPoints,
  timelineEvent,
} from '~~/lib/timeline'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

/** The timeline round's scorecard: one seat's hand, seen on the finished line
 *  and then card by card — year, verdict and what each card paid. */
const props = defineProps<{
  challenge: TimelineChallenge
  players: Record<string, Player>
  /** The seat this scorecard is about — the card flips between players. */
  playerId: string
  /** Who is READING it. Only this seat is ever called "You". */
  viewerId: string
}>()

const strip = ref<{ $el?: HTMLElement } | null>(null)
const { scrollableLeft, scrollableRight, syncScrollEdges } = useScrollEdges(() => strip.value?.$el)
const list = ref<HTMLElement>()
const {
  scrollableUp,
  scrollableDown,
  syncScrollEdges: syncListEdges,
} = useScrollEdges(() => list.value)

const state = computed(() => props.challenge.state)

const seatName = computed(() => seatLabel(props.players, props.playerId, props.viewerId))
const handLabel = computed(() =>
  seatName.value === 'You' ? 'Your Hand on the Line' : `${seatName.value}'s Hand on the Line`
)

const nameOf = (slug: string | undefined) => (slug ? (timelineEvent(slug)?.name ?? slug) : '')

/** Where a card belonged, told by the cards either side of its true slot. */
const belongedLine = (before: string | undefined, after: string | undefined): string => {
  if (before && after) return `it belonged between ${nameOf(before)} and ${nameOf(after)}`
  if (after) return `it belonged before ${nameOf(after)}`
  return `it belonged after ${nameOf(before)}`
}

const cards = computed(() => {
  const hand = timelineCardPoints(props.challenge, props.playerId)
  const mostWorth = Math.max(...hand.map(card => card.worth), 0)

  return hand.map(({ placement, worth, points }, index) => {
    const event = timelineEvent(placement.slug)
    const line = lineWhenPlayed(state.value, placement)
    const filed = slotNeighbours(line, placement.chosenSlot)
    const belonged = slotNeighbours(line, placement.correctSlot)
    const off = Math.abs(placement.chosenSlot - placement.correctSlot)
    const way = placement.chosenSlot < placement.correctSlot ? 'early' : 'late'

    const verdictWord = placement.correct
      ? 'Right first try'
      : placement.kind === 'timeout'
        ? 'Clock ran out'
        : `Filed ${off} ${off === 1 ? 'slot' : 'slots'} too ${way}`
    const verdictLine = placement.correct
      ? line.length === 1
        ? 'the line held one card'
        : `threaded into a line of ${line.length}`
      : belongedLine(belonged.before, belonged.after)

    return {
      slug: placement.slug,
      number: index + 1,
      correct: placement.correct,
      timedOut: placement.kind === 'timeout',
      filedAfter: filed.before,
      name: event?.name ?? placement.slug,
      year: formatEventYear(event?.year ?? 0),
      image: event?.image,
      kind: event ? EVENT_KIND_COPY[event.kind] : '',
      country: event ? getCountry(event.country) : undefined,
      points,
      worthLabel: `${Math.round(worth)} ${Math.round(worth) === 1 ? 'pt' : 'pts'}`,
      worthShare: mostWorth > 0 ? worth / mostWorth : 0,
      verdictWord,
      verdictLine,
      placerLine: placement.correct
        ? `${seatName.value} placed it right first try.`
        : `${verdictWord} — history corrected the filing.`,
    }
  })
})

const rightCount = computed(() => cards.value.filter(card => card.correct).length)

const stops = computed(() =>
  state.value.placed.map((slug, index) => {
    const event = timelineEvent(slug)
    return {
      slug,
      index,
      name: event?.name ?? slug,
      year: formatEventYear(event?.year ?? 0),
      image: event?.image,
      card: cards.value.find(card => card.slug === slug),
    }
  })
)

/** Cards the player filed in the wrong gap, with that gap on the finished
 *  line — just after the card they filed it behind. A timeout was never filed
 *  by the player, so it has no wrong gap to start from. */
const misfiled = computed(() =>
  cards.value
    .filter(card => !card.correct && !card.timedOut)
    .map(card => ({
      card,
      gap: card.filedAfter ? state.value.placed.indexOf(card.filedAfter) + 1 : 0,
    }))
)

const STOP_STAGGER_MS = 60

/** The line opens as the player filed it, then misfiled cards shuffle to
 *  where history put them and leave a ghost in the gap they came from. */
const settled = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined
const replayShuffle = () => {
  clearTimeout(settleTimer)
  settled.value = prefersReducedMotion() || !misfiled.value.length
  if (settled.value) return
  settleTimer = setTimeout(
    () => (settled.value = true),
    REVEAL_BEAT_MS + stops.value.length * STOP_STAGGER_MS
  )
}
onMounted(replayShuffle)
watch(() => props.playerId, replayShuffle)
onBeforeUnmount(() => clearTimeout(settleTimer))

const stripItems = computed(() => {
  const moved = new Set(misfiled.value.map(({ card }) => card.slug))
  const items: { key: string; stop?: (typeof stops.value)[number]; ghost?: number }[] = []
  const atGap = (gap: number) => {
    for (const { card } of misfiled.value.filter(entry => entry.gap === gap)) {
      const stop = stops.value.find(entry => entry.slug === card.slug)
      if (settled.value) items.push({ key: `ghost-${card.number}`, ghost: card.number })
      else if (stop) items.push({ key: card.slug, stop })
    }
  }
  stops.value.forEach((stop, index) => {
    atGap(index)
    if (settled.value || !moved.has(stop.slug)) items.push({ key: stop.slug, stop })
  })
  atGap(stops.value.length)
  return items
})

const dossierOpen = ref(false)
const dossierSlug = ref<string>()
const dossierCard = computed(() => cards.value.find(card => card.slug === dossierSlug.value))
const openDossier = (slug: string) => {
  dossierSlug.value = slug
  dossierOpen.value = true
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

.eyebrow {
  gap: 0.8rem;
  display: flex;
  align-items: baseline;
}

.count {
  opacity: 0.7;
  letter-spacing: 0;
  text-transform: none;
  color: var(--dark-blue);
}

.badge {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  font-size: 1.15rem;
  font-weight: bold;
  border-radius: 50%;
  color: var(--background-color);
  background: var(--dark-blue);
  border: 0.15rem solid var(--dark-blue);
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

// --- The finished line ---------------------------------------------------------
$marker: 4.2rem;
$strip-top: 1rem;

.strip {
  margin: 0 0 1.6rem;
  padding: $strip-top 1.6rem 0.6rem 1rem;
  display: flex;
  position: relative;
  list-style: none;
  align-items: flex-start;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  // `local` so the rule spans the scrolled width, not just the viewport.
  background: linear-gradient(ink(0.35), ink(0.35)) no-repeat local;
  background-size: 100% 0.1rem;
  background-position: 0 calc(#{$strip-top} + #{$marker} / 2);

  @include scroll-mask-x;

  &::-webkit-scrollbar {
    display: none;
  }
}

.stop,
.ghost {
  flex: none;
  display: flex;
  position: relative;
  flex-flow: column nowrap;
  align-items: center;
}

.shuffle-move {
  transition: transform calc(var(--motion-slow) * 1.6) var(--ease-out-expressive);
}

.stop.missed.shuffle-move {
  z-index: 1;

  .thumb {
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

.stop {
  &.mine {
    width: 8.4rem;
  }

  &.other {
    width: 5.2rem;
    opacity: 0.55;
  }
}

.ghost {
  width: 4.4rem;
}

// The entrance rides the button, not the <li>: a held keyframe transform on
// the item would override the inline transform the shuffle's FLIP move sets.
.stop-open {
  all: unset;
  gap: 0.35rem;
  width: 100%;
  display: flex;
  cursor: pointer;
  align-items: center;
  flex-flow: column nowrap;
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: calc(var(--stop-index) * var(--stop-stagger));

  &:focus-visible {
    outline: 0.2rem solid var(--soft-blue);
    outline-offset: 0.2rem;
    border-radius: 0.4rem;
  }
}

.marker {
  height: $marker;
  display: grid;
  position: relative;
  place-items: center;
}

.thumb {
  width: 5.6rem;
  height: $marker;
  display: block;
  object-fit: cover;
  border-radius: 0.4rem;
  border: 0.1rem solid var(--dark-blue);
  transition:
    border-color var(--motion-base),
    outline-color var(--motion-base),
    box-shadow var(--motion-base);

  &.blank {
    background: ink(0.08);
  }

  .missed & {
    border-color: flame(0.85);
    outline: 0.15rem solid flame(0.75);
    outline-offset: 0.1rem;
  }
}

.marker .badge:not(.ghost-badge) {
  top: -0.6rem;
  left: -0.9rem;
  position: absolute;
}

.dot {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: var(--dark-blue);
  box-shadow: 0 0 0 0.3rem var(--background-color);
}

.ghost-badge {
  border-style: dashed;
  box-shadow: 0 0 0 0.3rem var(--background-color);
}

.stop-year {
  line-height: 1;
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--dark-blue);
  font-variant-numeric: tabular-nums;

  .ghost & {
    font-weight: normal;
    font-style: italic;
    color: flame(0.9);
  }
}

.stop-name {
  overflow: hidden;
  display: -webkit-box;
  font-size: 1.05rem;
  line-height: 1.2;
  text-align: center;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--dark-blue);
  opacity: 0.75;
}

// --- Card by card -------------------------------------------------------------
.cards {
  margin: 0;
  padding: 0 1.6rem 0 0;
  list-style: none;
  max-height: min(32rem, calc(var(--viewport-height) * 0.36));
  overflow-y: auto;
  scrollbar-width: thin;
  border-top: 0.1rem solid $hairline;

  @include scroll-fade;
}

.card-row {
  gap: 1.4rem;
  display: grid;
  cursor: pointer;
  padding: 1.2rem 0;
  position: relative;
  align-items: flex-start;
  grid-template-columns: 2.8rem 6.4rem minmax(0, 1fr) 7.2rem;
  grid-template-areas: 'mark photo body tail';
  animation: row-land 0.4s both;
  animation-delay: calc(var(--row-index) * 0.08s);

  & + .card-row {
    border-top: 0.1rem solid $hairline;
  }

  &:has(.row-open:focus-visible) {
    outline: 0.2rem solid var(--soft-blue);
    outline-offset: -0.2rem;
    border-radius: 0.4rem;
  }
}

.row-open {
  all: unset;
  cursor: pointer;

  // Above the row's faded text: opacity < 1 opens a stacking context that
  // would otherwise paint over the stretched hit area.
  &::after {
    inset: 0;
    content: '';
    z-index: 1;
    position: absolute;
  }
}

.mark {
  width: 2.8rem;
  height: 2.8rem;
  grid-area: mark;
  font-size: 1.3rem;
}

.photo {
  width: 6.4rem;
  height: 4.6rem;
  display: block;
  grid-area: photo;
  object-fit: cover;
  border-radius: 0.4rem;

  &.blank {
    background: ink(0.08);
  }
}

.body {
  min-width: 0;
  display: block;
  grid-area: body;
}

.head {
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
}

.year {
  font-size: 1.4rem;
  font-weight: bold;
  color: var(--soft-blue);
  font-variant-numeric: tabular-nums;
}

.name {
  font-size: 1.8rem;
  font-weight: bold;
  line-height: 1.2;
}

.place {
  gap: 0.6rem;
  margin: 0.6rem 0 0;
  justify-content: flex-start;

  :deep(.country-chip) {
    border: 0.1rem solid ink(0.15);
    border-radius: 999px;
  }
}

.kind {
  opacity: 0.65;
  font-size: 1.2rem;
  align-self: center;
}

.verdict {
  gap: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  margin: 0.7rem 0 0;
  font-size: 1.3rem;
}

.verdict-word {
  font-weight: bold;
  color: var(--soft-blue);

  .missed & {
    color: flame(0.9);
  }
}

.verdict-line {
  opacity: 0.7;
}

.tail {
  gap: 0.4rem;
  display: flex;
  grid-area: tail;
  text-align: right;
  align-items: flex-end;
  flex-flow: column nowrap;
}

.pts {
  line-height: 1;
  font-size: 2.2rem;
  font-variant-numeric: tabular-nums;

  .missed & {
    opacity: 0.35;
  }
}

.worth-bar {
  width: 100%;
  height: 0.5rem;
  display: block;
  overflow: hidden;
  border-radius: 999px;
  background: ink(0.08);
}

.worth-fill {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: var(--soft-blue);
  animation: bar-grow 0.6s var(--ease-out-expressive) both;
  animation-delay: calc(var(--row-index) * 0.08s + 0.2s);
  transform-origin: left;

  .missed & {
    background: flame(0.45);
  }
}

.worth {
  opacity: 0.6;
  font-size: 1.1rem;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .stop-open,
  .card-row,
  .worth-fill {
    animation: none;
  }
}

@media screen and (max-width: $tablet) {
  .card-row {
    gap: 1rem;
    grid-template-columns: 2.4rem minmax(0, 1fr) 5.6rem;
    grid-template-areas: 'mark body tail';
  }

  .photo {
    display: none;
  }

  .mark {
    width: 2.4rem;
    height: 2.4rem;
  }

  .name {
    font-size: 1.6rem;
  }

  .stop.mine {
    width: 7.2rem;
  }

  .thumb {
    width: 4.8rem;
  }
}
</style>
