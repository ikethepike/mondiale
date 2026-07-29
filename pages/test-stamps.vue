<template>
  <div class="stamps-review">
    <header class="bar">
      <h1>Verdict element — four prototypes</h1>
      <button class="replay" type="button" @click="cycle++">Replay animations</button>
    </header>

    <!-- 1 — Passport stamp -->
    <section class="option">
      <h2>1 · Passport stamp</h2>
      <p class="note">
        Travel-document ink: the stamp thumps down tilted beside the verdict. Hop dots keep
        previewing the board steps.
      </p>
      <div :key="`stamp-${cycle}`" class="pair">
        <div class="demo">
          <div class="verdict-row">
            <svg class="stamp won" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r="21" />
              <circle cx="24" cy="24" r="16.5" />
              <path d="M15.5 24.5l6 6 11-12" />
            </svg>
            <span class="verdict-text">Correct!</span>
          </div>
          <span class="hops"><i class="hop" /><i class="hop" /></span>
        </div>
        <div class="demo">
          <div class="verdict-row">
            <svg class="stamp lost" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r="21" />
              <circle cx="24" cy="24" r="16.5" />
              <path d="M17.5 17.5l13 13M30.5 17.5l-13 13" />
            </svg>
            <span class="verdict-text lost-text">Missed</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 2 — Pawn hop stage -->
    <section class="option">
      <h2>2 · Pawn hop stage</h2>
      <p class="note">
        The dots grow into a mini board: your pawn walks the exact steps the board is about to play.
        On a miss it stays put and tips over.
      </p>
      <div :key="`pawn-${cycle}`" class="pair">
        <div class="demo">
          <span class="verdict-text">Correct!</span>
          <div class="hop-stage">
            <span class="tile start" />
            <span class="tile mid" />
            <span class="tile end" />
            <svg class="mini-pawn walks" viewBox="0 0 68 105" aria-hidden="true">
              <path :d="PAWN_PATH" />
            </svg>
          </div>
        </div>
        <div class="demo">
          <span class="verdict-text lost-text">Missed</span>
          <div class="hop-stage">
            <span class="tile start" />
            <span class="tile mid dim" />
            <span class="tile end dim" />
            <svg class="mini-pawn tips" viewBox="0 0 68 105" aria-hidden="true">
              <path :d="PAWN_PATH" />
            </svg>
          </div>
        </div>
      </div>
    </section>

    <!-- 3 — Ribbon sweep -->
    <section class="option">
      <h2>3 · Ribbon sweep</h2>
      <p class="note">
        No pill: an angled banner sweeps across the map wash carrying the verdict in small caps. Big
        and theatrical.
      </p>
      <div :key="`ribbon-${cycle}`" class="pair stacked">
        <div class="demo wide">
          <div class="ribbon-frame">
            <div class="ribbon won-band"><span>Correct</span></div>
          </div>
        </div>
        <div class="demo wide">
          <div class="ribbon-frame">
            <div class="ribbon lost-band"><span>Missed</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4 — Medal rosette -->
    <section class="option">
      <h2>4 · Medal rosette</h2>
      <p class="note">
        A prize rosette unfurls — the ribbon tails ARE the earned steps (two steps, two tails, no
        numerals). A miss wilts to gray.
      </p>
      <div :key="`medal-${cycle}`" class="pair">
        <div class="demo">
          <span class="verdict-text">Correct!</span>
          <div class="rosette won-rosette">
            <svg class="medal" viewBox="0 0 48 48" aria-hidden="true">
              <circle class="scallop" cx="24" cy="24" r="20" />
              <circle cx="24" cy="24" r="14" />
              <path d="M17.5 24.5l4.5 4.5 8.5-9.5" />
            </svg>
            <span class="tails"><i class="tail" /><i class="tail" /></span>
          </div>
        </div>
        <div class="demo">
          <span class="verdict-text lost-text">Missed</span>
          <div class="rosette lost-rosette">
            <svg class="medal" viewBox="0 0 48 48" aria-hidden="true">
              <circle class="scallop" cx="24" cy="24" r="20" />
              <circle cx="24" cy="24" r="14" />
              <path d="M18.5 18.5l11 11M29.5 18.5l-11 11" />
            </svg>
            <span class="tails"><i class="tail wilted" /></span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<script lang="ts" setup>
