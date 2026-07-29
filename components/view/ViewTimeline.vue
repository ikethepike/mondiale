<template>
  <div v-if="challenge" class="timeline-round challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="alert"
      :kicker="`Round ${currentRound?.number ?? 1} — Timeline`"
      :title="openerTitle"
      :stakes="stakes"
      @done="begin()"
    />

    <!-- The shared round clock, re-swept on every turn handoff. -->
    <ChallengeTimerRadial
      v-if="clockRunning"
      :key="`turn-${state!.turn}`"
      class="round-clock"
      :value="secondsOnClock"
      :total="challenge.turnSeconds"
    />

    <ChallengePrompt>
      <h1 class="map-caption">{{ headline }}</h1>
      <!-- The handoff beat: the old name lifts away, the next settles in. -->
      <Transition name="caption" mode="out-in">
        <span v-if="!finished && !revealing" :key="activeId" class="map-caption sub turn-line">
          <span class="chip" :style="{ background: activePlayer?.color }" />
          <span>{{ turnLabel }}</span>
        </span>
      </Transition>
    </ChallengePrompt>

    <!-- Centre stage: the drawn card, its post-placement story, or the scorecard. -->
    <section class="stage">
      <Transition name="dossier" mode="out-in">
        <TimelineReveal
          v-if="finished"
          key="reveal"
          class="reveal"
          :challenge="challenge"
          :players="gameStore.game?.players ?? {}"
          :player-id="gameStore.playerId"
        />

        <!-- The teaching beat: the card's year, story and photo, told to the
             whole table after every placement — right or wrong. -->
        <article
          v-else-if="revealing && story"
          :key="`story-${state!.turn}`"
          class="pane tr decorator-bottom card story"
          :class="story.correct ? 'won' : 'lost'"
        >
          <figure v-if="story.event.image" class="card-photo">
            <img :src="story.event.image" :alt="story.event.name" />
            <figcaption v-if="photoCredit(story.event)" class="credit">
              {{ photoCredit(story.event) }}
            </figcaption>
          </figure>
          <div class="card-body">
            <span class="eyebrow verdict">{{ story.verdict }}</span>
            <p class="story-year">{{ formatEventYear(story.event.year) }}</p>
            <h2 class="card-title">{{ story.event.name }}</h2>
            <p class="card-description">{{ story.event.description }}</p>
          </div>
        </article>

        <article
          v-else-if="drawnEvent"
          :key="`card-${state!.card}`"
          class="pane tr decorator-bottom card"
        >
          <figure v-if="drawnEvent.image" class="card-photo">
            <img :src="drawnEvent.image" :alt="drawnEvent.name" />
            <figcaption v-if="photoCredit(drawnEvent)" class="credit">
              {{ photoCredit(drawnEvent) }}
            </figcaption>
          </figure>
          <div class="card-body">
            <span class="eyebrow">
              {{ EVENT_KIND_COPY[drawnEvent.kind] }} ·
              {{ countryName(getCountry(drawnEvent.country)) }}
            </span>
            <h2 class="card-title">{{ drawnEvent.name }}</h2>
            <p class="card-ask">{{ askLine }}</p>
          </div>
          <span class="year-badge" aria-hidden="true">?</span>
        </article>
      </Transition>
    </section>

    <!-- The shared line: every placed card in order, slots between them. -->
    <footer>
      <div class="line-frame">
        <span class="direction">{{ isPhone ? '↑ Earlier' : '← Earlier' }}</span>
        <!-- Keyed group so a filed card presses IN while its neighbours
             glide apart (FLIP moves), instead of the line snapping. -->
        <TransitionGroup ref="lineEl" tag="ol" name="line" class="line">
          <li
            v-for="item in lineItems"
            :key="item.key"
            :class="
              item.type === 'gap'
                ? 'gap'
                : {
                    stop: true,
                    fresh: item.slug === freshSlug,
                    won: item.slug === freshSlug && lastPlacement?.correct,
                    lost: item.slug === freshSlug && lastPlacement && !lastPlacement.correct,
                  }
            "
            :data-slot="item.type === 'gap' ? item.slot : undefined"
            :data-stop="item.slug"
          >
            <template v-if="item.type === 'gap'">
              <button
                v-if="canPlace"
                class="slot"
                :class="{ selected: selectedSlot === item.slot }"
                :disabled="pending"
                :aria-label="slotLabel(item.slot)"
                @click="place(item.slot)"
              />
              <span v-else class="tick" aria-hidden="true" />
            </template>
            <template v-else>
              <img
                v-if="timelineEvent(item.slug!)?.image"
                class="stop-photo"
                :src="timelineEvent(item.slug!)!.image"
                :alt="timelineEvent(item.slug!)!.name"
              />
              <span class="stop-year">
                {{ formatEventYear(timelineEvent(item.slug!)?.year ?? 0) }}
              </span>
              <span class="stop-name">{{ timelineEvent(item.slug!)?.name ?? item.slug }}</span>
            </template>
          </li>
        </TransitionGroup>
        <span class="direction">{{ isPhone ? '↓ Later' : 'Later →' }}</span>
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import TimelineReveal from '~/components/challenge/TimelineReveal.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import {
  activeTimelinePlayerId,
  drawnCard,
  EVENT_KIND_COPY,
  formatEventYear,
  perCardPoints,
  slotDensityFraction,
  timelineEvent,
} from '~~/lib/timeline'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useIsPhone } from '~~/lib/use-viewport'
import { playerDisplayName, seatLabel } from '~~/lib/player'
import type { EventEntry } from '~~/generators/create-events-file'

