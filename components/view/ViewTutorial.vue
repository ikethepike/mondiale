<template>
  <ModalWrapper>
    <article class="pane tutorial-card tr tl decorator-bottom">
      <form class="pane-content" @submit.prevent="closeTutorial">
        <header class="tutorial-header">
          <span class="eyebrow">How to play</span>
          <h1>Three phases, one race</h1>
          <p class="lead">
            Each round loops through the same three phases — master all three to win.
          </p>
        </header>

        <!-- The journey: three phase cards linked by drawing-in connectors -->
        <ol class="journey">
          <li
            v-for="(phase, index) in phases"
            :key="phase.key"
            class="phase"
            :class="phase.key"
            :style="{ '--stagger': `${index * 0.12}s` }"
          >
            <span class="phase-index">{{ index + 1 }}</span>
            <span class="phase-icon">
              <!-- Group challenge: a ranking of descending bars -->
              <svg v-if="phase.key === 'group'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="4"
                  rx="1.2"
                  fill="currentColor"
                  opacity="0.35"
                />
                <rect
                  x="3"
                  y="10.5"
                  width="14"
                  height="4"
                  rx="1.2"
                  fill="currentColor"
                  opacity="0.65"
                />
                <rect x="3" y="16" width="9" height="4" rx="1.2" fill="currentColor" />
              </svg>
              <!-- Movement: a pawn on a tile track -->
              <svg
                v-else-if="phase.key === 'movement'"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 20h18"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  opacity="0.4"
                />
                <circle cx="7" cy="20" r="1.6" fill="currentColor" opacity="0.4" />
                <circle cx="12" cy="20" r="1.6" fill="currentColor" opacity="0.4" />
                <circle cx="17" cy="20" r="1.6" fill="currentColor" opacity="0.4" />
                <path
                  d="M12 4c2 0 3.4 1.5 3.4 3.4 0 1.4-.8 2.4-1.7 3.1.9.5 1.5 1.3 1.5 2.6V15H8.8v-1.9c0-1.3.6-2.1 1.5-2.6-.9-.7-1.7-1.7-1.7-3.1C8.6 5.5 10 4 12 4Z"
                  fill="currentColor"
                />
              </svg>
              <!-- Gauntlet: a locked gate -->
              <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect
                  x="5"
                  y="10"
                  width="14"
                  height="10"
                  rx="1.6"
                  fill="currentColor"
                  opacity="0.35"
                />
                <path
                  d="M8 10V7.5a4 4 0 0 1 8 0V10"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
                <circle cx="12" cy="15" r="1.6" fill="currentColor" />
              </svg>
            </span>
            <strong class="phase-title">{{ phase.title }}</strong>
            <span class="phase-hook">{{ phase.hook }}</span>
          </li>
        </ol>

        <p class="tie-in">
          Score big in the group challenge to <strong>hop further</strong> — but a gate blocks your
          path until you beat it.
        </p>

        <nav class="tutorial-nav">
          <!-- The roster: every player standing together, you flagged with an
               arced "this is you!" pointer. Hovering any pawn reveals its
               name and (via :has) hides the you-label so they don't overlap. -->
          <TransitionGroup tag="div" name="pawn-arrive" class="roster" appear>
            <div
              v-for="player in allPlayers"
              :key="player.id"
              class="roster-pawn"
              :class="{ 'is-you': player.id === playerId }"
            >
              <PlayerPawn class="pawn" :player="player" />
              <span class="pawn-name">{{ player.name || 'Joining…' }}</span>

              <template v-if="player.id === playerId">
                <svg class="you-arrow" viewBox="0 0 60 70" fill="none" aria-hidden="true">
                  <!-- Arced shaft sweeping from the label down onto the pawn,
                       ending on a vertical tangent so it arrives straight down -->
                  <path
                    d="M6 9C36 0 54 22 36 44 32.5 48.2 30.5 51.5 30 57"
                    stroke="currentColor"
                    stroke-width="3.4"
                    stroke-linecap="round"
                    fill="none"
                  />
                  <!-- Arrowhead: an open V pointing straight down, tip meeting
                       the shaft's end, barbs splayed evenly up-and-out -->
                  <path
                    d="M23.5 50.5 30 58.5 36.5 50.5"
                    stroke="currentColor"
                    stroke-width="3.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
                <span class="you-label">This is you!</span>
              </template>
            </div>
          </TransitionGroup>

          <ButtonFilled class="start-button">Let's go</ButtonFilled>
        </nav>
      </form>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const { gameStore, update, playerId } = useClientEvents()

