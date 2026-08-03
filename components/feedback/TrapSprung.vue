<template>
  <div v-if="!watching" ref="root" class="intro-overlay trap-sprung" @click="skip">
    <div class="content">
      <span data-intro class="kicker map-caption">Dead end</span>
      <h1 data-intro>{{ title }}</h1>
      <hr data-intro />
      <p data-intro class="stakes">{{ blame }}</p>

      <!-- The proof. Every connection of the dead head, struck through with
           the reason it was shut — the table sees the count and the closure,
           not just the claim. -->
      <ol data-intro class="doors country-chip-list">
        <CountryChip
          v-for="door in doors"
          :key="door.isoCode"
          class="spent"
          compact
          :country="getCountry(door.isoCode)"
        >
          <small class="door-reason">{{ reasonOf(door) }}</small>
        </CountryChip>
      </ol>

      <p data-intro class="verdict">
        {{ verdict }}
      </p>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import CountryChip from '~/components/country/CountryChip.vue'
import { useGameStore } from '~~/store/game.store'
import { countryName, getCountry } from '~~/lib/country'
import { EASE } from '~~/lib/motion'
import { playerDisplayName } from '~~/lib/player'
import { useIntroBeat } from '~~/lib/use-intro-beat'
import { TRAP_HOLD_MS } from '~~/lib/events/server/turn-timing'
import type { BorderChainTrap, ClosedDoor } from '~~/types/challenges/group-modes.type'
import type { Player } from '~~/types/player.type'

/**
 * The dead-end beat. A trapped player never held the clock — they were out
 * before their turn began — so this is the only moment the table can be shown
 * WHY. The doors do the arguing: every neighbour of the head, struck through
 * with the reason it was closed. Server-timed (TRAP_HOLD_MS); the tap only
 * fades the sign, it never advances the round.
 */
const props = defineProps<{
  trap: BorderChainTrap
  players: { [playerId: string]: Player | undefined }
  /** The local player, so the victim reads "You" and not their own name. */
  playerId: string
}>()

const emit = defineEmits<{ done: [] }>()

// Watch mode: the booth's inert wrapper makes a tap-held overlay unskippable —
// skip the beat and fire done immediately (same contract as Interstitial).
const gameStore = useGameStore()
const watching = computed(() => gameStore.watching)
if (watching.value) onMounted(() => emit('done'))

const doors = computed(() => props.trap.doors)
const mine = computed(() => props.trap.playerId === props.playerId)
const nameOf = (playerId?: string) =>
  playerId ? playerDisplayName(props.players[playerId]) : 'Someone'

const title = computed(() =>
  mine.value ? "You're trapped" : `${nameOf(props.trap.playerId)} is trapped`
)

const blame = computed(() => {
  const head = countryName(getCountry(props.trap.head))
  if (!props.trap.byPlayerId) return `The chain dead-ends at ${head}.`
  const closer = props.trap.byPlayerId === props.playerId ? 'You' : nameOf(props.trap.byPlayerId)
  return `${closer} closed the chain at ${head}.`
})

const verdict = computed(() => {
  const count = doors.value.length
  const who = mine.value ? 'you go' : 'they go'
  if (!count) return `Nowhere to go — ${mine.value ? 'you are' : 'they are'} out.`
  const doorWord = count === 1 ? 'The only way out was shut' : `All ${count} ways out were shut`
  return `${doorWord} — ${who} out without a move.`
})

const reasonOf = (door: ClosedDoor) =>
  door.reason === 'walked'
    ? door.step
      ? `walked · step ${door.step}`
      : 'already walked'
    : 'off the board'

const root = ref<HTMLElement>()
// The sign fades a beat before the server deals fresh ground, so the table
// never watches an empty overlay sitting over a live chain.
const HOLD_SECONDS = TRAP_HOLD_MS / 1000 - 1.4

const { skip } = useIntroBeat(
  root,
  {
    pieceSelector: '[data-intro]',
    holdFor: () => HOLD_SECONDS,
    decorate: (timeline, shell) => {
      // The doors snap shut one after another — the closure is the argument,
      // so it plays out rather than arriving pre-made.
      const chips = shell.querySelectorAll('.doors .country-chip')
      if (!chips.length) return
      timeline.fromTo(
        chips,
        { opacity: 0, scale: 1.04 },
        { opacity: 1, scale: 1, duration: 0.28, ease: EASE.exit, stagger: 0.09 },
        '>-0.2'
      )
    },
    reducedMotionHoldMs: TRAP_HOLD_MS - 1400,
    onReducedMotion: shell => {
      gsap.set(shell.querySelectorAll('[data-intro], .doors .country-chip'), { opacity: 1 })
    },
  },
  () => emit('done')
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
// Shell geometry comes from templates/_intro-overlay.scss
// Half the proof is on the map behind — the shut doors washed red around the
// pulsing head — so this scrim stays thin and skips the shell's blur. The copy
// earns its contrast from its own pane instead.
.trap-sprung {
  background: milk(0.34);
  backdrop-filter: none;
}

.kicker {
  color: var(--hior-ange);
  padding: 0.4rem 1.6rem;
  font-weight: bold;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: milk(0.92);
  border: 0.1rem solid flame(0.35);
}

// The copy stands on the map itself, so each line carries a milk halo rather
// than the blur the shell would have given it.
h1,
.stakes,
.verdict {
  text-shadow:
    0 0 1.2rem #{milk(1)},
    0 0 2.4rem #{milk(1)},
    0 0 3.6rem #{milk(0.9)};
}

h1 {
  color: var(--dark-blue);
}

hr {
  border-top-color: var(--hior-ange);
}

.stakes {
  color: var(--dark-blue);
}

// The doors sit in a pane so they read as evidence, not as more copy. Over a
// thin scrim the pane carries its own surface, or the flags fight the map.
.doors {
  gap: 0.6rem;
  padding: 1.2rem;
  border-radius: 0.6rem;
  background: milk(0.92);
  border: 0.1rem solid ink(0.12);
  max-width: 46rem;
}

.door-reason {
  opacity: 0.7;
  font-size: 1.2rem;
  white-space: nowrap;
  color: var(--dark-blue);
}

.verdict {
  margin: 0;
  opacity: 0.85;
  font-size: 1.6rem;
  color: var(--dark-blue);
}
</style>
