<template>
  <div v-if="challenge" class="timeline-round challenge-shell" :class="{ dragging: cardInFlight }">
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
    <section class="stage" :class="{ dragging: cardInFlight }">
      <Transition name="dossier" mode="out-in">
        <TimelineReveal
          v-if="finished"
          key="reveal"
          :challenge="challenge"
          :players="gameStore.game?.players ?? {}"
          :player-id="gameStore.seatId"
          :spectating="gameStore.watching"
          @done="sendRevealDone"
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
            <SourceInfo
              class="photo-source on-photo"
              label="Sources"
              :attributions="eventSources"
              :item-credit="photoCredit(story.event)"
            />
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
          ref="cardEl"
          class="pane tr decorator-bottom card"
          :class="{
            grabbable: canPlace,
            dragging: cardDragging,
            'over-slot': cardDragging && selectedSlot !== undefined,
          }"
          @pointerdown="onCardDragStart"
          @dragstart.prevent
        >
          <figure v-if="drawnEvent.image" class="card-photo">
            <img :src="drawnEvent.image" :alt="drawnEvent.name" />
            <!-- The drawn card is a drag surface — no ⓘ here, or a touch on it
                 would start a drag. The story beat and the final report carry
                 the full panel; the strip keeps the photographer's line. -->
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

    <!-- The shared line: every placed card in order, slots between them.
         The finished report carries the line itself, so the ledger retires. -->
    <footer v-if="!finished">
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
              <!-- A placed card's year is public, so its STORY is fair game:
                   the stop opens the dossier — the waiting player's reading
                   room. Inert while a card is in flight (a drop must never
                   fight a dialog). -->
              <button
                type="button"
                class="stop-open"
                :disabled="cardInFlight"
                :aria-label="`Read the story of ${timelineEvent(item.slug!)?.name ?? item.slug}`"
                @click="openStopDossier(item.slug!)"
              >
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
              </button>
            </template>
          </li>
        </TransitionGroup>
        <span class="direction">{{ isPhone ? '↓ Later' : 'Later →' }}</span>
      </div>
    </footer>

    <TimelineDossier v-model:open="stopDossierOpen" :slug="stopDossierSlug" />
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import TimelineDossier from '~/components/challenge/TimelineDossier.vue'
import TimelineReveal from '~/components/challenge/TimelineReveal.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import {
  activeTimelinePlayerId,
  drawnCard,
  EVENT_KIND_COPY,
  formatEventYear,
  timelineEvent,
} from '~~/lib/timeline'
import { EASE, MOTION, prefersReducedMotion } from '~~/lib/motion'
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
  () => !finished.value && !revealing.value && activeId.value === gameStore.seatId
)
const canPlace = computed(() => myTurn.value && !showInterstitial.value)

const drawnSlug = computed(() => (state.value ? drawnCard(state.value) : undefined))
const drawnEvent = computed(() => (drawnSlug.value ? timelineEvent(drawnSlug.value) : undefined))

// The waiting player's reading room: any PLACED stop opens its story. The
// drawn card never reaches this — its year is the question.
const stopDossierOpen = ref(false)
const stopDossierSlug = ref<string>()
const openStopDossier = (slug: string) => {
  stopDossierSlug.value = slug
  stopDossierOpen.value = true
}

/** The reveal's Continue: latch + ack-reopen (the ready-gate idiom). `iAmDone`
 *  itself derives from state in the reveal, so a rejoined tab reads true. */
const revealDoneSent = ref(false)
const sendRevealDone = () => {
  if (gameStore.watching || revealDoneSent.value) return
  revealDoneSent.value = true
  void update({ event: 'timeline-reveal-done' }).then(delivered => {
    if (!delivered) revealDoneSent.value = false
  })
}
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

// No points figure here: a card's value depends on the rest of the hand this
// seat is dealt, which isn't settled until the deck runs out. Promising a
// number mid-turn would mean re-deriving server math in the view and getting
// it wrong — the reveal scorecard is where points are told.
const askLine = computed(() =>
  myTurn.value
    ? 'Drag it onto the line'
    : `${playerDisplayName(activePlayer.value)} is weighing the line`
)

/** "Photo: name · licence" — Commons authors earn their line on the card. */
const photoCredit = (event: EventEntry): string => {
  if (!event.credit && !event.license) return ''
  return ['Photo', event.credit, event.license].filter(Boolean).join(' · ')
}

/** The facts behind every card — the ⓘ beside the photo credit opens them. */
const eventSources = datasetAttribution('events')

// --- The story beat's verdict line -------------------------------------------
const story = computed(() => {
  const placement = lastPlacement.value
  if (!placement) return undefined
  const event = timelineEvent(placement.slug)
  if (!event) return undefined

  const who = seatLabel(gameStore.game?.players, placement.playerId, gameStore.seatId)
  const verdict = placement.correct
    ? who === 'You'
      ? 'Correct — placed exactly right'
      : `Correct — ${who} places it exactly right`
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
    cardLanding.value = false
    if (!revealing.value) selectedSlot.value = undefined
  }
)

