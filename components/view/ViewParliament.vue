<template>
  <section class="challenge-shell parliament">
    <ChallengePrompt :attributions="promptSources">
      <!-- The house's own name where the data has one (the Sejm, the Chamber
           of Deputies) — a bicameral country's lower house is worth naming,
           and the arc is only ever that house. -->
      <h1 class="map-caption">
        {{ heading }}
      </h1>
      <span class="map-caption sub">{{ prompt }}</span>
    </ChallengePrompt>

    <p v-if="challenge" class="chamber-facts">
      <span class="fact"
        ><strong>{{ challenge.totalSeats }}</strong> seats</span
      >
      <span class="fact"
        ><strong>{{ majority }}</strong> for a majority</span
      >
      <span class="fact"
        ><strong>{{ challenge.benches.length }}</strong> parties seated</span
      >
    </p>

    <div class="arc">
      <span
        v-for="(seat, index) in drawnSeats"
        :key="index"
        class="seat"
        :class="{ lit: !!seat.color }"
        :style="{
          left: `${seat.x}%`,
          top: `${seat.y}%`,
          '--seat-color': seat.color ?? '',
          '--seat-step': `${(seat.step ?? 0) * 12}ms`,
          '--sweep-delay': `${(drawnSeats.length - 1 - index) * 5}ms`,
        }"
      />

      <!-- One drop zone per asked bench, sitting over its own arc of seats. -->
      <Sortable
        v-for="zone in zones"
        :key="zone.name"
        :list="dropped[zone.name] ?? []"
        :options="DROP_TARGET_OPTIONS"
        item-key="name"
        class="zone"
        :data-name="zone.name"
        :class="{ filled: !!dropped[zone.name]?.length, wrong: missed[zone.name] }"
        :style="{ left: `${zone.x}%`, top: `${zone.y}%` }"
        @add="(event: SortableEvent) => drop(zone.name, event)"
      >
        <template #item="{ element }">
          <img v-if="element.logo" class="zone-logo" :src="element.logo" alt="" />
          <span v-else class="zone-swatch" :style="{ background: element.color }" />
        </template>
      </Sortable>

      <!-- The rest of the house, arriving once the player's own are placed:
           the chamber finishes itself in front of them. -->
      <TransitionGroup name="rest">
        <span
          v-for="(anchor, index) in restOfHouse"
          :key="anchor.name"
          class="rest-badge"
          :style="{
            left: `${anchor.x}%`,
            top: `${anchor.y}%`,
            '--rest-delay': `${400 + index * 140}ms`,
            '--bloc-color': drawn[anchor.name],
          }"
        >
          <img v-if="anchor.bench?.logo" class="rest-logo" :src="anchor.bench.logo" alt="" />
          <span v-else class="rest-name">{{ anchor.name }}</span>
        </span>
      </TransitionGroup>
    </div>

    <!-- The reveal IS the lesson: once the arc is answered, every bloc names
         itself with its share, left to right, so a player reads the whole
         chamber rather than only the four they were asked for. -->
    <TransitionGroup v-if="allPlaced" tag="ol" name="bloc" class="roll">
      <li
        v-for="(bench, index) in revealed"
        :key="bench.name"
        class="bloc"
        :style="{ '--bloc-delay': `${index * 70}ms`, '--bloc-color': bench.color }"
      >
        <img v-if="bench.logo" class="bloc-logo" :src="bench.logo" alt="" />
        <span v-else class="bloc-swatch" />
        <span class="bloc-name">{{ bench.name }}</span>
        <span class="bloc-seats"
          ><strong>{{ bench.seats }}</strong> · {{ Math.round(bench.share * 100) }}%</span
        >
        <span v-if="bench.grouping" class="bloc-family">{{ bench.grouping }}</span>
      </li>
    </TransitionGroup>

    <footer class="shell-footer">
      <p v-if="allPlaced" class="done">{{ correctCount }} of {{ asked.length }} placed</p>
      <Sortable
        v-else
        :key="trayKey"
        :list="unplaced"
        :options="DRAG_SOURCE_OPTIONS"
        item-key="name"
        class="tray"
      >
        <template #item="{ element }">
          <div class="bench draggable" :data-name="element.name">
            <img v-if="element.logo" class="bench-logo" :src="element.logo" alt="" />
            <span
              v-else
              class="bench-swatch"
              :style="{ background: hintLevel >= 2 ? element.color : 'transparent' }"
            />
            <span
              v-if="hintLevel >= 2 && element.logo"
              class="bench-tint"
              :style="{ background: element.color }"
            />
            <span v-if="hintLevel >= 3 && element.grouping" class="bench-fact">{{
              element.grouping
            }}</span>
            <span v-if="hintLevel >= 4" class="bench-fact">{{ element.name }}</span>
          </div>
        </template>
      </Sortable>
    </footer>
  </section>