// Throwaway comparison page for the ChallengeResult verdict element — the
// chosen option graduates into a real component, the rest (and this page)
// get deleted.
const cycle = ref(0)

const PAWN_PATH =
  'M24.3614 3.46005C13.4175 10.3189 11.6327 24.9318 20.5098 35.0122C23.0885 37.9424 22.311 45.5862 17.9516 60.1241C12.4776 78.3814 9.89058 84.2631 7.33383 84.2631C2.62903 84.2631 0.152093 89.0219 0.606198 97.1903L1.02728 104.769H34.0531H67.0789L67.5 97.1903C67.9541 89.0219 65.4772 84.2631 60.7724 84.2631C59.088 84.2631 57.4959 81.9622 55.6355 76.8386C51.0476 64.2041 47.2634 50.6561 46.3538 43.6091C45.6149 37.8788 45.9176 36.4618 48.3753 34.1778C52.5145 30.327 54.441 21.88 52.6989 15.229C49.483 2.95661 34.8567 -3.11738 24.3614 3.46005Z'
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

$won: hsl(170.5, 44%, 32%);

.stamps-review {
  gap: 2.4rem;
  display: flex;
  min-height: 100vh;
  padding: 3rem;
  flex-flow: column nowrap;
  background: milk();
  color: var(--dark-blue);
}

.bar {
  gap: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;

  h1 {
    margin: 0;
    font-size: 2.4rem;
  }
}

.replay {
  cursor: pointer;
  border: none;
  color: #fff;
  font: inherit;
  font-size: 1.4rem;
  padding: 0.8rem 1.6rem;
  border-radius: 0.8rem;
  background: var(--black, #111);
}

.option {
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.8rem;
  }
  .note {
    margin: 0 0 1.2rem;
    opacity: 0.65;
    font-size: 1.35rem;
    max-width: 52rem;
  }
}

.pair {
  gap: 1.6rem;
  display: flex;
  flex-wrap: wrap;

  &.stacked {
    flex-flow: column nowrap;
  }
}

.demo {
  gap: 1.2rem;
  display: flex;
  min-width: 30rem;
  min-height: 13rem;
  padding: 2rem;
  align-items: center;
  justify-content: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  border: 0.1rem solid ink(0.15);
  background: #fffbf5;

  &.wide {
    width: 100%;
    min-width: 0;
  }
}

.verdict-row {
  gap: 1.4rem;
  display: flex;
  align-items: center;
}

.verdict-text {
  font-size: 2.6rem;
  font-weight: bold;

  &.lost-text {
    color: var(--hior-ange, hsl(18, 80%, 44%));
  }
}

// --- 1 · stamp ---------------------------------------------------------------
.stamp {
  width: 6.4rem;
  height: 6.4rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-8deg);
  animation: stamp-thump 0.45s var(--ease-out-expressive) both;
  animation-delay: 0.25s;

  &.won {
    color: $won;
  }
  &.lost {
    color: flame();
  }
}

@keyframes stamp-thump {
  from {
    opacity: 0;
    transform: scale(1.8) rotate(-16deg);
  }
  60% {
    opacity: 1;
    transform: scale(0.92) rotate(-8deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(-8deg);
  }
}

.hops {
  gap: 0.8rem;
  display: flex;

  .hop {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--dark-blue);
    animation: hop-land 0.5s var(--ease-out-expressive) both;

    &:nth-child(1) {
      animation-delay: 0.75s;
    }
    &:nth-child(2) {
      animation-delay: 0.91s;
    }
  }
}