// --- Dragging the card onto the line --------------------------------------------
// The card follows the finger/mouse; the nearest slot lights up as the drop
// target (sharing selectedSlot with the tap and keyboard paths), and letting
// go over the line files it. A miss springs the card home.
const cardEl = ref<HTMLElement>()
const cardDragging = ref(false)
// The drop is settling into its slot — the card keeps flying (and the line
// keeps its opened-up size) until the story beat takes over.
const cardLanding = ref(false)
// A miss: the card is springing back to the stage. Still in flight, or the
// stage would clip it away mid-spring.
const cardHoming = ref(false)
const cardInFlight = computed(() => cardDragging.value || cardLanding.value || cardHoming.value)
let grabPoint = { x: 0, y: 0 }
let lastPoint = { x: 0, y: 0 }

/** The nearest slot to the pointer — or nothing outside the line's reach. */
const slotUnderPointer = (x: number, y: number): number | undefined => {
  const line = lineEl.value?.$el
  if (!line) return undefined
  const frame = line.getBoundingClientRect()
  const pad = 36
  if (
    x < frame.left - pad ||
    x > frame.right + pad ||
    y < frame.top - pad ||
    y > frame.bottom + pad
  )
    return undefined
  let best: number | undefined
  let bestDistance = Infinity
  for (const gap of line.querySelectorAll<HTMLElement>('[data-slot]')) {
    const rect = gap.getBoundingClientRect()
    const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2))
    if (distance < bestDistance) {
      bestDistance = distance
      best = Number(gap.dataset.slot)
    }
  }
  return best
}

const onCardDragMove = (event: PointerEvent) => {
  const el = cardEl.value
  if (!cardDragging.value || !el) return
  lastPoint = { x: event.clientX, y: event.clientY }
  gsap.set(el, { x: event.clientX - grabPoint.x, y: event.clientY - grabPoint.y })
  const over = slotUnderPointer(event.clientX, event.clientY)
  // Crossing the line's edge, the card compacts toward stop size — it reads
  // as "about to file in" — and swells back when carried away.
  if ((over !== undefined) !== (selectedSlot.value !== undefined)) {
    const compact = { scale: over !== undefined ? 0.72 : 1, rotation: over !== undefined ? -2 : 0 }
    if (prefersReducedMotion()) gsap.set(el, compact)
    else gsap.to(el, { ...compact, duration: MOTION.quick, ease: EASE.cross })
  }
  selectedSlot.value = over
}

const stopCardDrag = () => {
  window.removeEventListener('pointermove', onCardDragMove)
  window.removeEventListener('pointerup', onCardDragEnd)
  window.removeEventListener('pointercancel', onCardDragEnd)
}

/** The drop, made visible: the card presses into its slot and vanishes —
 *  the stop that lands there (`.fresh` hint-pop) reads as the same card. */
const landCard = (slot: number) => {
  const el = cardEl.value
  const gap = lineEl.value?.$el?.querySelector(`[data-slot="${slot}"]`)
  if (!el || !gap) return
  cardLanding.value = true
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 0 })
    return
  }
  const target = gap.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  gsap.to(el, {
    x: `+=${target.left + target.width / 2 - (rect.left + rect.width / 2)}`,
    y: `+=${target.top + target.height / 2 - (rect.top + rect.height / 2)}`,
    scale: 0.15,
    opacity: 0,
    duration: MOTION.base,
    ease: EASE.exit,
  })
}

const onCardDragEnd = () => {
  stopCardDrag()
  if (!cardDragging.value) return
  cardDragging.value = false
  const el = cardEl.value
  const slot = selectedSlot.value
  if (slot !== undefined && canPlace.value) {
    place(slot)
    landCard(slot)
    return
  }
  selectedSlot.value = undefined
  if (!el) return
  if (prefersReducedMotion()) gsap.set(el, { clearProps: 'transform' })
  else {
    cardHoming.value = true
    gsap.to(el, {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      duration: MOTION.base,
      ease: 'elastic.out(0.8, 0.6)',
      onComplete: () => {
        cardHoming.value = false
        gsap.set(el, { clearProps: 'transform' })
      },
    })
  }
}

const onCardDragStart = (event: PointerEvent) => {
  if (!canPlace.value || pending.value) return
  cardDragging.value = true
  grabPoint = { x: event.clientX, y: event.clientY }
  lastPoint = { ...grabPoint }
  const el = cardEl.value
  if (el) {
    // A re-grab mid-spring kills the tween, so its onComplete never lands.
    gsap.killTweensOf(el)
    cardHoming.value = false
    // The ledger sizes up the moment the card lifts (the .dragging class), and
    // the reflow moves the card's transform origin — re-anchor the grab so the
    // card doesn't jump out from under the finger.
    const origin = () => el.getBoundingClientRect().top - Number(gsap.getProperty(el, 'y'))
    const before = origin()
    nextTick(() => {
      const drift = origin() - before
      if (!drift) return
      grabPoint.y += drift
      gsap.set(el, { x: lastPoint.x - grabPoint.x, y: lastPoint.y - grabPoint.y })
    })
  }
  window.addEventListener('pointermove', onCardDragMove)
  window.addEventListener('pointerup', onCardDragEnd)
  window.addEventListener('pointercancel', onCardDragEnd)
}
registerCleanup(stopCardDrag)

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
// Window listeners bypass the booth's inert wrapper — a watcher's arrow keys
// must not drive the followed racer's UI.
if (import.meta.client && !gameStore.watching) {
  window.addEventListener('keydown', onKeydown)
  registerCleanup(() => window.removeEventListener('keydown', onKeydown))
}