</template>

<script lang="ts" setup>
/**
 * A chamber drawn as a hemicycle, its blocs unpainted. Drag each party onto
 * the arc of seats you believe is theirs; a correct drop paints and locks it.
 *
 * DELIBERATE break with `ViewComposition`, which colours its slices by depth
 * rather than hue "so the eye reads magnitude instead of hunting for a legend".
 * Here party colour IS the subject — it is the first rung of the hint ladder —
 * so the arc is painted in the parties' own colours.
 */
import { computed, ref } from 'vue'
import { Sortable } from 'sortablejs-vue3'
import type { SortableEvent } from 'sortablejs'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
import { DRAG_SOURCE_OPTIONS, DROP_TARGET_OPTIONS } from '~~/lib/drag-list'
import { benchColors, seatDots, type ParliamentDeal } from '~~/lib/parliament'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

const { challenge, submitted, submitOnce, elapsedFraction } =
  useGroupChallenge('parliament-challenge')

/** Bench name → the bench dropped on it (one each). */
const dropped = ref<
  Record<string, { name: string; logo?: string; color?: string; correct?: boolean }[]>
>({})
/** Bumped on every drop so Vue rebuilds the tray from our own list rather
 *  than reusing the nodes SortableJS moved. */
const trayKey = ref(0)
/** Zones a wrong bench landed on, so the miss is visible before it clears. */
const missed = ref<Record<string, boolean>>({})

const deal = computed(
  () =>
    ({
      country: challenge.value?.country,
      benches: challenge.value?.benches ?? [],
      totalSeats: challenge.value?.totalSeats ?? 0,
    }) as ParliamentDeal
)

const asked = computed(() => deal.value.benches.filter(bench => bench.asked))
const placedNames = computed(() =>
  Object.keys(dropped.value).filter(zone => dropped.value[zone]?.length)
)
const unplaced = computed(() =>
  asked.value.filter(bench => !placedNames.value.includes(bench.name))
)
const allPlaced = computed(
  () => submitted.value || (!!asked.value.length && !unplaced.value.length)
)
/** Only the RIGHT placements score — a filled zone is not a correct one. */
const correctNames = computed(() =>
  Object.values(dropped.value)
    .flat()
    .filter(entry => entry.correct)
    .map(entry => entry.name)
)
const correctCount = computed(() => correctNames.value.length)

/**
 * Isaac's ladder, on the round's own clock. Colour leads because it is the
 * better-covered field — a chamber often has colours for benches whose logos
 * we never found — and the grouping teaches the transnational family before
 * the name gives the answer away.
 *
 *   1 seats only        2 colour           3 grouping         4 the name
 */
const hintLevel = computed(() => {
  const elapsed = elapsedFraction.value
  if (elapsed > 0.75) return 4
  if (elapsed > 0.5) return 3
  if (elapsed > 0.25) return 2
  return 1
})

/** Neighbouring blocs wear near-identical colours (Sweden's V and S are ΔE 8
 *  apart); this is the separated palette, so the arc shows the boundary. */
const drawn = computed(() => benchColors(deal.value))

/** An empty seat between blocs, so two adjacent parties never read as one
 *  block — the same device a printed hemicycle uses. */