@keyframes hop-land {
  from {
    opacity: 0;
    transform: translateY(-1.6rem) scale(0.6);
  }
  65% {
    opacity: 1;
    transform: translateY(0.2rem) scale(1.08);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

// --- 2 · pawn hop stage ------------------------------------------------------
.hop-stage {
  position: relative;
  width: 13rem;
  height: 4.6rem;

  .tile {
    left: 0;
    bottom: 0;
    width: 1.2rem;
    height: 0.35rem;
    position: absolute;
    border-radius: 0.2rem;
    background: ink(0.3);

    &.mid {
      left: 5.4rem;
    }
    &.end {
      left: 10.8rem;
      background: $won;
    }
    &.dim {
      background: ink(0.15);

      &.end {
        background: ink(0.15);
      }
    }
  }
}

.mini-pawn {
  left: 0;
  bottom: 0.45rem;
  width: 1.9rem;
  height: 2.9rem;
  position: absolute;
  fill: var(--dark-blue);

  &.walks {
    animation: pawn-walk 1.1s var(--ease-smooth, ease-in-out) both;
    animation-delay: 0.35s;
  }

  &.tips {
    transform-origin: 70% 95%;
    animation: pawn-tip 0.7s var(--ease-out-expressive) both;
    animation-delay: 0.45s;
  }
}

@keyframes pawn-walk {
  0% {
    transform: translate(0, 0);
  }
  22% {
    transform: translate(2.7rem, -2rem);
  }
  44% {
    transform: translate(5.4rem, 0);
  }
  56% {
    transform: translate(5.4rem, 0);
  }
  78% {
    transform: translate(8.1rem, -2rem);
  }
  100% {
    transform: translate(10.8rem, 0);
  }
}

@keyframes pawn-tip {
  0% {
    transform: rotate(0);
  }
  55% {
    transform: rotate(64deg);
  }
  70% {
    transform: rotate(58deg);
  }
  100% {
    transform: rotate(61deg);
  }
}

// --- 3 · ribbon sweep --------------------------------------------------------
.ribbon-frame {
  width: 100%;
  overflow: hidden;
  padding: 1.2rem 0;
}

.ribbon {
  padding: 1.1rem 0;
  text-align: center;
  transform: rotate(-2.5deg) scale(1.04);
  animation: ribbon-sweep 0.55s var(--ease-out-expressive) both;
  animation-delay: 0.25s;

  span {
    color: #fff;
    font-size: 1.9rem;
    font-weight: bold;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    animation: ribbon-text 0.4s ease-out both;
    animation-delay: 0.6s;
    display: inline-block;
  }

  &.won-band {
    background: $won;
  }
  &.lost-band {
    background: flame();
  }
}

@keyframes ribbon-sweep {
  from {
    transform: translateX(-112%) rotate(-2.5deg) scale(1.04);
  }
  to {
    transform: translateX(0) rotate(-2.5deg) scale(1.04);
  }
}

@keyframes ribbon-text {
  from {
    opacity: 0;
    letter-spacing: 0.55em;
  }
  to {
    opacity: 1;
    letter-spacing: 0.34em;
  }
}

// --- 4 · medal rosette -------------------------------------------------------
.rosette {
  gap: 0;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .medal {
    width: 6.2rem;
    height: 6.2rem;
    z-index: 1;
    fill: #fffbf5;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: medal-pop 0.5s var(--ease-out-expressive) both;
    animation-delay: 0.25s;

    .scallop {
      fill: none;
      stroke-dasharray: 3.2 3;
    }
  }

  &.won-rosette {
    color: $won;
  }
  &.lost-rosette {
    color: ink(0.45);
  }

  .tails {
    gap: 0.7rem;
    display: flex;
    margin-top: -0.5rem;
  }

  .tail {
    width: 1.3rem;
    height: 2.6rem;
    background: $won;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
    transform-origin: top;
    animation: tail-unfurl 0.4s var(--ease-out-expressive) both;

    &:nth-child(1) {
      animation-delay: 0.7s;
    }
    &:nth-child(2) {
      animation-delay: 0.84s;
    }

    &.wilted {
      background: ink(0.3);
      transform: rotate(14deg);
      animation-name: tail-wilt;
      animation-delay: 0.7s;
    }
  }
}

@keyframes medal-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  70% {
    opacity: 1;
    transform: scale(1.12);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes tail-unfurl {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

@keyframes tail-wilt {
  from {
    transform: scaleY(0) rotate(0);
  }
  to {
    transform: scaleY(0.8) rotate(14deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stamp,
  .hop,
  .mini-pawn,
  .ribbon,
  .ribbon span,
  .medal,
  .tail {
    animation: none;
  }
}
</style>
