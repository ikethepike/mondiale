<template>
  <section class="pane-content ranking terra-reveal">
    <span class="eyebrow">
      What The Atlas Lost
      <span class="count">{{ yourTally }} of {{ rows.length }} restored</span>
    </span>

    <ol
      ref="list"
      class="losses"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <li
        v-for="row in rows"
        :key="row.isoCode"
        class="loss-row"
        :class="row.verdict"
        :style="{ '--row-index': row.index }"
      >
        <span class="mark" :class="row.verdict">{{ row.index + 1 }}</span>

        <div class="body">
          <ul class="country-chip-list place">
            <CountryChip compact :country="row.country" />
            <li class="gone-at">gone after {{ row.goneAfterSeconds }}s</li>
          </ul>

          <!-- The placement lesson. This mode's whole premise is that players
               do not know where these countries are — so the summary says
               where, in the only terms that stick: the region, and the
               neighbours whose wash it disappeared into. -->
          <p class="placement">
            {{ row.regionLabel
            }}<template v-if="row.neighbourLine"> · between {{ row.neighbourLine }}</template>
          </p>

          <p class="room">
            <span class="verdict-word">{{ row.verdictWord }}</span>
            <span class="room-line">· {{ row.roomLine }}</span>
          </p>
        </div>
      </li>
    </ol>

    <template v-if="strays.length">
      <span class="eyebrow tail-head">
        Named, But Still There
        <span class="count">−{{ strays.length }}</span>
      </span>
      <ul class="country-chip-list rail strays">
        <CountryChip
          v-for="isoCode in strays"
          :key="isoCode"
          compact
          :country="getCountry(isoCode)"
        />
      </ul>
    </template>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { BORDERS } from '~~/data/borders.gen'
import { countryName, getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import { terraAnswers, terraVanishAt } from '~~/lib/terra-incognita'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { REGION_LABELS } from '~~/lib/variant'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAnswer } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'

/**
 * Terra Incognita's end summary: the countries the atlas swallowed, in the
 * order it swallowed them, each one saying where it actually was.
 *
 * A blitz scorecard normally just marks hits and misses, and for this mode
 * that would throw away the lesson. The round proves a player did not know
 * where Turkmenistan is — the reveal is the one moment it can tell them, so
 * every row carries the region and the neighbours the country vanished into,
 * and the rows stay in DEAL order rather than sorting alphabetically: "you
 * missed the very first one, which stood open for the whole round" is a
 * different fact from "you missed one".
 *
 * Like the Star Chart's, it reads the WHOLE table's answers — "nobody noticed
 * this one" is the most interesting thing a shared round can tell you, and no
 * single seat's list can say it. Every verdict is re-derived here; the score
 * itself settled server-side long before this rendered.
 */
const props = defineProps<{
  challenge: TerraIncognitaChallenge
  /** Every seat's banked answer for this round, keyed by player id. */
  answers: Record<string, GroupChallengeAnswer>
  players: Record<string, Player>
  /** The seat this scorecard is about — the card flips between players. */
  playerId: string
  /** Who is READING it. Only this seat is ever called "You": the scorecard is
   *  browsable, and a rival's card voiced in the second person would tell the
   *  reader they restored a country they actually missed. */
  viewerId: string
}>()

const list = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => list.value)

/** Who put a given country back, the reader's seat first when they did. */
const restorersOf = (isoCode: ISOCountryCode) =>
  Object.entries(props.answers)
    .filter(([, answer]) => answer.submitted.includes(isoCode))
    .map(([id]) => id)
    .sort((a, b) => Number(b === props.playerId) - Number(a === props.playerId))

const seatCount = computed(() => Object.keys(props.answers).length)
const isViewer = computed(() => props.playerId === props.viewerId)

/**
 * The neighbours it melted into — the wash that swallowed it, which is also
 * the most useful thing anyone can be told about where a country sits.
 *
 * The absorber leads: it is the border the map actually painted out, and the
 * name that also answered for this hole. The rest follow as context.
 */
