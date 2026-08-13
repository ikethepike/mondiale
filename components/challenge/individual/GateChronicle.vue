<template>
  <template v-if="challenge.chronicle">
    <h1 class="map-caption">Put {{ countryName(challenge.country) }}'s history in order</h1>
    <span class="map-caption sub">Drag the chapters into place.</span>

    <!-- A timeline under assembly: numbered nodes on a dashed rail hold their
         slot (1..N top-down) while the CARDS trade places through them — the
         still rail is what makes a drag read as re-dating an event. -->
    <div class="chronicle-board">
      <span class="pole pole-earliest" aria-hidden="true">Earliest</span>
      <Sortable
        :list="cards"
        :options="options"
        item-key="slug"
        class="chronicle-cards"
        @sort="updateOrder"
      >
        <template #item="{ element }">
          <article :key="element.slug" class="event-card draggable" :data-slug="element.slug">
            <img v-if="element.event.image" class="card-photo" :src="element.event.image" alt="" />
            <span v-else class="card-initial" aria-hidden="true">{{
              element.event.name.charAt(0)
            }}</span>
            <span class="card-body">
              <span class="card-name">{{ element.event.name }}</span>
              <span class="card-kind">{{ element.event.kind }}</span>
            </span>
            <span v-if="element.slug === anchorSlug" class="card-anchor">Earliest</span>
            <span class="card-grip" aria-hidden="true" />
          </article>
        </template>
      </Sortable>
      <span class="pole pole-latest" aria-hidden="true">Latest</span>
    </div>

    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!anchorSlug && hintUnlocked"
          class="hint-button"
          type="button"
          @click="buyAnchor"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Mark the earliest card (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
    </div>

    <div class="lock-row">
      <ButtonFilled :disabled="!!status" @click="submitOrder">Set the record</ButtonFilled>
      <ChallengeTimerRadial class="lock-clock" :value="secondsLeft" :total="CHRONICLE_SECONDS" />
    </div>
  </template>
</template>
<script lang="ts" setup>
import { Sortable } from 'sortablejs-vue3'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import { EVENTS } from '~~/data/events.gen'
import { chronicleSolution, isChronicleOrdered } from '~~/lib/chronicle'
import { countryName } from '~~/lib/country'
import { HOLD_DRAG_LIST_OPTIONS } from '~~/lib/drag-list'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { useGateChallenge, useGateClock, wrongTokenFor } from '~~/lib/use-gate-challenge'
import { CHRONICLE_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { status, submitAnswer, chronicleOrder } = useGateChallenge()

const dealt = computed(() => props.challenge.chronicle?.events ?? [])
const order = ref<string[]>([...dealt.value])
const cards = computed(() =>
  order.value.map(slug => ({ slug, event: EVENTS[slug] })).filter(card => !!card.event)
)

const options = ref({ ...HOLD_DRAG_LIST_OPTIONS })
const updateOrder = (event: Event) => {
  const parent = event.target as HTMLElement
  const next: string[] = []
  for (const card of parent.querySelectorAll('.event-card')) {
    if (!(card instanceof HTMLElement)) continue
    const { slug } = card.dataset
    if (slug) next.push(slug)
  }
  if (next.length === dealt.value.length) order.value = next
}

const anchorSlug = ref<string>()
const hintsUsed = computed(() => (anchorSlug.value ? 1 : 0))
const buyAnchor = () => {
  if (anchorSlug.value || status.value) return
  anchorSlug.value = chronicleSolution(dealt.value)[0]
}

const { secondsLeft, remainingFraction, stop, elapsedFraction } = useGateClock(CHRONICLE_SECONDS, {
  onExpire: () => resolve(true),
})
const hintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)

/**
 * Client-trust grading, higher-lower's posture: the order is checked through
 * lib/chronicle (the same module the reveal reads) and the winning token is
 * `country`; a wrong order submits the can't-match token. The submitted order
 * rides the shared ledger so the reveal can ghost each card's placement.
 *
 * Expiry grades the order AS ARRANGED at `remainingFraction: 0` — the buzzer
 * pays the floor, same as locking in at the last second, so idling past a
 * correct arrangement earns exactly what a buzzer submit would have.
 */
const resolve = (expired = false) => {
  if (status.value) return
  stop()
  chronicleOrder.value = [...order.value]
  const correct = isChronicleOrdered(order.value)
  // reveal: false — the record card IS the reveal; the map's terse country
  // card under it doubled the answer and collided with the record on phones.
  submitAnswer(correct ? props.challenge.country : wrongTokenFor(props.challenge), {
    remainingFraction: expired ? 0 : remainingFraction.value,
    hintsUsed: hintsUsed.value,
    reveal: false,
  })
}
const submitOrder = () => resolve()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.chronicle-board {
  // The rail's gutter and the coins that hang in it — one set of numbers the
  // rail, the cards and the poles all read from, so a narrower gutter can
  // never leave the dashes off the coins' centre.
  --rail-gutter: 4.4rem;
  --coin-size: 3rem; // the coin's PAINTED width, border and all
  --coin-reach: 3.9rem; // how far left of its card a coin sits
  --card-edge: 0.1rem; // the card's hairline — the coin hangs off its INNER edge

  gap: 0.6rem;
  display: flex;
  align-items: stretch;
  // Spans the prompt column so the box below centres against the real
  // container — the header's scroller clips at its own padding, so a vw sum
  // would lean the coins straight into that edge.
  align-self: stretch;
  flex-flow: column nowrap;
  margin-top: 1rem;

  // A five-card hand outgrows a phone, and the tail is the lock row: the
  // button and the clock. So the board is the column's GIVER — it takes the
  // room that's left and scrolls its own overflow, which keeps the prompt on
  // top and "Set the record" on screen at every viewport height.
  //
  // The scroller is the board, not the card list: the rail is an absolute
  // pseudo on `.chronicle-cards`, and inside a scroll container it would size
  // to the VISIBLE box and scroll away, leaving the lower coins railless.
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  // A drag that overshoots must not chain into a page bounce — the
  // rubber-banding wrestles the card out of the player's finger.
  overscroll-behavior-y: contain;
  // Interactive by right: the passthrough shell is pointer-events: none, and
  // a swipe has to land somewhere. Opting the BOARD in (not just the cards)
  // means the rail gutter, the poles and the gaps all pan too — chronicle
  // never answers on the map, so nothing behind this column needs the taps.
  pointer-events: auto;
}

// The rail's marginalia and the card column share one box: a gutter each
// side, the rail living in the left one. Mirroring the gutter is what puts
// the CARDS on the prompt's centre line — centring the board whole measured
// the gutter in, and hung the stack half of it to the right.
.pole,
.chronicle-cards {
  width: 100%;
  max-width: calc(50rem + var(--rail-gutter));
  margin-inline: auto;
  padding-inline: var(--rail-gutter);
}

// The direction poles, the ranking round's language turned vertical. They
// label the card column, so they start where the cards do — the padding only
// lands there once the header's inherited centring is dropped.
.pole {
  flex: none;
  text-align: left;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--soft-blue);

  &::after {
    content: ' ↓';
  }
}
.pole-latest::after {
  content: '';
}
.pole-latest::before {
  content: '↓ ';
}

