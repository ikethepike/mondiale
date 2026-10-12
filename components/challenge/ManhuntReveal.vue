<template>
  <section class="manhunt-reveal pane tr decorator-bottom">
    <div class="reveal-head">
      <DespotHat class="despot-hat" />
      <div class="head-text">
        <h2 class="headline">{{ headline }}</h2>
        <p class="escape-line">{{ escapeLine }}</p>
      </div>
    </div>
    <ol ref="trailRail" class="trail country-chip-list rail">
      <template v-for="(stop, index) in stops" :key="`${index}-${stop.isoCode}`">
        <li v-if="index > 0" class="hop-mark" :class="stop.shape">
          {{ stop.shape === 'sea' ? '〜' : '→' }}
        </li>
        <CountryChip
          compact
          class="map-caption"
          :class="{ last: index === stops.length - 1, vault: stop.looted }"
          :country="getCountry(stop.isoCode)"
        >
          <span v-if="stop.stayed" class="stop-tag">lay low</span>
          <span v-if="stop.looted" class="stop-tag">vault</span>
        </CountryChip>
      </template>
    </ol>
    <p v-if="capturerName" class="capturer">
      Cornered by <strong>{{ capturerName }}</strong> on beat {{ capturedHop }}.
    </p>
    <p v-if="sharpest" class="sharpest">
      Sharpest ping: <strong>{{ nameOf(sharpest.playerId) }}</strong
      >, {{ sharpestLine }}
    </p>
    <details v-if="clues.length" class="intel-recap" :open="!isPhone && !isShort">
      <summary class="recap-lead">
        The leaks that {{ capturerName ? 'closed the net' : 'never closed it' }}
      </summary>
      <ul class="clues">
        <li v-for="clue in clues" :key="`${clue.hop}-${clue.text}`" class="clue-row">
          <span class="hop-badge">{{ clue.hop }}</span>
          <span>{{ clue.text }}</span>
          <span v-if="clue.askedBy" class="clue-tag">⚖ {{ nameOf(clue.askedBy) }}</span>
        </li>
      </ul>
    </details>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import DespotHat from '~/components/challenge/DespotHat.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionFor, datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { isStraitHop } from '~~/lib/chain'
