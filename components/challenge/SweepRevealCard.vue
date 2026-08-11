<template>
  <section class="sweep-reveal">
    <!-- The take: who walked away with what, ranked. The board below is the
         why; this is the outcome at a glance. -->
    <header class="take card">
      <h2 class="take-title">{{ swept ? 'Board swept' : 'Time' }}</h2>
      <span class="take-sub">{{ verdictLine }}</span>
      <ul class="take-row">
        <li
          v-for="seat in standings"
          :key="seat.playerId"
          class="take-seat chip player-accent"
          :class="{ mine: seat.playerId === playerId }"
          :style="{ '--player-color': players[seat.playerId]?.color }"
        >
          <PlayerPawn class="take-pawn" :player="players[seat.playerId]" />
          <span class="take-name">{{ seatName(seat.playerId) }}</span>
          <span class="take-count">{{ seat.claimed.length }}</span>
          <span v-if="leaders.has(seat.playerId)" class="take-badge">Most taken</span>
          <span v-if="seat.playerId === closerId" class="take-badge closer">Closed it</span>
          <span class="take-points">+{{ scores[seat.playerId]?.scored ?? 0 }}</span>
        </li>
      </ul>
    </header>

    <article class="panel card">
      <header class="panel-head">
        <span class="eyebrow">{{ set?.label ?? 'The board' }}</span>
        <span class="panel-count">{{ claimedCount }} of {{ challenge.members.length }} taken</span>
        <SourceInfo
          v-if="set"
          class="panel-source"
          :attributions="datasetAttribution(set.dataset)"
        />
      </header>

      <ul class="slot-grid">
        <li
          v-for="(slot, index) in slots"
          :key="slot.isoCode"
          class="slot"
          :class="{ open: !slot.taken, mine: slot.holder?.id === playerId }"
          :style="{ '--land-delay': `${index * 0.03}s`, '--player-color': slot.holder?.color }"
        >
          <CountryChip class="slot-chip" compact tag="span" :country="slot.country" />
          <PlayerPawn v-if="slot.holder" class="slot-pawn" :player="slot.holder" />
        </li>
      </ul>

      <!-- The payload. A slot a rival took is a story about them; a slot
           NOBODY took is a story about the whole table, and it is the one
           everybody shouts about. -->
      <template v-if="unclaimed.length">
        <span class="eyebrow tail-head">
          Nobody had {{ unclaimed.length === 1 ? 'this one' : 'these' }}
        </span>
        <ul class="country-chip-list rail unclaimed">
          <CountryChip
            v-for="country in unclaimed"
            :key="country.isoCode"
            compact
            :country="country"
          />
        </ul>
      </template>

      <p v-if="set" class="qualifier">{{ set.qualifier }}</p>

      <template v-if="strays.length">
        <span class="eyebrow tail-head">Names the table tried</span>
        <ul class="country-chip-list rail strays">
          <CountryChip
            v-for="country in strays"
            :key="country.isoCode"
            compact
            :country="country"
          />
        </ul>
      </template>
    </article>
  </section>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import { formatNumber } from '~~/lib/number'
import {
  SWEEP_SETS,
  sweepClaimedBy,
  sweepCloserId,
  sweepIsComplete,
  sweepLeaders,
  sweepScoresFromClaims,
  sweepSecondsToSpare,
  sweepStandings,
  sweepUnclaimed,
} from '~~/lib/clean-sweep'
import type { CleanSweepChallenge } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

/**
 * Clean Sweep's reveal — the table's end summary. A ranked take strip up top
 * (claims, the closer's badge, the points each banked), then the board with
 * every slot face-up in its claimant's colour, then the section the mode
 * exists for: the slots nobody reached.
 *
 * Everything here is derived from the claims already on the snapshot through
 * lib/clean-sweep, the same functions the round itself and the settle read —
 * so the card can never show a board the scores disagree with.
 */
const props = defineProps<{
  challenge: CleanSweepChallenge
  players: Record<string, Player>
  playerId: string
}>()

const seatName = (id: string) => seatLabel(props.players, id, props.playerId)

const set = computed(() => SWEEP_SETS[props.challenge.setId])
const claimedBy = computed(() => sweepClaimedBy(props.challenge))
const standings = computed(() => sweepStandings(props.challenge))
const scores = computed(() => sweepScoresFromClaims(props.challenge))
const swept = computed(() => sweepIsComplete(props.challenge))
const closerId = computed(() => sweepCloserId(props.challenge))
/** Same question, same answer as the live rail — never a second opinion. */
const leaders = computed(() => new Set(sweepLeaders(props.challenge)))
const claimedCount = computed(() => Object.keys(claimedBy.value).length)

/** The board in deal order — a grid that re-sorted at the reveal would break
 *  every player's memory of where they were looking. */
const slots = computed(() =>
  props.challenge.members.flatMap(isoCode => {
    const country = getCountry(isoCode)
    if (!country) return []
    const holderId = claimedBy.value[isoCode]
    // `open` keys off the CLAIM, never off the claimant resolving to a Player —
    // an unresolvable holder would otherwise draw a taken slot as an open one.
    return [
      {
        isoCode,
        country,
        taken: !!holderId,
        holder: holderId ? props.players[holderId] : undefined,
      },
    ]
  })
)

