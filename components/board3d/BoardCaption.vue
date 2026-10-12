<template>
  <Transition name="caption">
    <div v-if="headline" class="board-caption" :class="{ 'has-aside': !!shownAside }">
      <div class="caption-head" role="status" aria-live="polite">
        <Transition name="caption-swap">
          <div v-if="headline === 'setback'" key="setback" class="caption-line">
            <span class="lead" aria-hidden="true"><span class="setback-dot" /></span>
            <p class="copy">
              <strong class="setback">Gate held</strong>
              <span class="tail">{{ setback && setbackTail(setback) }}</span>
            </p>
          </div>
          <div v-else-if="headline === 'waiting'" key="waiting" class="caption-line">
            <TransitionGroup tag="span" name="pawn" class="lead pawns" aria-hidden="true">
              <PlayerPawn
                v-for="player in waiting.slice(0, 3)"
                :key="player.id"
                class="pawn ambient-loop"
                :player="player"
              />
            </TransitionGroup>
            <p class="copy">
              <strong>{{ waitingTitle(waiting) }}</strong>
              <span class="tail">{{ waitingTail(waiting) }}</span>
            </p>
            <ChallengeTimerRadial
              v-if="clock"
              class="caption-clock"
              aria-hidden="true"
              :value="clock.seconds"
              :total="clock.totalSeconds"
            />
            <button
              v-if="waiting[0]"
              class="watch"
              type="button"
              :aria-label="`Watch ${playerDisplayName(waiting[0])}`"
              @click="watchSeat(waiting[0].id)"
            >
              <span class="watch-label">Watch {{ playerDisplayName(waiting[0]) }}</span>
            </button>
          </div>
          <div v-else key="done" class="caption-line">
            <span class="lead" aria-hidden="true">
              <svg class="done-tick" viewBox="0 0 22 22">
                <path pathLength="1" d="M5 11.5l4 4 8-9" />
              </svg>
            </span>
            <p class="copy">
              <strong>Everyone’s done</strong>
              <span class="tail">next round coming up</span>
            </p>
          </div>
        </Transition>
      </div>

      <div class="aside-fold">
        <div class="aside-clip">
          <Transition name="caption-swap">
            <div
              v-if="shownAside"
              :key="shownAside.id"
              class="aside"
              :style="shownAside.dwellMs ? { '--dwell': `${shownAside.dwellMs}ms` } : undefined"
            >
              <span class="eyebrow kicker">
                <span
                  v-if="shownAside.color"
                  class="kicker-pawn"
                  :style="{ background: shownAside.color }"
                />
                {{ shownAside.kicker }}
              </span>
              <p class="aside-text">{{ shownAside.text }}</p>
              <span v-if="shownAside.source || showFactsToggle" class="aside-foot">
                <span v-if="shownAside.source" class="source-line">{{ shownAside.source }}</span>
                <button
                  v-if="showFactsToggle"
                  class="facts-toggle"
                  type="button"
                  @click="toggleFacts"
                >
                  {{ factsHidden ? 'Show fun facts' : 'Hide fun facts' }}
                </button>
              </span>
              <span v-if="shownAside.kind === 'fact'" class="dwell" aria-hidden="true" />
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </Transition>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import { setbackTail, waitingTail, waitingTitle } from '~~/lib/board-feed'
import { playerDisplayName } from '~~/lib/player'
import { useBoardFeed } from '~~/lib/use-board-feed'

// The settled seat's one caption over the board: what just happened to you,
// who the table is waiting on, and an aside that keeps the wait company.
const { headline, waiting, setback, clock, aside, factsHidden, toggleFacts, watchSeat } =
  useBoardFeed()

const shownAside = computed(() => (headline.value === 'waiting' ? aside.value : undefined))

const showFactsToggle = computed(() => {
  const kind = shownAside.value?.kind
  return kind === 'fact' || (kind === 'recap' && factsHidden.value)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.board-caption {
  @include caption-surface($cardRadius);
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(1.4rem + var(--safe-bottom));
  z-index: 3;
  width: min(56rem, calc(100vw - 2.4rem));
  margin-inline: auto;
  box-shadow: 0 1rem 3rem -1.4rem ink(0.35);
}

.caption-enter-active {
  transition:
    opacity var(--motion-slow) var(--ease-out-expressive),
    transform var(--motion-slow) var(--ease-out-expressive);
}

.caption-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-in-soft),
    transform var(--motion-base) var(--ease-in-soft);
}

.caption-enter-from {
  opacity: 0;
  transform: translateY(1.4rem);
}

.caption-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}

.caption-head,
.aside-clip {
  display: grid;

  > * {
    grid-area: 1 / 1;
  }
}

.caption-head {
  padding: 1rem 1.2rem 1rem 1.4rem;
}

