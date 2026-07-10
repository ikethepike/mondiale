<template>
  <Teleport to="body">
    <Transition name="backdrop">
      <div v-if="open" class="history-backdrop" @click="close" />
    </Transition>
    <Transition name="drawer">
      <aside
        v-if="open"
        ref="drawerEl"
        class="pane tl history-drawer"
        role="dialog"
        aria-label="Past rounds"
      >
        <div class="sheet-handle" aria-hidden="true" @pointerdown="onDragStart" />
        <header class="drawer-header" @pointerdown="onDragStart">
          <div>
            <span class="eyebrow">The story so far</span>
            <h2 class="drawer-title">Journey log</h2>
          </div>
          <button class="close" type="button" aria-label="Close history" @click="close">×</button>
        </header>

        <section class="standings">
          <span class="eyebrow">Standings</span>
          <ul class="totals">
            <li
              v-for="(entry, index) in totals"
              :key="entry.player.id"
              class="total-row"
              :class="{ leader: index === 0 && entry.total > 0 }"
              :style="`--player-color: ${entry.player.color}; --progress: ${entry.progress}`"
            >
              <span class="rank">{{ index + 1 }}</span>
              <PlayerPawn class="pawn" :player="entry.player" />
              <span class="name">{{ entry.player.name || 'Player' }}</span>
              <span class="detail">tile {{ entry.player.currentPosition }}</span>
              <strong class="total">{{ entry.total }}<span class="muted"> pts</span></strong>
            </li>
          </ul>
        </section>

        <p v-if="!pastRounds.length" class="empty">
          No finished rounds yet — the story starts after this one.
        </p>

        <section
          v-for="(entry, index) in pastRounds"
          :key="entry.number"
          class="round"
          :style="`--stagger: ${Math.min(index, 8)}`"
        >
          <header class="round-header">
            <span class="eyebrow">
              Round {{ entry.number }}
              <span class="chip kind-chip">{{ entry.kindLabel }}</span>
            </span>
            <h3 class="headline">
              <CountryFlag v-if="entry.country" class="flag" :country="entry.country" />
              <span>{{ entry.headline }}</span>
            </h3>
          </header>

          <ul class="scores">
            <li
              v-for="row in entry.rows"
              :key="row.player.id"
              class="score-row"
              :class="{ winner: row.winner }"
              :style="`--player-color: ${row.player.color}`"
            >
              <PlayerPawn class="pawn" :player="row.player" />
              <span class="name"
                >{{ row.player.name || 'Player'
                }}<span v-if="row.winner" class="trophy" aria-label="Round winner">🏆</span></span
              >
              <span v-if="row.distanceKm !== undefined" class="detail"
                >{{ row.distanceKm }} km off</span
              >
              <strong v-if="row.points" class="score"
                >{{ row.points.scored }}<span class="muted">/{{ row.points.maximum }}</span></strong
              >
              <span v-else class="muted">—</span>
            </li>
          </ul>

          <div v-if="entry.sketches.length" class="sketches">
            <figure v-for="sketch in entry.sketches" :key="sketch.player.id" class="sketch">
              <SketchOverlay :country="sketch.country" :sketch="sketch.points" />
              <figcaption>{{ sketch.player.name || 'Player' }}</figcaption>
            </figure>
          </div>
        </section>
      </aside>
    </Transition>
  </Teleport>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import CountryFlag from '~/components/country/CountryFlag.vue'
import SketchOverlay from '~/components/country/SketchOverlay.vue'
import { roundChallengeHeadline } from '~~/lib/challenge-headline'
import { prefersReducedMotion } from '~~/lib/motion'
import { getCountry } from '~~/lib/country'
import { KIND_LABELS } from '~~/lib/victory-stats'
import { useGameStore } from '~~/store/game.store'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import { isValidISOCode } from '~~/types/geography.types'

const props = defineProps<{ game: Game }>()

const gameStore = useGameStore()
const open = computed(() => gameStore.board.historyOpen)
const close = () => {
  gameStore.board.historyOpen = false
}

// --- Swipe-to-dismiss (mobile bottom sheet) --------------------------------
// Light kinetic feel: the sheet tracks the finger 1:1 downward (rubber-bands
// upward), and on release a velocity sample decides — flick or far enough
// dismisses with matched momentum, anything else springs back.
const drawerEl = ref<HTMLElement>()
const isSheet = () => window.matchMedia('(max-width: 640px)').matches

let dragging = false
let startY = 0
let currentDy = 0
let samples: { y: number; t: number }[] = []