const unclaimed = computed(() =>
  sweepUnclaimed(props.challenge).flatMap(isoCode => getCountry(isoCode) ?? [])
)

/** Wrong names, de-duplicated — three seats trying Norway is one story. */
const strays = computed(() => {
  const seen = new Set<string>()
  return props.challenge.state.strays.flatMap(stray => {
    if (seen.has(stray.isoCode)) return []
    seen.add(stray.isoCode)
    return getCountry(stray.isoCode) ?? []
  })
})

/** The table's result in one line: the co-op outcome and what it paid. */
const verdictLine = computed(() => {
  if (swept.value) {
    return `Cleared with ${sweepSecondsToSpare(props.challenge)}s to spare — the sweep bonus pays every seat`
  }
  const left = unclaimed.value.length
  return `${formatNumber(left)} ${left === 1 ? 'slot' : 'slots'} left standing — no sweep bonus`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.sweep-reveal {
  gap: 1.2rem;
  display: grid;
  align-items: start;
  padding-top: 0.4rem;

  // UniqueRevealGrid's cluster surface: cream wash, ink hairline, soft radius.
  .card {
    border-radius: 1.2rem;
    backdrop-filter: blur(0.5rem);
    background: milk(0.88);
    border: 0.1rem solid ink(0.25);
  }

  .eyebrow {
    opacity: 0.65;
    font-size: 1.25rem;
    letter-spacing: 0.06em;
    color: var(--dark-blue);
  }
}

.take {
  gap: 0.4rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  padding: 1.2rem 1.4rem 1.6rem;
  animation: fade-in var(--motion-base) var(--ease-out-expressive) both;
}

.take-title {
  margin: 0;
  color: var(--dark-blue);
}

.take-sub {
  opacity: 0.65;
  font-size: 1.25rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dark-blue);
  margin-bottom: 0.8rem;
  text-align: center;
}

.take-row {
  margin: 0;
  padding: 0;
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  justify-content: center;
}

.take-seat {
  gap: 0.5rem;
  display: flex;
  align-items: center;

  &.mine .take-name {
    font-weight: 700;
  }

  .take-pawn {
    width: 1.6rem;
    height: 2rem;
  }

  .take-name {
    font-size: 1.35rem;
    color: var(--dark-blue);
  }

  // The claim count is the round's own currency — bigger than the name.
  .take-count {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--dark-blue);
  }

  .take-badge {
    font-size: 1.05rem;
    font-weight: 700;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dark-blue);
    background: var(--soft-mint);

    &.closer {
      background: var(--warm-sand);
    }
  }

  .take-points {
    opacity: 0.7;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--dark-blue);
  }
}

.panel {
  padding: 1.2rem 1.4rem;
  animation: fade-in var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: 0.1s;
}

.panel-head {
  gap: 0.7rem;
  display: flex;
  align-items: baseline;
  padding-bottom: 0.7rem;
  margin-bottom: 0.9rem;
  border-bottom: 0.1rem solid $hairline;

  .eyebrow {
    margin-bottom: 0;
  }

  .panel-count {
    opacity: 0.6;
    font-size: 1.25rem;
    color: var(--dark-blue);
  }

  .panel-source {
    margin-left: auto;
  }
}

.slot-grid {
  margin: 0;
  padding: 0;
  gap: 0.4rem;
  display: grid;
  list-style: none;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
}

// The claimant's colour is the whole verdict: a taken slot wears its owner's
// edge, an untaken one is a dashed blank that never got filled.
.slot {
  gap: 0.5rem;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 0.35rem 0.6rem;
  border-radius: 0.8rem;
  background: milk(0.7);
  border: 0.15rem solid transparent;
  border-left-width: 0.35rem;
  border-left-color: var(--player-color, transparent);
  // Square the accented edge: a thick border through a 0.8rem radius renders
  // as a crescent, and the identity edge has to read as a bar.
  border-radius: 0 0.8rem 0.8rem 0;
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: var(--land-delay);

  &.mine {
    background: milk(0.95);

    :deep(.chip-name) {
      font-weight: 700;
    }
  }

  &.open {
    background: flame(0.06);
    border: 0.15rem dashed ink(0.3);

    :deep(.chip-name) {
      opacity: 0.6;
    }
  }
}

.slot-chip {
  padding: 0;
  min-width: 0;
  flex: 1;
}

.slot-pawn {
  flex: none;
  width: 1.3rem;
  height: 1.7rem;
}

.tail-head {
  display: block;
  margin-top: 1.4rem;
  margin-bottom: 0.6rem;
}

.unclaimed :deep(.chip-name) {
  font-weight: 700;
}

.strays :deep(.country-chip) {
  opacity: 0.65;
}

.qualifier {
  margin: 1.4rem 0 0;
  font-size: 1.4rem;
  line-height: 1.45;
  color: var(--dark-blue);
  opacity: 0.85;
}

@media screen and (max-width: $tablet) {
  .slot-grid {
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  }

  .take-row {
    gap: 0.6rem;
  }
}
</style>