// --- Keeping the action on screen ---------------------------------------------
// TransitionGroup ref resolves to the component; its $el is the <ol>.
const lineEl = ref<{ $el?: HTMLElement } | null>(null)

/** Centre a stop or slot in the line, scrolling ONLY the line — never
 *  scrollIntoView, whose ancestor walk can shift the whole shell. Layout
 *  offsets, not rects: the FLIP move transforms would lie mid-glide. */
const scrollLineTo = (selector: string) => {
  nextTick(() => {
    const line = lineEl.value?.$el
    const item = line?.querySelector<HTMLElement>(selector)
    if (!line || !item) return
    const behavior = prefersReducedMotion() ? ('auto' as const) : ('smooth' as const)
    if (isPhone.value) {
      const top = item.offsetTop - line.offsetTop - (line.clientHeight - item.offsetHeight) / 2
      line.scrollTo({ top: Math.max(0, top), behavior })
    } else {
      const left = item.offsetLeft - line.offsetLeft - (line.clientWidth - item.offsetWidth) / 2
      line.scrollTo({ left: Math.max(0, left), behavior })
    }
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

// Header, stage, footer as grid rows: the minmax(0, 1fr) middle is the whole
// overlap fix — the stage can never outgrow the leftover between them. The
// clock and the interstitial are absolutely positioned and take no row.
.timeline-round {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  // One full-width column — the shell's space-between must not shrink-wrap it.
  grid-template-columns: minmax(0, 1fr);
  // The one clip a card in flight answers to: the viewport. A dragged card's
  // below-the-fold tail must not grow the document's scroll area.
  overflow: hidden;
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

  // The card in flight rides above the line it is about to join. The shell
  // clips the stage so it can never outgrow its row — but a card carried
  // toward the footer leaves that box, and the clip cut it off dead straight
  // at the line's top edge. In flight the stage stops clipping; the root's
  // own overflow still keeps the tail out of the document.
  &.dragging {
    z-index: 3;
    overflow: visible;
  }
}

.card {
  display: flex;
  overflow: hidden;
  position: relative;
  max-height: 100%;
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

    .photo-source {
      left: 0.6rem;
      bottom: 0.6rem;
      position: absolute;
    }
  }

  .card-body {
    gap: 0.5rem;
    display: flex;
    min-height: 0;
    overflow-y: auto;
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

  // The stop IS a button now (its story opens on tap) — the card chrome
  // stays on the li, the button just fills it.
  .stop-open {
    all: unset;
    width: 100%;
    display: flex;
    cursor: pointer;
    flex-flow: column nowrap;

    &:disabled {
      cursor: default;
    }
    &:focus-visible {
      outline: 0.2rem solid var(--soft-blue);
      outline-offset: -0.2rem;
    }
  }

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

  // The just-filed card announces its landing: a rise-and-settle pop on top
  // of the neighbours' FLIP glide (hint-pop lives in rules/_animations.scss).
  &.fresh {
    border-color: var(--dark-blue);
    animation: hint-pop var(--motion-slow) var(--ease-out-expressive);
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

// The drawn card, when the call is yours: pick it up and carry it to the line.
.card.grabbable {
  cursor: grab;
  touch-action: none;
  user-select: none;

  img {
    -webkit-user-drag: none;
  }
}

.card.dragging {
  cursor: grabbing;
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

// A card in flight opens the line up: every gap parts a little (the chosen
// one widest), so the drop targets read at a glance.
.timeline-round.dragging .gap {
  padding: 0 0.55rem;
}

.timeline-round.dragging .gap:has(.slot.selected) {
  padding: 0 1.1rem;
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

  .stop.fresh {
    animation: none;
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

  // The drawn card keeps a low profile on phones — the line is the stage.
  .card .card-photo img {
    height: clamp(6rem, 13vh, 9rem);
  }

  footer {
    padding: 1rem 1.2rem calc(1rem + var(--bottom-clearance));
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
    max-height: 34dvh;
    overflow-x: hidden;
    overflow-y: auto;
    flex-flow: column nowrap;
  }

  // Mid-flight the ledger opens up: taller list, taller targets.
  .timeline-round.dragging .line {
    max-height: 46dvh;
  }

  .timeline-round.dragging .gap {
    padding: 0;

    .slot {
      height: 3.2rem;
    }
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