// A card table, not a map question — the board blanks out underneath.
const { challenge, currentRound, showInterstitial, begin, gameStore, update, registerCleanup } =
  useGroupChallenge('timeline-challenge')

const isPhone = useIsPhone()

const state = computed(() => challenge.value?.state)
const placed = computed(() => state.value?.placed ?? [])
const finished = computed(() => !!state.value?.finished)
const revealing = computed(() => !finished.value && !!state.value?.revealing)
const activeId = computed(() => (state.value ? activeTimelinePlayerId(state.value) : undefined))
const activePlayer = computed(() =>
  activeId.value ? gameStore.game?.players[activeId.value] : undefined
)
const myTurn = computed(
  () => !finished.value && !revealing.value && activeId.value === gameStore.playerId
)
const canPlace = computed(() => myTurn.value && !showInterstitial.value)

const drawnSlug = computed(() => (state.value ? drawnCard(state.value) : undefined))
const drawnEvent = computed(() => (drawnSlug.value ? timelineEvent(drawnSlug.value) : undefined))
const lastPlacement = computed(() => state.value?.placements[state.value.placements.length - 1])
/** The just-filed card, highlighted on the line through the story hold. */
const freshSlug = computed(() =>
  revealing.value || finished.value ? lastPlacement.value?.slug : undefined
)

const opener = computed(() => {
  const slug = state.value?.deck[0]
  return slug ? timelineEvent(slug) : undefined
})
const openerTitle = computed(() =>
  opener.value
    ? `The line opens at ${formatEventYear(opener.value.year)} — ${opener.value.name}`
    : 'The line is about to open'
)
const stakes =
  'Each turn, one event card. Slot it between the cards already on the line — before and after ' +
  'is all that counts, never a year. A correct slot banks points, and a crowded line pays more; ' +
  'a wrong one files itself where it belongs, for everyone to learn.'

const headline = computed(() => {
  if (finished.value) return 'The line is complete'
  const total = (state.value?.deck.length ?? 1) - 1
  const current = Math.min(state.value?.card ?? 1, total)
  return `Timeline — card ${current} of ${total}`
})

const turnLabel = computed(() => {
  if (myTurn.value) return 'Your call'
  return `${playerDisplayName(activePlayer.value)} is on the clock`
})

/** What a correct call on the current line pays — the density economy, shown. */
const stakePoints = computed(() => {
  const active = challenge.value
  if (!active) return 0
  return Math.round(
    perCardPoints(active) * slotDensityFraction(placed.value.length + 1, active.state.deck.length)
  )
})

const askLine = computed(() =>
  myTurn.value
    ? `Tap the slot on the line where this belongs — a correct call banks ${stakePoints.value} pts`
    : `${playerDisplayName(activePlayer.value)} is weighing the line`
)

/** "Photo: name · licence" — Commons authors earn their line on the card. */
const photoCredit = (event: EventEntry): string => {
  if (!event.credit && !event.license) return ''
  return ['Photo', event.credit, event.license].filter(Boolean).join(' · ')
}

// --- The story beat's verdict line -------------------------------------------
const story = computed(() => {
  const placement = lastPlacement.value
  if (!placement) return undefined
  const event = timelineEvent(placement.slug)
  if (!event) return undefined

  const who = seatLabel(gameStore.game?.players, placement.playerId, gameStore.playerId)
  const verdict = placement.correct
    ? who === 'You'
      ? `Correct — placed exactly right, +${placement.scored} pts`
      : `Correct — ${who} places it exactly right, +${placement.scored} pts`
    : placement.kind === 'timeout'
      ? `${who === 'You' ? 'Your' : `${who}'s`} clock ran out — the card files itself`
      : who === 'You'
        ? 'Missed — it snaps to where it belongs'
        : `${who} missed — it snaps to where it belongs`
  return { event, correct: placement.correct, verdict }
})

