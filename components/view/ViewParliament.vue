<template>
  <section class="challenge-shell parliament">
    <ChallengePrompt :attributions="promptSources">
      <!-- Possessive, not "the Sweden parliament": the chamber's own name is
           only in the data for some countries, and often as an article title. -->
      <h1 class="map-caption">
        {{ challenge ? `${countryName(challenge.country)}'s parliament` : '' }}
      </h1>
      <span class="map-caption sub">{{ prompt }}</span>
    </ChallengePrompt>

    <div class="arc" aria-hidden="true">
      <span
        v-for="(seat, index) in seats"
        :key="index"
        class="seat"
        :class="{ placed: !!seat.color }"
        :style="{
          left: `${seat.x}%`,
          top: `${seat.y}%`,
          '--seat-color': seat.color ?? 'transparent',
        }"
      />
    </div>

    <footer class="shell-footer">
      <p v-if="submitted" class="done">{{ correctCount }} of {{ asked.length }} placed</p>
      <ul v-else class="tray">
        <li
          v-for="bench in unplaced"
          :key="bench.name"
          class="bench draggable"
          :data-name="bench.name"
        >
          <img v-if="bench.logo" class="bench-logo" :src="bench.logo" alt="" />
          <span v-else class="bench-swatch" :style="{ background: bench.color }" />
          <span class="bench-name">{{ hintLevel >= 3 ? bench.name : '' }}</span>
        </li>
      </ul>
    </footer>
  </section>
</template>

<script lang="ts" setup>
/**
 * A chamber drawn as an arc of seats, its blocs unpainted. Drag each party
 * onto the block you believe is theirs; a correct drop paints and locks it.
 *
 * DELIBERATE break with `ViewComposition`, which colours its slices by depth
 * rather than hue "so the eye reads magnitude instead of hunting for a legend".
 * Here party colour IS the subject — the hint ladder starts by seeping it into
 * the seats — so the arc is painted in the parties' own colours.
 */
import { computed, ref, watch } from 'vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import { hemicycleSeats } from '~/components/challenge/individual/ring'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName } from '~~/lib/country'
import { seatDots, type ParliamentDeal } from '~~/lib/parliament'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

const { challenge, submitted, submitOnce, elapsedFraction } =
  useGroupChallenge('parliament-challenge')

/** Which bench each seat index belongs to, once placed. */
const placed = ref<Record<string, boolean>>({})

const deal = computed(
  () =>
    ({
      country: challenge.value?.country,
      benches: challenge.value?.benches ?? [],
      totalSeats: challenge.value?.totalSeats ?? 0,
    }) as ParliamentDeal
)

const asked = computed(() => deal.value.benches.filter(bench => bench.asked))
const unplaced = computed(() => asked.value.filter(bench => !placed.value[bench.name]))
const correctCount = computed(() => Object.values(placed.value).filter(Boolean).length)

/**
 * The hint ladder, on the round's own clock: colour seeps into the seats, then
 * into the tray, then the names appear. Colour comes first because it is the
 * better-covered field — a chamber often has colours for benches whose logos
 * we never found.
 */
const hintLevel = computed(() => {
  const elapsed = elapsedFraction.value
  if (elapsed > 0.66) return 3
  if (elapsed > 0.33) return 2
  return 1
})

/** Seats in reading order, each carrying the colour of the bench that holds it. */
const seats = computed(() => {
  const positions = hemicycleSeats(
    seatDots(deal.value).reduce((total, bench) => total + bench.dots, 0)
  )
  const dots = seatDots(deal.value)
  const painted: { x: number; y: number; color?: string }[] = []
  let cursor = 0
  for (const bench of dots) {
    const entry = deal.value.benches.find(candidate => candidate.name === bench.name)
    const show = entry && (!entry.asked || placed.value[entry.name] || hintLevel.value >= 1)
    for (let seat = 0; seat < bench.dots && cursor < positions.length; seat += 1, cursor += 1) {
      painted.push({
        x: positions[cursor]!.x,
        y: positions[cursor]!.y,
        ...(show && entry?.color ? { color: entry.color } : {}),
      })
    }
  }
  return painted
})

/** Seats and vote share come from the election articles; the parties from the
 *  Factbook roster, so both datasets are credited. */
const promptSources = computed(() => [
  ...datasetAttribution('elections'),
  ...datasetAttribution('parties'),
])

const prompt = computed(() =>
  submitted.value
    ? `${deal.value.totalSeats} seats`
    : `Drag each party onto its benches — ${asked.value.length} to place`
)

// Submitting at the answer: the server's flip ends the beat, not a view timer.
watch(
  () => unplaced.value.length,
  remaining => {
    if (!remaining && asked.value.length && challenge.value) {
      // The answer is HOW MANY benches landed, not which countries — the
      // ranking carries the chamber so the reveal knows what to paint, and
      // `parliament` carries the placements the server re-grades.
      submitOnce([challenge.value.country], undefined, undefined, {
        parliament: { placed: Object.keys(placed.value).filter(name => placed.value[name]) },
      })
    }
  }
)
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.arc {
  position: relative;
  width: min(46rem, 92vw);
  aspect-ratio: 2 / 1;
  margin: 0 auto;
  pointer-events: auto;
}

.seat {
  position: absolute;
  width: 1.6%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--seat-color);
  border: 1px solid #{ink(0.25)};
  transform: translate(-50%, -50%);
  transition: background var(--motion-slow) var(--ease-out);

  &.placed {
    border-color: transparent;
  }
}

.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  padding: 0;
  margin: 0;
  list-style: none;
  pointer-events: auto;
}

.bench {
  @include caption-surface($cardRadius);

  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  cursor: grab;
}

.bench-logo {
  width: 2.5rem;
  height: 1.75rem;
  object-fit: contain;
}

.bench-swatch {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
}

.done {
  text-align: center;
}
</style>