const BLOC_GAP_SEATS = 1

/** Seats in reading order, each carrying its bench's colour once earned. */
const seats = computed(() => {
  const dots = seatDots(deal.value)
  const gaps = Math.max(0, dots.length - 1) * BLOC_GAP_SEATS
  const positions = hemicycleSeats(dots.reduce((total, bench) => total + bench.dots, 0) + gaps)
  const painted: {
    x: number
    y: number
    color?: string
    spacer?: boolean
    /** Position within its own bloc — the stagger for the fill sweep. */
    step?: number
  }[] = []
  let cursor = 0
  for (const [index, bench] of dots.entries()) {
    const entry = deal.value.benches.find(candidate => candidate.name === bench.name)
    // Unasked benches are context and paint from the start; an asked one stays
    // blank until it is placed, or until the colour rung unlocks.
    const show =
      entry && (!entry.asked || placedNames.value.includes(entry.name) || hintLevel.value >= 2)
    for (let seat = 0; seat < bench.dots && cursor < positions.length; seat += 1, cursor += 1) {
      painted.push({
        x: positions[cursor]!.x,
        y: positions[cursor]!.y,
        step: seat,
        ...(show && drawn.value[bench.name] ? { color: drawn.value[bench.name] } : {}),
      })
    }
    // The gap belongs BETWEEN blocs, never after the last one.
    if (index < dots.length - 1) {
      for (let gap = 0; gap < BLOC_GAP_SEATS && cursor < positions.length; gap += 1, cursor += 1) {
        painted.push({ x: positions[cursor]!.x, y: positions[cursor]!.y, spacer: true })
      }
    }
  }
  return painted
})

/**
 * The seats actually drawn — spacers hold a slot in the arc but are never
 * rendered.
 *
 * Each dot carries its position WITHIN its own bloc, which is what lets a
 * correct drop sweep across its benches one seat at a time rather than
 * flooding them all at once: the colour arrives the way a result comes in.
 */
const drawnSeats = computed(() => seats.value.filter(seat => !seat.spacer))

/**
 * Where each bench sits on the arc — the centre of its own run of seats.
 *
 * Asked benches use it as a drop zone; the rest use it as the spot their badge
 * fades into once the round is answered, so the chamber completes itself in
 * front of the player rather than only in a list underneath.
 */
const anchors = computed(() => {
  const dots = seatDots(deal.value)
  const gaps = Math.max(0, dots.length - 1) * BLOC_GAP_SEATS
  const positions = hemicycleSeats(dots.reduce((total, bench) => total + bench.dots, 0) + gaps)
  const out: { name: string; x: number; y: number; asked: boolean }[] = []
  let cursor = 0
  for (const [index, bench] of dots.entries()) {
    const entry = deal.value.benches.find(candidate => candidate.name === bench.name)
    const run = positions.slice(cursor, cursor + bench.dots)
    // Advance past this bloc AND the gap that follows it, so the next bloc's
    // anchor lands on its own seats rather than drifting left.
    cursor += bench.dots + (index < dots.length - 1 ? BLOC_GAP_SEATS : 0)
    if (!entry || !run.length) continue
    out.push({
      name: bench.name,
      asked: entry.asked,
      x: run.reduce((sum, seat) => sum + seat.x, 0) / run.length,
      y: run.reduce((sum, seat) => sum + seat.y, 0) / run.length,
    })
  }
  return out
})

const zones = computed(() => anchors.value.filter(anchor => anchor.asked))

/** The benches nobody was asked for, revealed once the arc is answered. */
const restOfHouse = computed(() =>
  allPlaced.value
    ? anchors.value
        .filter(anchor => !anchor.asked)
        .map(anchor => ({
          ...anchor,
          bench: deal.value.benches.find(bench => bench.name === anchor.name),
        }))
    : []
)

