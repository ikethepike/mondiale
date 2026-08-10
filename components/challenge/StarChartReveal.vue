<template>
  <section class="pane-content ranking star-chart-reveal">
    <span class="eyebrow">
      The Sky, Named
      <span class="count">{{ yourTally }} of {{ rows.length }} named</span>
    </span>

    <ol class="stars">
      <li
        v-for="row in rows"
        :key="row.isoCode"
        class="star-row"
        :class="row.verdict"
        :style="{ '--row-index': row.index }"
      >
        <span class="mark" :class="row.verdict">{{ row.index + 1 }}</span>

        <div class="body">
          <div class="head">
            <strong class="city">{{ row.name }}</strong>
            <span v-if="row.native" class="native">{{ row.native }}</span>
          </div>
          <ul class="country-chip-list place">
            <CountryChip compact :country="row.country" />
            <li class="coords">{{ row.coordinates }}</li>
          </ul>
          <!-- The group beat: the same star, judged across the whole table.
               This is what a shared round's summary is for — a miss you can
               see two other people made reads differently from a solo blank. -->
          <p class="room">
            <span class="verdict-word">{{ row.verdictWord }}</span>
            <span class="room-line">· {{ row.roomLine }}</span>
          </p>
        </div>
      </li>
    </ol>

    <template v-if="strays.length">
      <span class="eyebrow tail-head">
        Wrong Names
        <span class="count">−{{ strays.length }}</span>
      </span>
      <ul class="country-chip-list rail strays">
        <li v-for="stray in strays" :key="stray.isoCode" class="stray-chip chip">
          {{ stray.name }}
          <span class="stray-country">{{ stray.countryName }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { capitalStar } from '~~/lib/capitals'
import { countryName, getCountry } from '~~/lib/country'
import { formatLatLng } from '~~/lib/geo'
import { seatLabel } from '~~/lib/player'
import { starChartAnswers, starChartStars } from '~~/lib/star-chart'
import type { StarChartChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAnswer } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The Star Chart's end summary: one row per star, in the order the night dealt
 * them, each binding the three things the round taught — the city's name, the
 * country it belongs to, and the point on Earth it sits at.
 *
 * It reads the WHOLE table's answers, not just the reader's. The round is a
 * group round, so "nobody found this one" and "you were the only one who did"
 * are the two facts a scorecard owes the player, and neither can be told from
 * one seat's list. Every verdict is re-derived from the banked answers here —
 * the score itself was settled server-side long before this renders.
 */
const props = defineProps<{
  challenge: StarChartChallenge
  /** Every seat's banked answer for this round, keyed by player id. */
  answers: Record<string, GroupChallengeAnswer>
  players: Record<string, Player>
  /** The seat this scorecard is about — the card flips between players. */
  playerId: string
  /** Who is READING it. Only this seat is ever called "You": the scorecard is
   *  browsable, and a rival's card voiced in the second person would tell the
   *  reader they named a star they missed. */
  viewerId: string
}>()

/** Who named a given star, in seating order — the reader first when they did. */
const namersOf = (isoCode: string) =>
  Object.entries(props.answers)
    .filter(([, answer]) => answer.submitted.includes(isoCode as never))
    .map(([id]) => id)
    .sort((a, b) => Number(b === props.playerId) - Number(a === props.playerId))

/** How many seats were in the round at all — the denominator of "nobody". */
const seatCount = computed(() => Object.keys(props.answers).length)

/** Is this card about the reader's own seat? */
const isViewer = computed(() => props.playerId === props.viewerId)

const rows = computed(() =>
  starChartStars(props.challenge).flatMap((star, index) => {
    const country = getCountry(star.isoCode)
    if (!country) return []
    const namers = namersOf(star.isoCode)
    const yours = namers.includes(props.playerId)
    const others = namers.filter(id => id !== props.playerId)

    return [
      {
        ...star,
        index,
        country,
        verdict: yours ? ('found' as const) : ('missed' as const),
        verdictWord: yours ? (isViewer.value ? 'You named it' : 'Named it') : 'Missed',
        coordinates: formatLatLng(star),
        roomLine: roomLine({ yours, others, total: seatCount.value }),
      },
    ]
  })
)

/** The room's verdict on one star, told from this scorecard's seat. */
const roomLine = ({
  yours,
  others,
  total,
}: {
  yours: boolean
  others: string[]
  total: number
}): string => {
  // Named from the READER's chair, so the viewer is "You" wherever they
  // appear — even in the list of people who beat them to a star.
  const names = others.map(id => seatLabel(props.players, id, props.viewerId))
  if (yours) {
    if (!others.length) return total > 1 ? 'the only one who did' : 'named'
    return `so did ${names.join(', ')}`
  }
  if (!others.length) return total > 1 ? 'nobody found this one' : 'not named'
  return `${names.join(', ')} found it`
}

/** Capitals the reader named that weren't in the sky. Named as CITIES — the
 *  answer they typed — with the country beneath, since that is what the round
 *  actually charged them for. */
const strays = computed(() => {
  const stars = new Set<string>(starChartAnswers(props.challenge))
  const submitted = props.answers[props.playerId]?.submitted ?? []
  return [...new Set(submitted)]
    .filter(isoCode => !stars.has(isoCode))
    .map(isoCode => ({
      isoCode,
      name: capitalStar(isoCode)?.name ?? countryName(isoCode),
      countryName: countryName(isoCode),
    }))
})

const yourTally = computed(() => rows.value.filter(row => row.verdict === 'found').length)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

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

.stars {
  margin: 0;
  padding: 0;
  list-style: none;
}

.star-row {
  gap: 1.4rem;
  display: grid;
  padding: 1.2rem 0;
  align-items: flex-start;
  grid-template-columns: 2.8rem minmax(0, 1fr);
  animation: row-land 0.4s both;
  animation-delay: calc(var(--row-index) * 0.08s);

  & + .star-row {
    border-top: 0.1rem solid $hairline;
  }
}

// The star's own mark, carrying its night colour into the daylit card: amber
// for one the reader lit, cold blue for one that stayed dark.
.mark {
  width: 2.8rem;
  height: 2.8rem;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  font-weight: bold;
  border-radius: 50%;
  color: hsla(216, 58%, 12%, 0.9);
  background: var(--night-amber);
  box-shadow: 0 0 0.6rem hsla(45, 96%, 60%, 0.5);

  &.missed {
    color: hsla(216, 30%, 96%, 0.95);
    background: hsla(216, 30%, 55%, 0.85);
    box-shadow: none;
  }
}

.body {
  min-width: 0;
}

.head {
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
}

.city {
  font-size: 1.8rem;
}

.native {
  opacity: 0.6;
  font-size: 1.3rem;
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

.coords {
  opacity: 0.65;
  font-size: 1.2rem;
  align-self: center;
  font-variant-numeric: tabular-nums;
}

.room {
  gap: 0.5rem;
  margin: 0.7rem 0 0;
  display: flex;
  flex-wrap: wrap;
  font-size: 1.3rem;
}

.verdict-word {
  font-weight: bold;
}

.star-row.found .verdict-word {
  color: var(--soft-blue);
}

.star-row.missed .verdict-word {
  color: flame(0.9);
}

.room-line {
  opacity: 0.7;
}

.tail-head {
  margin-top: 1.8rem;
  padding-top: 1.6rem;
  border-top: 0.1rem solid ink(0.25);

  .count {
    color: flame(0.9);
  }
}

.strays {
  justify-content: flex-start;
}

// Cities, not countries, so these wear the plain chip rather than a flag chip.
.stray-chip {
  gap: 0.5rem;
  display: flex;
  align-items: baseline;
  border: 0.1rem solid ink(0.15);
  border-radius: 999px;

  .stray-country {
    opacity: 0.6;
    font-size: 1.1rem;
  }
}

@media screen and (max-width: $tablet) {
  .star-row {
    gap: 1rem;
    grid-template-columns: 2.4rem minmax(0, 1fr);
  }

  .city {
    font-size: 1.6rem;
  }
}
</style>