import { formatReading, manhuntHopShape } from '~~/lib/manhunt'
import { seatLabel } from '~~/lib/player'
import { countryName, getCountry } from '~~/lib/country'
import { useChipTrail } from '~~/lib/use-chip-trail'
import { useIsPhone, useIsShortViewport } from '~~/lib/use-viewport'
import type { ManhuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

const props = defineProps<{
  challenge: ManhuntChallenge
  players: { [playerId: string]: Player }
  playerId: string
}>()

const isPhone = useIsPhone()
const isShort = useIsShortViewport()
const nameOf = (playerId: string) => seatLabel(props.players, playerId, props.playerId)

const outcome = computed(() => props.challenge.state.outcome)
const walk = computed(() => outcome.value?.trail ?? [])
const clues = computed(() => props.challenge.state.clues)
const looted = computed(() => outcome.value?.looted ?? [])

/** One chip per country stopped in — a beat lying low folds into its stop. */
const stops = computed(() => {
  const out: {
    isoCode: (typeof walk.value)[number]
    shape: string
    stayed: boolean
    looted: boolean
  }[] = []
  walk.value.forEach((isoCode, index) => {
    const previous = walk.value[index - 1]
    const shape = previous ? manhuntHopShape(previous, isoCode) : 'ground'
    if (shape === 'stay' && out.length) {
      out[out.length - 1].stayed = true
      return
    }
    out.push({
      isoCode,
      shape: shape === 'sea' || (previous && isStraitHop(previous, isoCode)) ? 'sea' : 'ground',
      stayed: false,
      looted: false,
    })
  })
  for (const vault of looted.value) {
    const stop = out.find(entry => entry.isoCode === vault)
    if (stop) stop.looted = true
  }
  return out
})
const { trail: trailRail } = useChipTrail(() => stops.value.length)

/** The trail's legality (borders, straits, sea lanes), the profile data the
 *  categorical leaks read from, and each threshold leak's own stat source. */
const sources = computed(() =>
  dedupeAttributions([
    ...datasetAttribution('borders'),
    ...datasetAttribution('straits'),
    ...datasetAttribution('countries'),
    ...clues.value.flatMap(clue => (clue.accessorId ? [attributionFor(clue.accessorId)] : [])),
  ])
)

const despotIsMe = computed(() => props.challenge.despotId === props.playerId)
const despotName = computed(() => nameOf(props.challenge.despotId))

const headline = computed(() => {
  if (outcome.value?.kind === 'captured') {
    const where = countryName(getCountry(outcome.value.country))
    return despotIsMe.value
      ? `You were captured in ${where}`
      : `${despotName.value} — captured in ${where}`
  }
  if (outcome.value?.kind === 'escaped') {
    return despotIsMe.value ? 'You got away with it' : `${despotName.value} escaped`
  }
  return 'The hunt is over'
})

const escapeLine = computed(() => {
  const hops = props.challenge.state.moves.length
  const favours = props.challenge.state.moves.filter(move => move.kind === 'favour').length
  const parts = [`${hops} ${hops === 1 ? 'move' : 'moves'}`]
  if (favours) parts.push(`${favours} ${favours === 1 ? 'favour' : 'favours'} called in`)
  if (looted.value.length) {
    parts.push(`${looted.value.length} ${looted.value.length === 1 ? 'vault' : 'vaults'} emptied`)
  }
  return parts.join(' · ')
})

/** The closest any detective's sonar came — the reveal's near-miss. */
const sharpest = computed(() => {
  const all = Object.entries(outcome.value?.readings ?? {}).flatMap(([playerId, readings]) =>
    readings.flatMap(reading =>
      reading.distance === null ? [] : [{ playerId, hop: reading.hop, distance: reading.distance }]
    )
  )
  return all.sort((a, b) => a.distance - b.distance)[0]
})
const sharpestLine = computed(() => {
  const best = sharpest.value
  if (!best) return ''
  const where =
    best.distance === 0
      ? 'right on the hideout'
      : `${formatReading(best.distance)} from the hideout`
  return `${where} on beat ${best.hop}`
})

const capturedHop = computed(() =>
  outcome.value?.kind === 'captured' ? outcome.value.hop : undefined
)
const capturerName = computed(() =>
  outcome.value?.kind === 'captured' ? nameOf(outcome.value.capturerId) : ''
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.manhunt-reveal {
  gap: 0.8rem;
  width: 100%;
  display: flex;
  padding: 1.4rem 1.6rem;
  text-align: center;
  align-items: center;
  flex-flow: column nowrap;
  max-height: 46dvh;

  @media screen and (max-height: $short) {
    gap: 0.5rem;
    padding: 0.8rem 1.2rem;
    max-height: 62dvh;
  }
  overflow-y: auto;
  overscroll-behavior: contain;
  pointer-events: auto;
}

.reveal-head {
  gap: 1rem;
  display: flex;
  align-items: center;
  text-align: left;
}

.despot-hat {
  width: 4.2rem;
  flex-shrink: 0;
  // Worn slightly askew, as the office demands.
  transform: rotate(-9deg);

  @media screen and (max-width: $phone) {
    width: 3.2rem;
  }
}

.headline,
.escape-line {
  margin: 0;
}

.headline {
  @media screen and (max-width: $tablet) {
    font-size: 1.9rem;
  }
}

.escape-line {
  opacity: 0.75;
}

// One row on every width: the route reads left to right like the replay.
.trail {
  gap: 0.4rem;
  flex: none;
  flex-wrap: nowrap;
  max-width: 100%;
  overflow-x: auto;
  justify-content: flex-start;
  scrollbar-width: none;

  > * {
    flex-shrink: 0;
    white-space: nowrap;
  }
}

.last {
  font-weight: bold;
  border-width: 0.15rem;
}

.vault {
  border-color: hsl(42, 80%, 45%);
}

.stop-tag {
  opacity: 0.7;
  font-size: 0.85em;
}

.hop-mark {
  opacity: 0.6;
  font-weight: bold;

  &.sea {
    color: ink(1, 41%);
  }
}

.capturer,
.sharpest {
  margin: 0;
}

.sharpest {
  opacity: 0.8;
}

.intel-recap {
  width: 100%;

  .recap-lead {
    cursor: pointer;
    opacity: 0.75;
    margin-bottom: 0.4rem;
  }
}

.clues {
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  text-align: left;
  flex-flow: column nowrap;
}

.clue-row {
  gap: 0.6rem;
  display: flex;
  align-items: center;
}

.clue-tag {
  opacity: 0.7;
  font-size: 0.85em;
  white-space: nowrap;
}

.hop-badge {
  width: 1.4rem;
  height: 1.4rem;
  display: grid;
  flex-shrink: 0;
  font-size: 0.8em;
  font-weight: bold;
  place-items: center;
  border-radius: 50%;
  background: hsla(212, 58%, 52%, 0.18);
}
</style>