const drop = (zone: string, event: SortableEvent) => {
  const name = (event.item as HTMLElement).dataset.name
  // SortableJS moved the real node into the zone. Vue owns both lists, so the
  // node is dropped and the state below is what re-renders them — leaving it
  // in place would show a bench that our own list says is still in the tray.
  event.item.remove()
  // Re-key the tray so Vue rebuilds it from `unplaced` rather than reusing the
  // nodes SortableJS mutated; without this a missed bench never comes back.
  trayKey.value += 1
  if (!name) return

  // A drop is FINAL, right or wrong. Bouncing a miss back to the tray made
  // the round unloseable: every zone could be tried in turn until it stuck, so
  // the score was always full marks and no placement was a decision.
  const bench = asked.value.find(candidate => candidate.name === name)
  dropped.value = {
    ...dropped.value,
    [zone]: [{ name, logo: bench?.logo, color: bench?.color, correct: name === zone }],
  }

  if (name !== zone) {
    missed.value = { ...missed.value, [zone]: true }
    setTimeout(() => {
      missed.value = { ...missed.value, [zone]: false }
    }, 700)
  }

  if (!unplaced.value.length) submit()
}

const submit = () => {
  if (!challenge.value) return
  // The answer is which benches landed, not a country — `ranking` carries the
  // chamber so the reveal knows what to paint, and `parliament` carries the
  // placements the server re-grades.
  submitOnce([challenge.value.country], undefined, undefined, {
    parliament: { placed: correctNames.value },
  })
}

/**
 * Every bloc, in seating order, once the round is answered — the reveal shows
 * the WHOLE chamber, not just the benches the player was asked to place, so
 * the parties nobody had to name are still learned.
 */
const revealed = computed(() =>
  allPlaced.value
    ? deal.value.benches.map(bench => ({ ...bench, color: drawn.value[bench.name] }))
    : []
)

/** The house by name where we have one, else the country's parliament. */
const heading = computed(() => {
  if (!challenge.value) return ''
  const country = countryName(challenge.value.country)
  return challenge.value.chamber
    ? `${country}: the ${challenge.value.chamber}`
    : `${country}'s parliament`
})

/** What it takes to govern — the number the whole picture is really about. */
const majority = computed(() => Math.floor((challenge.value?.totalSeats ?? 0) / 2) + 1)

const promptSources = computed(() => [
  ...datasetAttribution('elections'),
  ...datasetAttribution('parties'),
])

const HINT_LABELS = ['', 'seats only', 'colours showing', 'groupings showing', 'names showing']