.chronicle-cards {
  gap: 1rem;
  display: flex;
  position: relative;
  flex-flow: column nowrap;
  counter-reset: slot;
  // A long-press must pick a card up, never start iOS text selection.
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  // `pan-y`, never `none`: refusing the browser's gestures over the cards left
  // a phone with no scrollable surface at all — the cards cover the column, so
  // the tail of the hand and the whole lock row were unreachable. The hold in
  // HOLD_DRAG_LIST_OPTIONS is what separates a reorder from a scroll now.
  touch-action: pan-y;

  // The rail the slots hang on. It sits behind the node coins and holds
  // still while cards trade places through it. Its centre must land on the
  // coins': a coin hangs off the card's PADDING box, so it starts
  // (gutter + card edge − reach) in and spans a painted coin — the 0.2rem
  // line starts 0.1rem before that midpoint, at every coin size.
  &::before {
    content: '';
    top: 1.4rem;
    bottom: 1.4rem;
    left: calc(
      var(--rail-gutter) + var(--card-edge) - var(--coin-reach) + var(--coin-size) * 0.5 - 0.1rem
    );
    position: absolute;
    border-left: 0.2rem dashed ink(0.3);
  }
}

.event-card {
  gap: 1.2rem;
  display: flex;
  min-height: 6rem;
  align-items: stretch;
  position: relative;
  overflow: visible;
  cursor: grab;
  border-radius: 1rem;
  backdrop-filter: blur(0.5rem);
  background: milk(0.94);
  border: var(--card-edge) solid ink(0.25);
  box-shadow: 0 0.2rem 0.6rem ink(0.08);
  transition: box-shadow 0.2s var(--ease-out-expressive);

  // The slot coin: numbered top-down by DOM order, so it re-counts itself the
  // moment a drop lands — the number belongs to the SLOT, not the card.
  //
  // border-box, because the reset's `*` doesn't reach pseudo-elements: with
  // the border outside the width, the coin painted 0.4rem wider than
  // --coin-size and the rail's dashes ran a line-width left of its centre.
  &::before {
    counter-increment: slot;
    content: counter(slot);
    top: 50%;
    box-sizing: border-box;
    left: calc(var(--coin-reach) * -1);
    width: var(--coin-size);
    height: var(--coin-size);
    display: grid;
    position: absolute;
    place-items: center;
    transform: translateY(-50%);
    font-size: 1.3rem;
    font-weight: 700;
    border-radius: 50%;
    color: var(--dark-blue);
    background: milk(1);
    border: 0.2rem solid ink(0.45);
  }

  &.ghost {
    opacity: 0.45;
    border-style: dashed;
  }
  &.drag {
    cursor: grabbing;
    box-shadow: 0 0.8rem 2rem ink(0.28);
    rotate: 1deg;
  }
}