const neighbourLine = (isoCode: ISOCountryCode): string => {
  const absorber = props.challenge.absorbedBy?.[isoCode]
  const rest = (BORDERS[isoCode] ?? []).filter(neighbour => neighbour !== absorber)
  const names = [...(absorber ? [absorber] : []), ...rest].slice(0, 3).map(countryName)
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const rows = computed(() =>
  terraAnswers(props.challenge).map((isoCode, index) => {
    const restorers = restorersOf(isoCode)
    const yours = restorers.includes(props.playerId)
    const others = restorers.filter(id => id !== props.playerId)
    const country = getCountry(isoCode)

    return {
      isoCode,
      index,
      country,
      goneAfterSeconds: Math.round(terraVanishAt(index, props.challenge.cadenceMs) / 1000),
      regionLabel: REGION_LABELS[country.region] ?? '',
      neighbourLine: neighbourLine(isoCode),
      verdict: yours ? ('restored' as const) : ('lost' as const),
      verdictWord: yours ? (isViewer.value ? 'You put it back' : 'Put it back') : 'Never noticed',
      roomLine: roomLine({ yours, others, total: seatCount.value }),
    }
  })
)

/** The room's verdict on one loss, told from this scorecard's seat. */
const roomLine = ({
  yours,
  others,
  total,
}: {
  yours: boolean
  others: string[]
  total: number
}): string => {
  const names = others.map(id => seatLabel(props.players, id, props.viewerId))
  if (yours) {
    if (!others.length) return total > 1 ? 'the only one who caught it' : 'restored'
    return `so did ${names.join(', ')}`
  }
  if (!others.length) return total > 1 ? 'nobody caught this one' : 'left missing'
  return `${names.join(', ')} caught it`
}

/** Countries the reader named that were never gone. */
const strays = computed(() => {
  const lost = new Set<ISOCountryCode>(terraAnswers(props.challenge))
  const submitted = props.answers[props.playerId]?.submitted ?? []
  return [...new Set(submitted)].filter(isoCode => !lost.has(isoCode))
})

const yourTally = computed(() => rows.value.filter(row => row.verdict === 'restored').length)
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

.losses {
  margin: 0;
  padding: 0 1.6rem 0 0;
  list-style: none;
  overflow-y: auto;
  scrollbar-width: thin;
  // Three rows and a peek of the fourth, yielding to short viewports — the
  // scorecard pane itself does not scroll, so the Close button below must
  // stay reachable. The same measure the star ledger keeps.
  max-height: min(32rem, calc(var(--viewport-height) * 0.36));

  @include scroll-fade;
}

.loss-row {
  gap: 1.4rem;
  display: grid;
  padding: 1.2rem 0;
  align-items: flex-start;
  grid-template-columns: 2.8rem minmax(0, 1fr);
  animation: row-land 0.4s both;
  animation-delay: calc(var(--row-index) * 0.08s);

  & + .loss-row {
    border-top: 0.1rem solid $hairline;
  }
}

// The order the atlas lost them. A restored country wears the map's own ink;
// one that stayed missing wears the alert hue it was bleeding on screen.
.mark {
  width: 2.8rem;
  height: 2.8rem;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  font-weight: bold;
  border-radius: 50%;
  color: var(--sour-milk);
  background: var(--dark-blue);

  &.lost {
    background: flame(0.9);
  }
}

.body {
  min-width: 0;
}

.place {
  gap: 0.6rem;
  margin: 0;
  justify-content: flex-start;

  :deep(.country-chip) {
    border: 0.1rem solid ink(0.15);
    border-radius: 999px;
  }
}

.gone-at {
  opacity: 0.65;
  font-size: 1.2rem;
  align-self: center;
  font-variant-numeric: tabular-nums;
}

.placement {
  opacity: 0.75;
  font-size: 1.3rem;
  margin: 0.6rem 0 0;
}

.room {
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  display: flex;
  flex-wrap: wrap;
  font-size: 1.3rem;
}

.verdict-word {
  font-weight: bold;
}

.loss-row.restored .verdict-word {
  color: var(--soft-blue);
}

.loss-row.lost .verdict-word {
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

// Left-aligned under its own eyebrow, not centred in the pane — the rail
// reads as a continuation of the heading above it.
.strays {
  justify-content: flex-start;
}

@media screen and (max-width: $tablet) {
  .loss-row {
    gap: 1rem;
    grid-template-columns: 2.4rem minmax(0, 1fr);
  }
}
</style>
