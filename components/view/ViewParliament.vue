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
        v-for="(seat, index) in seats"
        :key="index"
        class="seat"
        :class="{ lit: !!seat.color }"
        :style="{ left: `${seat.x}%`, top: `${seat.y}%`, '--seat-color': seat.color ?? '' }"
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
    </div>

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
const dropped = ref<Record<string, { name: string; logo?: string; color?: string }[]>>({})
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
const correctCount = computed(() => placedNames.value.length)

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

/** Seats in reading order, each carrying its bench's colour once earned. */
const seats = computed(() => {
  const dots = seatDots(deal.value)
  const positions = hemicycleSeats(dots.reduce((total, bench) => total + bench.dots, 0))
  const painted: { x: number; y: number; color?: string }[] = []
  let cursor = 0
  for (const bench of dots) {
    const entry = deal.value.benches.find(candidate => candidate.name === bench.name)
    // Unasked benches are context and paint from the start; an asked one stays
    // blank until it is placed, or until the colour rung unlocks.
    const show =
      entry && (!entry.asked || placedNames.value.includes(entry.name) || hintLevel.value >= 2)
    for (let seat = 0; seat < bench.dots && cursor < positions.length; seat += 1, cursor += 1) {
      painted.push({
        x: positions[cursor]!.x,
        y: positions[cursor]!.y,
        ...(show && drawn.value[bench.name] ? { color: drawn.value[bench.name] } : {}),
      })
    }
  }
  return painted
})

/** A drop zone centred over each asked bench's own run of seats. */
const zones = computed(() => {
  const dots = seatDots(deal.value)
  const positions = hemicycleSeats(dots.reduce((total, bench) => total + bench.dots, 0))
  const out: { name: string; x: number; y: number }[] = []
  let cursor = 0
  for (const bench of dots) {
    const entry = deal.value.benches.find(candidate => candidate.name === bench.name)
    const run = positions.slice(cursor, cursor + bench.dots)
    cursor += bench.dots
    if (!entry?.asked || !run.length) continue
    out.push({
      name: bench.name,
      x: run.reduce((sum, seat) => sum + seat.x, 0) / run.length,
      y: run.reduce((sum, seat) => sum + seat.y, 0) / run.length,
    })
  }
  return out
})

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

  if (name === zone) {
    const bench = asked.value.find(candidate => candidate.name === name)
    dropped.value = {
      ...dropped.value,
      [zone]: [{ name, logo: bench?.logo, color: bench?.color }],
    }
    if (!unplaced.value.length) submit()
    return
  }

  // A miss flashes the zone; the bench is already back in the tray above.
  missed.value = { ...missed.value, [zone]: true }
  setTimeout(() => {
    missed.value = { ...missed.value, [zone]: false }
  }, 400)
}

const submit = () => {
  if (!challenge.value) return
  // The answer is which benches landed, not a country — `ranking` carries the
  // chamber so the reveal knows what to paint, and `parliament` carries the
  // placements the server re-grades.
  submitOnce([challenge.value.country], undefined, undefined, {
    parliament: { placed: placedNames.value },
  })
}

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
  transform: translate(-50%, -50%);
  transition: background var(--motion-slow) var(--ease-out);

  &.lit {
    border-color: transparent;
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