const onDragStart = (event: PointerEvent) => {
  if (!isSheet() || !drawerEl.value) return
  dragging = true
  startY = event.clientY
  currentDy = 0
  samples = [{ y: event.clientY, t: performance.now() }]
  gsap.killTweensOf(drawerEl.value)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

const onDragMove = (event: PointerEvent) => {
  if (!dragging || !drawerEl.value) return
  currentDy = event.clientY - startY
  samples.push({ y: event.clientY, t: performance.now() })
  if (samples.length > 5) samples.shift()

  const translate = currentDy >= 0 ? currentDy : currentDy * 0.15
  drawerEl.value.style.transform = `translateY(${translate}px)`
}

const stopDragListeners = () => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

const onDragEnd = () => {
  stopDragListeners()
  if (!dragging || !drawerEl.value) return
  dragging = false
  const el = drawerEl.value

  const first = samples[0]
  const last = samples[samples.length - 1]
  const velocity = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0

  const shouldDismiss = currentDy > el.offsetHeight * 0.35 || velocity > 0.55
  if (shouldDismiss) {
    // Carry the finger's momentum out of the screen
    const remaining = Math.max(0, el.offsetHeight - currentDy)
    const duration = Math.min(0.4, Math.max(0.12, remaining / Math.max(velocity * 1000, 900)))
    // The inline transform stays put through Vue's leave transition (inline
    // beats the leave class), keeping the sheet offscreen until it unmounts.
    gsap.to(el, {
      y: el.offsetHeight,
      duration,
      ease: 'power1.in',
      onComplete: close,
    })
  } else {
    gsap.to(el, {
      y: 0,
      duration: prefersReducedMotion() ? 0.2 : 0.5,
      ease: prefersReducedMotion() ? 'power2.out' : 'elastic.out(0.9, 0.55)',
      clearProps: 'transform',
    })
  }
}

onUnmounted(() => {
  stopDragListeners()
  close()
})

// Points accumulated across every round (including the one in progress),
// ranked — the "who's actually winning" view the board itself can't show.
const totals = computed(() => {
  const span = Math.max(1, props.game.tiles.length - 1)
  return Object.values(props.game.players)
    .map(player => ({
      player,
      progress: player.currentPosition / span,
      total: props.game.rounds.reduce(
        (sum, round) => sum + (round.playerTurns[player.id]?.points.scored ?? 0),
        0
      ),
    }))
    .sort((a, b) => b.total - a.total)
})

// Everything here is already retained in Game.rounds — the drawer is a pure
// read of past rounds (the in-progress round is excluded). Newest first.
const pastRounds = computed(() =>
  props.game.rounds
    .slice(0, -1)
    .map((round, index) => {
      const players = Object.values(props.game.players)
      const challenge = round.groupChallenge
      const sketchCountry =
        '_type' in challenge && challenge._type === 'sketch-challenge'
          ? challenge.country
          : undefined
      const subjectIso =
        'country' in challenge && isValidISOCode(challenge.country) ? challenge.country : undefined

      const rows = players
        .map(player => ({
          player,
          points: round.playerTurns[player.id]?.points,
          distanceKm: round.groupAnswers[player.id]?.distanceKm,
          winner: false,
        }))
        .sort((a, b) => (b.points?.scored ?? -1) - (a.points?.scored ?? -1))

      // Crown everyone who matched the top score — ties share the round
      const top = rows[0]?.points?.scored ?? 0
      if (top > 0) {
        for (const row of rows) row.winner = row.points?.scored === top
      }

      return {
        number: index + 1,
        headline: roundChallengeHeadline(challenge),
        kindLabel: KIND_LABELS[roundChallengeKind(challenge)],
        country: subjectIso ? getCountry(subjectIso) : undefined,
        rows,
        sketches: sketchCountry
          ? players.flatMap(player => {
              const points = round.groupAnswers[player.id]?.sketch
              return points?.length ? [{ player, country: sketchCountry, points }] : []
            })
          : [],
      }
    })
    .reverse()
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
$hairline: hsla(215.7, 76.4%, 21.6%, 0.12);

.history-backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
  background: hsla(215.7, 76.4%, 21.6%, 0.25);
}

.history-drawer {
  position: fixed;
  z-index: 20;
  overflow-y: auto;
  padding: 2rem 2rem 2.4rem;

  // Desktop: side drawer on the right — flush right edge, rounded outer corner
  top: 0;
  right: 0;
  bottom: 0;
  width: min(40rem, 90vw);
  border-right: none;
  border-bottom-left-radius: 0;
}

// --- Header: eyebrow + serif title, like the scorecard's card-header ---
.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.8rem;
}

.drawer-title {
  margin: 0.2rem 0 0;
  font-size: 2.2rem;
  line-height: 1.1;
}

.close {
  flex-shrink: 0;
  width: 2.8rem;
  height: 2.8rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
  color: inherit;
  font-size: 1.9rem;
  line-height: 1;
  cursor: pointer;
  // Grid-centre the glyph, then a hair of bottom padding — the serif ×
  // rides high in its em box, so pure geometric centring reads off.
  display: grid;
  place-items: center;
  padding-bottom: 0.25rem;
}

// Grab handle: only exists in sheet mode (see the mobile block below)
.sheet-handle {
  display: none;
}

.empty {
  opacity: 0.7;
}