const { secondsOnClock } = useDeadlineClock(() => state.value?.deadline)

const clockRunning = computed(() => !showInterstitial.value && !finished.value && !revealing.value)

// --- Placing a card ------------------------------------------------------------
const pending = ref(false)
const selectedSlot = ref<number | undefined>()

const place = (slot: number) => {
  const active = challenge.value
  if (!active || !canPlace.value || pending.value) return
  pending.value = true
  selectedSlot.value = slot
  update({ event: 'submit-timeline-placement', slot, turn: active.state.turn })
}

interface LineItem {
  key: string
  type: 'gap' | 'stop'
  slot: number
  slug?: string
}

/** The line flattened for the keyed TransitionGroup: gap, stop, gap, stop… */
const lineItems = computed<LineItem[]>(() => {
  const items: LineItem[] = []
  placed.value.forEach((slug, index) => {
    items.push({ key: `gap-${index}`, type: 'gap', slot: index })
    items.push({ key: slug, type: 'stop', slot: index, slug })
  })
  items.push({ key: `gap-${placed.value.length}`, type: 'gap', slot: placed.value.length })
  return items
})

const slotLabel = (slot: number): string => {
  const before = slot > 0 ? timelineEvent(placed.value[slot - 1])?.name : undefined
  const after = slot < placed.value.length ? timelineEvent(placed.value[slot])?.name : undefined
  if (before && after) return `Place between ${before} and ${after}`
  if (after) return `Place before ${after}`
  return `Place after ${before}`
}

// Each server turn (or reveal) unlocks the input for whoever's up next.
watch(
  () => [state.value?.turn, state.value?.revealing],
  () => {
    pending.value = false
    if (!revealing.value) selectedSlot.value = undefined
  }
)

// Keyboard on desktop: arrows walk the slots, Enter commits.
const onKeydown = (event: KeyboardEvent) => {
  if (!canPlace.value || pending.value) return
  const slots = placed.value.length + 1
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    selectedSlot.value = Math.max(0, (selectedSlot.value ?? slots) - 1)
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    selectedSlot.value = Math.min(slots - 1, (selectedSlot.value ?? -1) + 1)
  } else if (event.key === 'Enter' && selectedSlot.value !== undefined) {
    event.preventDefault()
    place(selectedSlot.value)
  }
}
if (import.meta.client) {
  window.addEventListener('keydown', onKeydown)
  registerCleanup(() => window.removeEventListener('keydown', onKeydown))
}

// --- Keeping the action on screen ---------------------------------------------
// TransitionGroup ref resolves to the component; its $el is the <ol>.
const lineEl = ref<{ $el?: HTMLElement } | null>(null)

const scrollLineTo = (selector: string) => {
  nextTick(() => {
    lineEl.value?.$el
      ?.querySelector(selector)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  })
}

// The freshly filed card slides into view for its story beat…
watch(freshSlug, slug => slug && scrollLineTo(`[data-stop="${CSS.escape(slug)}"]`))
// …and the keyboard cursor keeps its slot visible.
watch(selectedSlot, slot => slot !== undefined && scrollLineTo(`[data-slot="${slot}"]`))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.turn-line {
  gap: 0.6rem;
  display: inline-flex;
  align-items: center;

  // The countdown itself lives in the shared round clock — the chip only
  // says WHOSE call it is, in their pawn colour.
  .chip {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }
}