// Every player in the game, you first so your pawn (with the pointer) leads
const allPlayers = computed(() => {
  const players = Object.values(gameStore.game?.players || {})
  return [...players].sort((a, b) =>
    a.id === playerId.value ? -1 : b.id === playerId.value ? 1 : 0
  )
})

// The three game phases. Glyphs are inline SVG in the template (keyed by
// `key`), recoloured per phase via currentColor.
const phases = [
  { key: 'group', title: 'Group Challenge', hook: 'Rank, sort, out-guess everyone' },
  { key: 'movement', title: 'Movement', hook: 'Score points, hop further' },
  { key: 'gate', title: 'The Gauntlet', hook: 'Beat the gates to break through' },
] as const

const closeTutorial = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'group-challenge'
  }

  update({ event: 'close-tutorial' })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.tutorial-card {
  margin: auto auto 0 auto;
  max-width: 58rem;
}

.tutorial-header {
  margin-bottom: 2rem;
}

.eyebrow {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
  margin-bottom: 0.6rem;
}

h1 {
  margin: 0;
  font-size: 3rem;
  color: var(--dark-blue);
}

.lead {
  margin: 0.8rem 0 0;
  opacity: 0.75;
  font-size: 1.6rem;
}

// --- The three-phase journey ------------------------------------------------
.journey {
  // Wide gap gives the chevron connectors room to breathe between cards
  gap: 2.6rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  grid-template-columns: repeat(3, 1fr);
}

.phase {
  gap: 0.7rem;
  display: flex;
  padding: 1.8rem 1.2rem 1.6rem;
  position: relative;
  text-align: center;
  align-items: center;
  border-radius: 1.4rem;
  flex-flow: column nowrap;
  border: 0.15rem solid var(--phase-tint);
  background: var(--phase-wash);

  // Each phase owns a distinct colour from the in-game language — the washes
  // are kept saturated enough to read as mint / sand / coral, not grey.
  &.group {
    --phase-ink: var(--soft-blue);
    --phase-disc: hsla(197.6, 51.2%, 41.8%, 0.16);
    --phase-tint: hsla(197.6, 51.2%, 41.8%, 0.45);
    --phase-wash: hsla(197.6, 55%, 55%, 0.12);
  }
  &.movement {
    --phase-ink: hsl(170.5, 40%, 38%);
    --phase-disc: hsla(170.5, 34.7%, 55.1%, 0.24);
    --phase-tint: hsla(170.5, 34.7%, 50%, 0.55);
    --phase-wash: hsla(170.5, 40%, 60%, 0.16);
  }
  &.gate {
    --phase-ink: hsl(9.8, 68%, 50%);
    --phase-disc: hsla(9.8, 81.3%, 60.2%, 0.18);
    --phase-tint: hsla(9.8, 81.3%, 60.2%, 0.45);
    --phase-wash: hsla(20, 82%, 66%, 0.16);
  }

  // Chunky chevron connectors, centered in the gap between cards, in the
  // leading card's colour. Gap is 2.6rem, chevron ~1.3rem, so -1.95rem sits
  // it centered with clear air on both sides.
  &:not(:last-child)::after {
    content: '';
    top: 50%;
    right: -1.95rem;
    z-index: 2;
    width: 1.3rem;
    height: 1.3rem;
    position: absolute;
    border-top: 0.28rem solid var(--phase-ink);
    border-right: 0.28rem solid var(--phase-ink);
    opacity: 0.55;
    transform: translateY(-50%) rotate(45deg);
  }

  // Staggered entrance, phase by phase
  opacity: 0;
  animation: phase-in var(--motion-base) var(--ease-out-expressive) forwards;
  animation-delay: var(--stagger, 0s);
}

.phase-index {
  top: 1rem;
  left: 1.2rem;
  opacity: 0.55;
  font-size: 1.4rem;
  font-weight: bold;
  position: absolute;
  color: var(--phase-ink);
}

// The glyph sits in a soft colour disc so it reads as an emblem, not a stray
.phase-icon {
  display: grid;
  width: 5rem;
  height: 5rem;
  place-items: center;
  border-radius: 50%;
  color: var(--phase-ink);
  background: var(--phase-disc);
  :deep(svg) {
    width: 2.8rem;
    height: 2.8rem;
  }
}

.phase-title {
  font-size: 1.7rem;
  color: var(--dark-blue);
}

.phase-hook {
  opacity: 0.72;
  font-size: 1.3rem;
  line-height: 1.35;
}