.caption-swap-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-smooth) 0.06s,
    transform var(--motion-base) var(--ease-out-expressive) 0.06s,
    filter var(--motion-base) var(--ease-smooth) 0.06s;
}

.caption-swap-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-smooth),
    transform var(--motion-base) var(--ease-smooth),
    filter var(--motion-base) var(--ease-smooth);
}

.caption-swap-enter-from {
  opacity: 0;
  transform: translateY(0.6rem);
  filter: blur(0.2rem);
}

.caption-swap-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
  filter: blur(0.2rem);
}

.caption-line {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-height: 4rem;
}

.lead {
  flex: none;
  width: 3.6rem;
  display: grid;
  place-items: center;
}

.setback-dot {
  position: relative;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: flame();

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 0.15rem solid flame();
    opacity: 0;
    animation: setback-ripple 1.2s var(--ease-out-expressive) 0.2s 2;
  }
}

@keyframes setback-ripple {
  from {
    opacity: 0.8;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(3.2);
  }
}

.pawns {
  display: flex;
  justify-content: center;
}

.pawn {
  width: 1.4rem;
  height: 2.2rem;
  margin-left: -0.3rem;
  transform-origin: bottom center;
  animation: pawn-breathe 2.4s var(--ease-smooth) infinite;
  transition:
    opacity var(--motion-base) var(--ease-smooth),
    width var(--motion-base) var(--ease-out-expressive),
    margin var(--motion-base) var(--ease-out-expressive);

  &:first-child {
    margin-left: 0;
  }

  &:nth-child(2) {
    animation-delay: -0.8s;
  }

  &:nth-child(3) {
    animation-delay: -1.6s;
  }
}

.pawn-enter-from,
.pawn-leave-to {
  width: 0;
  margin-left: 0;
  opacity: 0;
}

@keyframes pawn-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}

.done-tick {
  width: 2.2rem;
  height: 2.2rem;

  path {
    fill: none;
    stroke: hsl(170.5, 30%, 38%);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: stroke-draw var(--motion-slow) var(--ease-out-expressive) 0.15s forwards;
  }
}

.copy {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.35;
}

.setback {
  color: flame(1, 44%);
}

.tail {
  opacity: 0.7;

  &::before {
    content: '·';
    margin: 0 0.7rem 0 0.6rem;
  }
}

.caption-clock {
  flex: none;
  --clock-size: 3.6rem;
  --clock-seconds-size: 1.2rem;
}

.watch {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 4rem;
  padding: 0 1.4rem 0 1.1rem;
  border: 0.1rem solid ink(0.2);
  border-radius: 2rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1.3rem;
  cursor: pointer;
  transition: background var(--motion-quick) var(--ease-smooth);

  &::before {
    content: '';
    width: 1.6rem;
    height: 1.6rem;
    background: currentColor;
    mask: url('~/assets/icons/eye.svg') no-repeat center / contain;
  }

  &:hover {
    background: ink(0.07);
  }
}

.aside-fold {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--motion-base) var(--ease-out-expressive);

  .has-aside & {
    grid-template-rows: 1fr;
  }
}

.aside-clip {
  min-height: 0;
  overflow: hidden;
}

.aside {
  position: relative;
  margin: 0 1.4rem;
  padding: 0.9rem 0 1.2rem;
  border-top: 0.1rem solid $hairline;
}

.kicker {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.3rem;
  font-size: 1.1rem;
}

.kicker-pawn {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
}

.aside-text {
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.42;
}

.aside-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.4rem;
}

.facts-toggle {
  margin-left: auto;
  padding: 0.6rem 0;
  border: none;
  background: none;
  color: ink(0.6);
  font: inherit;
  font-size: 1.15rem;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;

  &:hover {
    color: ink();
  }
}

.dwell {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.1rem;
  background: ink(0.22);
  transform-origin: left;
  animation: dwell-fill var(--dwell) linear forwards;
}

@keyframes dwell-fill {
  from {
    transform: scaleX(0);
  }
}

@media (max-width: $tablet) {
  .board-caption {
    bottom: calc(1rem + var(--safe-bottom));
    width: calc(100vw - 2rem);
  }

  .caption-head {
    padding: 0.8rem 0.8rem 0.8rem 1rem;
  }

  .caption-line {
    gap: 1rem;
  }

  .lead {
    width: 3rem;
  }

  .copy {
    display: flex;
    flex-direction: column;
    font-size: 1.4rem;
    line-height: 1.3;
  }

  .tail {
    font-size: 1.25rem;

    &::before {
      content: none;
    }
  }

  .watch {
    width: 4.4rem;
    height: 4.4rem;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
  }

  .watch-label {
    display: none;
  }

  .aside {
    margin: 0 1.2rem;
  }

  .aside-text {
    font-size: 1.3rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setback-dot::after {
    animation: none;
  }
}
</style>