const prompt = computed(() =>
  allPlaced.value
    ? `${deal.value.totalSeats} seats`
    : `Drag each party onto its benches — ${unplaced.value.length} left · ${HINT_LABELS[hintLevel.value]}`
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

/* The unasked blocs, fading onto their own seats after the player's four. */
.rest-badge {
  position: absolute;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  padding: 0.3rem 0.5rem;
  border-radius: $cardRadius;
  background: #{milk(0.9)};
  border-bottom: 3px solid var(--bloc-color, #{ink(0.2)});
  pointer-events: none;
}

.rest-enter-active {
  animation: chip-in var(--motion-slow) var(--ease-out-expressive) backwards;
  animation-delay: var(--rest-delay, 0ms);
}

.rest-logo {
  width: 3rem;
  height: 2rem;
  object-fit: contain;
}

.rest-name {
  max-width: 6rem;
  font-size: 0.7rem;
  line-height: 1.1;
  text-align: center;
}

/* The reveal roll: every bloc, left to right, arriving in seating order. */
.roll {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  width: min(52rem, 94vw);
  margin: 0 auto;
  padding: 0;
  list-style: none;
  pointer-events: auto;
}

.bloc {
  @include caption-surface($cardRadius);

  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: 'logo name' 'logo seats' 'logo family';
  align-items: center;
  gap: 0 0.6rem;
  min-width: 11rem;
  padding: 0.5rem 0.75rem;
  // The bloc's own colour, as the edge that ties the row to its seats.
  border-left: 4px solid var(--bloc-color, #{ink(0.2)});
}

.bloc-enter-active {
  animation: chip-in var(--motion-slow) var(--ease-out-expressive) backwards;
  animation-delay: var(--bloc-delay, 0ms);
}

.bloc-logo,
.bloc-swatch {
  grid-area: logo;
  width: 3rem;
  height: 2.25rem;
  object-fit: contain;
}

.bloc-swatch {
  border-radius: 0.25rem;
  background: var(--bloc-color, #{ink(0.2)});
}

.bloc-name {
  grid-area: name;
  font-weight: 600;
  line-height: 1.15;
}

.bloc-seats {
  grid-area: seats;
  font-variant-numeric: tabular-nums;
}

.bloc-family {
  grid-area: family;
  font-size: 0.72rem;
  opacity: 0.7;
}

.chamber-facts {
  @include caption-surface($cardRadius);

  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.5rem;
  justify-content: center;
  width: fit-content;
  margin: 0 auto;
  padding: 0.5rem 1.25rem;
  pointer-events: auto;

  strong {
    font-variant-numeric: tabular-nums;
  }
}

.fact {
  white-space: nowrap;
}

.arc {
  position: relative;
  width: min(46rem, 92vw);
  aspect-ratio: 2 / 1;
  margin: 0 auto;
  pointer-events: none;
}

.seat {
  position: absolute;
  width: 1.6%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--seat-color, transparent);
  border: 1px solid #{ink(0.25)};
  transform: translate(-50%, -50%) scale(1);
  // The chamber sweeps in from the right on arrival, one seat behind the next.
  animation: seat-sweep var(--motion-base) var(--ease-out-expressive) backwards;
  animation-delay: var(--sweep-delay, 0ms);
  // Colour arrives on the clock (the hint ladder) or on a correct drop, so it
  // eases in rather than switching; the scale is what makes a bloc read as
  // LANDING on its benches instead of the row simply changing colour.
  // Staggered by the seat's place in its bloc, so a correct drop SWEEPS
  // across its benches rather than flooding them at once.
  transition:
    background var(--motion-base) var(--ease-out) var(--seat-step, 0ms),
    border-color var(--motion-base) var(--ease-out) var(--seat-step, 0ms),
    transform var(--motion-base) var(--ease-out-expressive) var(--seat-step, 0ms);

  &.lit {
    border-color: transparent;
    transform: translate(-50%, -50%) scale(1.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .seat {
    animation: fade-in var(--motion-base) linear backwards;
    transition: background var(--motion-base) linear;

    &.lit {
      transform: translate(-50%, -50%);
    }
  }

  .bloc-enter-active {
    animation: fade-in var(--motion-base) linear backwards;
  }
}

.zone {
  position: absolute;
  display: grid;
  place-items: center;
  width: 6.5rem;
  height: 4.75rem;
  transform: translate(-50%, -50%);
  border: 2px dashed #{ink(0.3)};
  border-radius: $cardRadius;
  background: #{milk(0.55)};
  pointer-events: auto;
  transition: border-color var(--motion-fast) var(--ease-out);

  &.filled {
    border-style: solid;
    border-color: transparent;
    background: transparent;
  }

  &.wrong {
    border-color: #{flame()};
  }
}

.zone-logo {
  width: 5rem;
  height: 3.5rem;
  object-fit: contain;
}

.zone-swatch {
  width: 3rem;
  height: 3rem;
  border-radius: 0.35rem;
}

.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  padding: 0;
  margin: 0;
  list-style: none;
  pointer-events: auto;
}

.bench {
  @include caption-surface($cardRadius);

  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  // Big enough to read the iconography AND to grab with a thumb.
  width: 8rem;
  padding: 0.6rem;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.bench-logo {
  width: 100%;
  height: 3.5rem;
  object-fit: contain;
}

.bench-swatch,
.bench-tint {
  width: 100%;
  height: 0.4rem;
  border-radius: 0.2rem;
}

.bench-swatch {
  height: 3.5rem;
  border-radius: 0.35rem;
}

.bench-fact {
  font-size: 0.75rem;
  text-align: center;
  line-height: 1.2;
}

.done {
  text-align: center;
}
</style>