// The chapter's plate: a full-bleed photo on the left edge, or a woodcut
// initial where the library has no artwork — never an empty grey stub.
.card-photo,
.card-initial {
  flex: none;
  width: 8.4rem;
  align-self: stretch;
  border-radius: 0.9rem 0 0 0.9rem;
  border-right: 0.1rem solid ink(0.18);
}

.card-photo {
  object-fit: cover;
}

.card-initial {
  display: grid;
  place-items: center;
  font-size: 3.4rem;
  font-family: 'Lusitana', serif;
  color: var(--dark-blue);
  background: ink(0.07);
}

// A chapter reads ragged-right against its plate: the header's inherited
// centring (ChallengePrompt) set a wrapped title drifting away from the photo
// edge, and left every card's first word starting at its own indent.
.card-body {
  gap: 0.3rem;
  display: flex;
  min-width: 0;
  padding: 1rem 0;
  text-align: left;
  align-self: center;
  flex-flow: column nowrap;
}

.card-name {
  font-size: 1.7rem;
  line-height: 1.2;
  color: var(--dark-blue);
}

// The register, never the date — years stay for the reveal.
.card-kind {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

// The bought anchor: names the fact, not the year.
.card-anchor {
  align-self: center;
  margin-left: auto;
  padding: 0.25rem 0.8rem;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--milk, #fffaf5);
  background: var(--soft-blue);
  border-radius: 1rem;
}

// A grid of grip dots — the "you can pick this up" affordance.
.card-grip {
  flex: none;
  width: 1.2rem;
  margin: 1.4rem 1.2rem 1.4rem auto;
  background-image: radial-gradient(ink(0.35) 0.12rem, transparent 0.14rem);
  background-size: 0.6rem 0.7rem;
}

.card-anchor + .card-grip {
  margin-left: 1.2rem;
}

.lock-row {
  margin-top: 1.6rem;
}

@media (max-width: $tablet) {
  // A narrower gutter and smaller coins — the rail, the poles and the optical
  // offset follow from the tokens, so this is the whole of it.
  .chronicle-board {
    --rail-gutter: 3.6rem;
    // Even, like the 3rem above: the rail's left is a half-coin sum, and a
    // fractional pixel there gets snapped — half a pixel off a 0.2rem line.
    --coin-size: 2.8rem;
    --coin-reach: 3.3rem;
  }
  .chronicle-cards {
    gap: 0.8rem;
  }
  .event-card {
    min-height: 5.2rem;
  }
  .card-photo,
  .card-initial {
    width: 6.4rem;
  }
  .card-name {
    font-size: 1.5rem;
  }
}
</style>