@keyframes phase-in {
  from {
    opacity: 0;
    transform: translateY(1.2rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.tie-in {
  margin: 1.8rem 0 0;
  font-size: 1.5rem;
  line-height: 1.5;
  strong {
    color: var(--dark-blue);
  }
}

// Roster bottom-left, Start button bottom-right. Both children align their
// bottoms to the nav baseline, so the pawns' feet sit level with the button.
.tutorial-nav {
  gap: 1.5rem;
  display: flex;
  padding-top: 3rem;
  align-items: flex-end;
  justify-content: space-between;
}

// The pawns stand shoulder to shoulder; extra top room holds the you-pointer.
// Its bottom is the nav baseline (= the button's bottom).
.roster {
  gap: 0.6rem;
  display: flex;
  padding-top: 4.5rem;
  position: relative;
  align-items: flex-end;
}

.roster-pawn {
  display: flex;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;

  .pawn {
    width: 3.2rem;
    height: auto;
    display: block;
  }

  // Name hidden by default; appears on hover of THIS pawn
  .pawn-name {
    left: 50%;
    bottom: -1.9rem;
    opacity: 0;
    position: absolute;
    font-size: 1.2rem;
    font-weight: 600;
    white-space: nowrap;
    color: var(--dark-blue);
    pointer-events: none;
    transform: translateX(-50%) translateY(0.3rem);
    transition:
      opacity var(--motion-quick) var(--ease-out-expressive),
      transform var(--motion-quick) var(--ease-out-expressive);
  }

  &:hover .pawn-name {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

// The arced "this is you!" pointer over your pawn. The SVG's horizontal
// centre (viewBox x=30 of 60, where the arrowhead tip sits) is aligned to the
// pawn's centre so the tip lands squarely on the head.
.you-arrow {
  top: -3.6rem;
  left: 50%;
  width: 3.4rem;
  height: 4rem;
  position: absolute;
  pointer-events: none;
  transform: translateX(-50%);
  color: var(--soft-blue);
}

.you-label {
  top: -5.6rem;
  left: 50%;
  font-size: 1.3rem;
  font-weight: bold;
  position: absolute;
  white-space: nowrap;
  color: var(--soft-blue);
  pointer-events: none;
  transform: translateX(-42%) rotate(-4deg);
  transition: opacity var(--motion-quick) var(--ease-out-expressive);
}

// Hovering ANY pawn in the roster retires the you-pointer so the hovered
// name has the stage (and the two never overlap)
.roster:hover .you-arrow,
.roster:hover .you-label {
  opacity: 0;
}

.start-button {
  margin-left: auto;
}

// Pawns pop in as other players finish reading the tutorial
.pawn-arrive-enter-from {
  opacity: 0;
  transform: translateY(100%);
}
.pawn-arrive-enter-active,
.pawn-arrive-move {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}

@media (prefers-reduced-motion: reduce) {
  .phase {
    opacity: 1;
    animation: none;
  }
}

@media screen and (max-width: $tablet) {
  // Room to breathe: the card fills the large viewport (its surface running
  // on beneath the URL bar, like the lobby) and its sections spread out
  // vertically instead of packing to content height.
  .tutorial-card {
    display: flex;
    min-height: 100lvh;
    border-bottom: none;

    > .pane-content {
      flex: 1;
      display: flex;
      flex-flow: column nowrap;
      justify-content: space-evenly;
      padding-bottom: calc(var(--safe-bottom) + 7rem);
    }
  }

  .journey {
    grid-template-columns: 1fr;
  }
  // Vertical layout: connectors point down instead of right
  .phase:not(:last-child)::after {
    top: auto;
    right: 50%;
    bottom: -1.95rem;
    transform: translateX(50%) rotate(135deg);
  }

  // Lean rows: the emblem sits to the LEFT of the copy instead of stacking
  // above it, so the three cards read as a compact list.
  .phase {
    column-gap: 1.4rem;
    row-gap: 0.2rem;
    display: grid;
    text-align: left;
    align-items: center;
    padding: 1.2rem 1.4rem 1.2rem 3.4rem;
    grid-template-columns: auto 1fr;
  }

  .phase-index {
    top: 50%;
    left: 1.2rem;
    transform: translateY(-50%);
  }

  .phase-icon {
    width: 4.2rem;
    height: 4.2rem;
    grid-row: 1 / span 2;

    :deep(svg) {
      width: 2.4rem;
      height: 2.4rem;
    }
  }

  .phase-title {
    align-self: end;
  }
  .phase-hook {
    align-self: start;
  }
}

@media screen and (min-width: $tablet) {
  .tutorial-card {
    margin: auto;
  }
}

// Touch devices have no hover: show every pawn's name statically beneath it
// (the you-pointer keeps marking your own pawn). Space the pawns out so
// neighbouring names don't run into each other, and trim long ones.
@media (hover: none) {
  .roster {
    gap: 1.6rem;
  }

  .roster-pawn .pawn-name {
    max-width: 7rem;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 1;
    transform: translateX(-50%);
  }
}
</style>