// --- Centre stage ---------------------------------------------------------------
.stage {
  z-index: 2;
  display: flex;
  min-height: 0;
  padding: 0 1.6rem;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

.reveal {
  width: min(38rem, 100%);
}

.card {
  display: flex;
  overflow: hidden;
  position: relative;
  flex-flow: column nowrap;
  width: min(38rem, 100%);

  .card-photo {
    margin: 0;
    position: relative;

    img {
      width: 100%;
      height: clamp(11rem, 22vh, 16rem);
      display: block;
      object-fit: cover;
    }

    .credit {
      right: 0;
      bottom: 0;
      opacity: 0.85;
      font-size: 0.95rem;
      position: absolute;
      padding: 0.15rem 0.6rem;
      color: var(--sour-milk);
      background: ink(0.55, 12%);
      border-top-left-radius: 0.4rem;
    }
  }

  .card-body {
    gap: 0.5rem;
    display: flex;
    padding: 1.4rem 1.8rem 1.6rem;
    flex-flow: column nowrap;
  }

  .eyebrow {
    margin: 0;
  }

  .card-title {
    margin: 0;
    font-size: clamp(1.8rem, 3.2vw, 2.3rem);
    line-height: 1.15;
  }

  .card-ask {
    margin: 0;
    opacity: 0.7;
    font-size: 1.25rem;
  }

  .card-description {
    margin: 0;
    font-size: 1.3rem;
    line-height: 1.45;
  }

  // The withheld year, worn like a wax seal.
  .year-badge {
    top: 1rem;
    left: 1rem;
    width: 3.2rem;
    height: 3.2rem;
    display: flex;
    font-size: 1.8rem;
    font-weight: bold;
    position: absolute;
    align-items: center;
    border-radius: 50%;
    justify-content: center;
    color: var(--sour-milk);
    background: ember(0.92, 45%);
    border: 0.15rem solid var(--sour-milk);
  }
}

.story {
  .verdict {
    color: var(--hior-ange);
  }

  .story-year {
    margin: 0;
    line-height: 1;
    font-weight: bold;
    font-size: clamp(3.2rem, 7vw, 4.6rem);
    color: var(--dark-blue);
    font-variant-numeric: tabular-nums;
  }

  &.won {
    border-color: hsla(170.5, 34.7%, 45%, 0.8);

    .verdict {
      color: hsl(170.5, 44%, 32%);
    }
  }

  &.lost {
    border-color: flame(0.7);
  }
}

.dossier-enter-active {
  transition: all var(--motion-slow) var(--ease-out-expressive);
}

.dossier-leave-active {
  transition: all var(--motion-quick) var(--ease-in-soft);
}

.dossier-enter-from {
  opacity: 0;
  transform: translateY(1.5rem);
}

.dossier-leave-to {
  opacity: 0;
  transform: translateY(-0.8rem);
}

@media (prefers-reduced-motion: reduce) {
  .dossier-enter-active,
  .dossier-leave-active {
    transition: none;
  }
}

// --- The line --------------------------------------------------------------------
footer {
  padding: 1.4rem 2rem 2rem;
}

.line-frame {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: row nowrap;

  .direction {
    flex: none;
    opacity: 0.6;
    font-size: 1.1rem;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: var(--dark-blue);
    text-transform: uppercase;
    writing-mode: horizontal-tb;
  }
}

.line {
  gap: 0.4rem;
  margin: 0;
  padding: 0.4rem 0.2rem;
  display: flex;
  flex: 1 1 auto;
  list-style: none;
  overflow-x: auto;
  align-items: stretch;
  flex-flow: row nowrap;
  // .main-board kills pointer events — restore them or the line can neither
  // be scrolled nor its slots tapped.
  pointer-events: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.stop {
  flex: none;
  width: 10.5rem;
  display: flex;
  overflow: hidden;
  border-radius: 0.7rem;
  flex-flow: column nowrap;
  background: milk(0.9);
  border: 0.1rem solid ink(0.25);
  border-bottom-width: 0.3rem;
  transition: border-color var(--motion-base) var(--ease-out-expressive);

  .stop-photo {
    width: 100%;
    height: 4.6rem;
    object-fit: cover;
  }

  .stop-year {
    font-weight: bold;
    font-size: 1.35rem;
    padding: 0.35rem 0.7rem 0;
    color: var(--dark-blue);
    font-variant-numeric: tabular-nums;
  }

  .stop-name {
    display: -webkit-box;
    overflow: hidden;
    font-size: 1.05rem;
    line-height: 1.25;
    padding: 0 0.7rem 0.5rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  &.fresh {
    border-color: var(--dark-blue);
  }

  &.won {
    border-color: hsla(170.5, 34.7%, 45%, 0.9);
    background: hsla(170.5, 34.7%, 55.1%, 0.16);
  }

  &.lost {
    border-color: var(--hior-ange);
    background: flame(0.14);
  }
}

.gap {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: padding var(--motion-base) var(--ease-out-expressive);

  // Desktop: the line parts around the slot under consideration — pointer or
  // keyboard cursor — so the user sees exactly where the card would press in.
  @media (min-width: ($tablet + 1)) {
    &:has(.slot.selected) {
      padding: 0 1.1rem;
    }

    @media (hover: hover) {
      &:hover:has(.slot:not(:disabled)) {
        padding: 0 1.1rem;
      }
    }
  }

  .tick {
    width: 0.9rem;
    height: 0.1rem;
    background: ink(0.3);
  }

  .slot {
    width: 2.6rem;
    height: 2.6rem;
    cursor: pointer;
    border-radius: 50%;
    position: relative;
    color: var(--dark-blue);
    background: milk(0.92);
    border: 0.15rem dashed ink(0.65, 41%);
    transition:
      transform var(--motion-quick) var(--ease-out-expressive),
      border-color var(--motion-quick) var(--ease-out-expressive),
      background-color var(--motion-quick) var(--ease-out-expressive);

    // The plus drawn as two bars, dead-centre by geometry — the serif's
    // glyph metrics left it riding high in the circle.
    &::before,
    &::after {
      content: '';
      top: 50%;
      left: 50%;
      position: absolute;
      border-radius: 0.1rem;
      background: currentColor;
      transform: translate(-50%, -50%);
    }

    &::before {
      width: 1.1rem;
      height: 0.18rem;
    }

    &::after {
      width: 0.18rem;
      height: 1.1rem;
    }

    // A slow beckon while the call is yours — the answer surface announces
    // itself without a tutorial.
    &:not(:disabled) {
      animation: slot-beckon 2s var(--ease-smooth) infinite;
    }

    @media (hover: hover) {
      &:hover:not(:disabled) {
        transform: scale(1.18);
        border-style: solid;
        border-color: var(--dark-blue);
        animation: none;
      }
    }

    &.selected {
      border-style: solid;
      transform: scale(1.18);
      border-color: var(--dark-blue);
      background: hsla(29.7, 79.9%, 72.7%, 0.55);
      animation: none;
    }

    &:disabled {
      cursor: default;
      opacity: 0.55;
      animation: none;
    }
  }
}

// Turn handoff on the line: the filed card presses in from below while its
// neighbours glide apart to make room (TransitionGroup FLIP moves).
.line-move {
  transition: transform var(--motion-slow) var(--ease-out-expressive);
}

.line-enter-active {
  transition:
    opacity var(--motion-slow) var(--ease-out-expressive),
    transform var(--motion-slow) var(--ease-out-expressive);
}

.line-enter-from {
  opacity: 0;
  transform: translateY(0.9rem) scale(0.92);
}

// Nothing leaves the line mid-round; the guard keeps a teardown from jumping.
.line-leave-active {
  position: absolute;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .line-move,
  .line-enter-active {
    transition: none;
  }
}

@keyframes slot-beckon {
  0%,
  100% {
    border-color: ink(0.65, 41%);
    box-shadow: 0 0 0 0 hsla(197.6, 51.2%, 41.8%, 0);
  }
  50% {
    border-color: var(--soft-blue);
    box-shadow: 0 0 0 0.35rem hsla(197.6, 51.2%, 41.8%, 0.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gap {
    transition: none;

    .slot:not(:disabled) {
      animation: none;
    }
  }
}

// --- Phones: the line stands upright and scrolls like a ledger -------------------
@media screen and (max-width: $tablet) {
  header {
    // Side gutters keep the headline pill clear of the round clock's berth.
    padding: 1.2rem 6rem;
  }

  // The line owns the bottom edge, so the dial keeps to the top corner
  // instead of .round-clock's phone default (bottom-right).
  :global(.timeline-round .round-clock) {
    top: calc(1rem + var(--safe-top));
    right: calc(1.2rem + var(--safe-right));
    bottom: auto;
  }

  .stage {
    padding: 0 1.2rem;
  }

  .card .card-photo img {
    height: clamp(8rem, 18vh, 12rem);
  }

  footer {
    padding: 1rem 1.2rem calc(1rem + var(--safe-bottom));
  }

  .line-frame {
    gap: 0.4rem;
    flex-flow: column nowrap;
    align-items: stretch;

    .direction {
      text-align: center;
    }
  }

  .line {
    gap: 0.35rem;
    max-height: 30dvh;
    overflow-x: hidden;
    overflow-y: auto;
    flex-flow: column nowrap;
  }

  .stop {
    width: 100%;
    display: grid;
    align-items: center;
    // auto photo column collapses cleanly when a card has no picture.
    grid-template-columns: auto auto 1fr;
    gap: 0 0.8rem;

    .stop-photo {
      width: 4.4rem;
      height: 3.4rem;
      grid-row: span 1;
    }

    .stop-year {
      padding: 0;
    }

    .stop-name {
      padding: 0 0.7rem 0 0;
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }

  .gap {
    justify-content: stretch;

    .tick {
      width: 100%;
      height: 0.1rem;
      margin: 0 1.2rem;
    }

    .slot {
      width: 100%;
      height: 2.4rem;
      border-radius: 0.6rem;

      &:hover:not(:disabled),
      &.selected {
        transform: none;
      }
    }
  }
}
</style>