// Small-caps section labels carry the hierarchy (scorecard idiom)
.eyebrow {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.6rem;
}

// Rides on the global .chip pill; sized down to sit inside an eyebrow line
.kind-chip {
  padding: 0.05rem 0.8rem;
  font-size: 1.1rem;
  font-weight: normal;
  letter-spacing: 0.08em;
  color: var(--soft-blue);
}

// --- Standings: the leader gets the warm-sand wash the game uses for "you" ---
.standings {
  margin-bottom: 1.8rem;
}

.totals {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.6rem;
}

.total-row {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1.6rem 2.2rem 1fr auto auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.9rem;
  background: hsla(0, 0%, 100%, 0.5);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
  border-left: 0.3rem solid var(--player-color);

  // Same board-progress hairline as the status panel — one visual language
  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: calc(var(--progress, 0) * 100%);
    background: var(--player-color);
    opacity: 0.8;
  }

  &.leader {
    background: hsla(29.7, 79.9%, 72.7%, 0.22); // warm-sand wash
  }
}

.rank {
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  color: var(--dark-blue);
  opacity: 0.45;

  .leader & {
    opacity: 0.9;
  }
}

.total {
  font-size: 1.6rem;
  color: var(--dark-blue);
}

// --- Rounds: each one a translucent card, newest on top ---
.round {
  margin-bottom: 1.2rem;
  padding: 1.2rem 1.4rem 1.3rem;
  border-radius: 0.9rem;
  background: hsla(0, 0%, 100%, 0.5);
  border: 1px solid hsla(215.7, 76.4%, 21.6%, 0.08);
}

.round-header .eyebrow {
  margin-bottom: 0.4rem;
}

.headline {
  margin: 0 0 1rem;
  font-size: 1.7rem;
  line-height: 1.25;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.flag {
  width: 2.8rem;
  flex-shrink: 0;
  border: 0.1rem solid var(--text-color);

  &:deep(svg) {
    display: block;
  }
}

.scores {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.score-row {
  display: grid;
  grid-template-columns: 2rem 1fr auto auto;
  align-items: center;
  gap: 0.7rem;
  padding: 0.35rem 0.6rem;
  border-left: 0.3rem solid var(--player-color);
  border-radius: 0.5rem;

  &.winner {
    background: hsla(29.7, 79.9%, 72.7%, 0.22); // warm-sand wash
  }
}

.pawn {
  width: 2rem;
  height: 2rem;
}

.name {
  font-size: 1.35rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trophy {
  margin-left: 0.4rem;
  font-size: 1.2rem;
}

.detail {
  font-size: 1.15rem;
  color: var(--dark-blue);
  opacity: 0.55;
  white-space: nowrap;
}

.score {
  font-size: 1.45rem;
  color: var(--dark-blue);
}

.muted {
  font-size: 1.15rem;
  opacity: 0.5;
}

.sketches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.8rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed $hairline;
}

.sketch {
  margin: 0;

  figcaption {
    margin-top: 0.2rem;
    font-size: 1.1rem;
    text-align: center;
    opacity: 0.7;
  }
}

// --- Motion: backdrop fades, drawer slides, sections rise in with a stagger ---
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.3s ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

.drawer-enter-active {
  transition: transform 0.4s var(--ease-out-expressive, cubic-bezier(0.19, 1, 0.22, 1));
}
.drawer-leave-active {
  transition: transform 0.25s ease-in;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(105%);
}

.drawer-enter-active .round,
.drawer-enter-active .standings {
  animation: rise-in 0.45s var(--ease-out-expressive, cubic-bezier(0.19, 1, 0.22, 1)) both;
  animation-delay: calc(0.12s + var(--stagger, 0) * 0.05s);
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(1rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// Mobile: bottom sheet clear of the home indicator, rising from below
@media (max-width: $tablet) {
  .history-drawer {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: 70dvh;
    padding: 1.6rem 1.6rem calc(1.6rem + var(--safe-bottom));
    border: 0.1rem solid var(--text-color);
    border-bottom: none;
    border-top-left-radius: 1.9rem;
    border-top-right-radius: 1.9rem;
  }

  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateY(105%);
  }

  // The grab affordance: a small pill, with generous invisible hit area.
  // touch-action: none on the draggable surfaces hands the pan to us.
  .sheet-handle {
    display: flex;
    justify-content: center;
    margin: -0.8rem 0 0.4rem;
    padding: 0.8rem 0;
    touch-action: none;
    cursor: grab;

    &::after {
      content: '';
      width: 4rem;
      height: 0.4rem;
      border-radius: 999px;
      background: hsla(215.7, 76.4%, 21.6%, 0.2);
    }
  }

  .drawer-header {
    touch-action: none;
  }

  .sketches {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: opacity 0.2s ease;
  }
  .drawer-enter-from,
  .drawer-leave-to {
    transform: none;
    opacity: 0;
  }
  .drawer-enter-active .round,
  .drawer-enter-active .standings {
    animation: none;
  }
}
</style>
