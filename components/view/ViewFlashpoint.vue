<template>
  <section v-if="challenge" class="flashpoint challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Flashpoint`"
      title="A history of conflict, drawn in dots"
      :stakes="stakes"
      @done="start"
    />
    <template v-else>
      <ConflictDotField
        v-if="field"
        :field="field"
        :shown-waves="shownWaves"
        :show-chip="!submitted"
        :abroad="submitted ? abroadField : undefined"
        :sketch="sketchedNeighbours"
      />

      <ChallengePrompt :hint="hint" :attributions="dotSources">
        <h1 v-if="!submitted" class="map-caption">Where did this happen?</h1>
        <!-- `status` is this card's own prop, so the verdict still stamps a miss
             even though gameStore.map.status stays undefined on one: washing the
             whole world orange reads as "the world is wrong", not "you missed".
             Gated on the headline, NOT on `submitted`: the spectator booth flips
             `submitted` from groupAnswers without ever running submitRound, so
             those two refs are still at their defaults there — and a card keyed
             off `submitted` alone stamps a confident "incorrect" on a racer who
             may well have been right. -->
        <ChallengeResult
          v-else-if="verdictHeadline"
          :status="resolvedCorrectly ? 'correct' : 'incorrect'"
          :correct-message="verdictHeadline"
          :incorrect-message="verdictHeadline"
        >
          <template v-if="abroadField">
            Amber dots — recorded clashes abroad, in conflicts it joined.
          </template>
        </ChallengeResult>
        <span v-if="!submitted" class="map-caption sub"
          >One dot, one recorded clash since 1989 — where it happened, not how many died.</span
        >
      </ChallengePrompt>

      <section class="stage">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </section>

      <footer :class="{ 'suggest-berth': !challenge.options && !submitted }">
        <template v-if="!submitted">
          <!-- The ladder stands directly above the console: the rungs are the
               working material for the guess you're about to type, so the last
               thing read is the freshest clue and the hands are already there.
               It lives in the footer so useFooterBerth reserves ladder AND
               console as one band and the camera frames the dots clear of both.

               Newest at the BOTTOM, nearest the input — the same language the
               dot waves speak, where the newest era carries the ink and older
               ones recede. The scrollport is capped at two rungs so a five-rung
               round can never eat the map; older rungs stay reachable by scroll
               and dim as they climb, and the shared scroll-fade tells the
               player there is more above. -->
          <TransitionGroup
            v-if="ladder.length"
            ref="ladderList"
            tag="ul"
            name="hint"
            class="hint-ladder"
            :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
            @scroll.passive="syncScrollEdges"
          >
            <li
              v-for="(rung, index) in ladder"
              :key="rung.kind"
              class="hint-chip"
              :style="{ '--rung-age': ladder.length - 1 - index }"
            >
              {{ rung.text }}
            </li>
          </TransitionGroup>
          <!-- Non-hard mode: pick from flag options, the round clock above
               them. Hard mode: the clock lives inside the guess console. -->
          <template v-if="challenge.options">
            <ChallengeTimerRadial
              class="footer-clock"
              :value="secondsLeft"
              :total="challenge.durationSeconds"
            />
            <div class="options card-options">
              <button
                v-for="option in challenge.options"
                :key="option"
                class="option card-option"
                :class="{ 'is-spent': spent.includes(option) }"
                type="button"
                :disabled="submitted || !started || spent.includes(option)"
                @click="onGuess(getCountry(option))"
              >
                <CountryTileFlag class="option-flag" :country="getCountry(option)" />
                <span>{{ countryName(option) }}</span>
              </button>
            </div>
          </template>
          <ChallengeConsole
            v-else
            class="console"
            :value="secondsLeft"
            :total="challenge.durationSeconds"
          >
            <CountryGuessInput
              ref="guessInput"
              :disabled="submitted || !started"
              placeholder="Name the country…"
              @guess="onGuess"
              @miss="announce({ hint: 'No country by that name' })"
            />
          </ChallengeConsole>
        </template>
        <ConflictProfileCard v-else :country="challenge.country" />
      </footer>
    </template>
  </section>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ConflictDotField from '~/components/challenge/ConflictDotField.vue'
import ConflictProfileCard from '~/components/challenge/ConflictProfileCard.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import { FLASHPOINT_HINT_LEAD_SECONDS } from '~~/lib/round-beats'
import type { FlashpointHint } from '~~/types/challenges/group-modes.type'
import type { ConflictField } from '~~/types/vendor/ucdp/ucdp.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  stopCountdown,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('flashpoint-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const field = ref<ConflictField>()
const abroadField = ref<ConflictField>()
const shownWaves = ref(1)
const verdictHeadline = ref('')
/** Per-seat, and read by the verdict card — the map wash deliberately stays
 *  undefined on a miss, so it cannot double as the card's status. */
const resolvedCorrectly = ref(false)

/** Padded bbox of a set of dot layers, in map space. */
const fieldBounds = (
  layers: (ConflictField | undefined)[]
): [number, number, number, number] | undefined => {
  const points = layers.flatMap(layer => layer?.eras.flatMap(era => era.points) ?? [])
  if (!points.length) return undefined
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const pad = Math.max(6, 0.15 * Math.max(maxX - minX, maxY - minY))
  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2]
}

/** The dots are UCDP GED events on the shared projection. */
const dotSources = datasetAttribution('conflict-events')

const stakes = computed(() => {
  const base =
    'Each dot is a recorded clash (UCDP counts an armed conflict once it causes 25 battle-related deaths in a year). They appear era by era — name the country.'
  return challenge.value?.maximumGuesses
    ? `${base} You get ${challenge.value.maximumGuesses} guesses — the second is worth less.`
    : `${base} The earlier you buzz, the more it's worth.`
})

/** How many rungs have unlocked. The ladder starts only once every wave has
 *  landed plus the lead — the dots get first refusal before the words step in
 *  — and then releases one per `secondsPerHint`. */
const shownHints = computed(() => {
  const active = challenge.value
  if (!active?.hints?.length || !started.value) return 0
  const wavesDone = active.eras.length * active.secondsPerEra
  const elapsed = active.durationSeconds - secondsLeft.value
  const sinceLadder = elapsed - wavesDone - FLASHPOINT_HINT_LEAD_SECONDS
  if (sinceLadder < 0) return 0
  return Math.min(active.hints.length, 1 + Math.floor(sinceLadder / active.secondsPerHint))
})

/** Only the rungs that have actually unlocked, oldest first — the newest sits
 *  last, at the bottom of the stack against the console. `shownHints` counts
 *  rungs across the WHOLE ladder including `bounds`, which draws on the map
 *  instead of writing, so it is sliced before the text filter, never after. */
const ladder = computed(() =>
  (challenge.value?.hints ?? [])
    .slice(0, shownHints.value)
    .filter((rung): rung is FlashpointHint & { text: string } => !!rung.text)
)

// TransitionGroup is a component, so its ref is the instance — the scrollport
// the edges read is its rendered `$el`.
const ladderList = ref<{ $el?: HTMLElement }>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(
  () => ladderList.value?.$el
)

// The newest rung is the LAST child, against the console, so the stack has to
// ride its own bottom edge — left alone the scrollport rests at the top and
// the freshest clue lands unseen below the fold. `scrollTop` rather than
// scrollIntoView: near a typed console that would pan the whole shell.
watch(
  () => ladder.value.length,
  async () => {
    await nextTick()
    const el = ladderList.value?.$el
    if (!el) return
    el.scrollTop = el.scrollHeight
    syncScrollEdges()
  }
)

/** The neighbour sketch, once its rung unlocks (and through the reveal, where
 *  it frames the answer rather than hinting at it). */
const sketchedNeighbours = computed(() => {
  const hints = challenge.value?.hints ?? []
  const index = hints.findIndex(rung => rung.kind === 'bounds')
  if (index < 0) return undefined
  return submitted.value || index < shownHints.value ? hints[index].neighbours : undefined
})

const start = async () => {
  const active = challenge.value
  if (!active) return

  const { CONFLICT_FIELDS, CONFLICT_FIELDS_ABROAD } = await import('~~/data/conflict-events.gen')
  field.value = CONFLICT_FIELDS[active.country]
  abroadField.value = CONFLICT_FIELDS_ABROAD[active.country]

  // Fly the camera to the DOT FIELD's own bounds before any dot lands — the
  // board is blank (solo), so the flight shows nothing, and the cloud draws
  // at a scale where its shape reads. Framing the country instead breaks on
  // giants: Russia's box spans the map while its dots huddle in the Caucasus.
  const bounds = fieldBounds([field.value])
  if (bounds) gameStore.map.feature = { d: '', kind: 'area', bounds }

  begin({
    onTimeout: () => submitRound(0),
    onTick: left => {
      const elapsed = active.durationSeconds - left
      shownWaves.value = Math.min(
        active.eras.length,
        1 + Math.floor(elapsed / active.secondsPerEra)
      )
    },
  })
  nextTick(() => guessInput.value?.focus({ auto: true }))
}

const submitRound = (score: number) => {
  const active = challenge.value
  if (!active || submitted.value) return
  stopCountdown()

  const correct = score > 0
  resolvedCorrectly.value = correct
  verdictHeadline.value = !correct
    ? `It was ${countryName(active.country)}`
    : `Well read — ${countryName(active.country)}`

  // The reveal beat: every wave lands, the world comes back, and the camera
  // pulls out to frame the country — widened to the amber abroad layer when
  // one exists, so an intervener's reveal shows its whole footprint.
  shownWaves.value = active.eras.length
  const revealBounds = abroadField.value ? fieldBounds([field.value, abroadField.value]) : undefined
  gameStore.map.feature = revealBounds ? { d: '', kind: 'area', bounds: revealBounds } : undefined
  gameStore.map.solo = false
  gameStore.map.highlighted = new Set([active.country])
  gameStore.map.focus = [active.country]
  // Green wash on success, nothing on failure — flooding the world orange
  // reads as "the whole world is wrong" rather than "you missed".
  gameStore.map.status = correct ? 'correct' : undefined

  submitOnce(correct ? [active.country] : [], score)
}

// The winning guess is never broadcast — outside hard mode the small option
// table makes even a wrong name too strong a clue (policy drops to presence).
const { spent, onGuess } = useAttemptOptions({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

header .sub {
  max-width: min(80vw, 44rem);
}

// The ladder stacks rather than spreads: one rung per line, centred, so the
// rungs read in the order they arrived. Left to wrap across the full width
// they string out as loose text with no reading order at all.
//
// Capped to --ladder-rows rungs of room and scrollable past that, so a long
// ladder never grows the footer band into the dots. `column-reverse` does the
// work: the list is in arrival order (oldest first) but paints bottom-anchored
// against the console, so its resting scroll position is the newest rung with
// no scripted scroll needed on first paint.
.hint-ladder {
  --ladder-rows: 2;
  // Row box + gap. Measured from the chip's own metrics, so retuning the chip
  // padding or the gap moves the cap with it.
  --ladder-row: 3.4rem;
  gap: 0.4rem;
  width: min(90vw, 46rem);
  margin: 0 auto;
  overflow-y: auto;
  scrollbar-width: none;
  overscroll-behavior: contain;
  flex-flow: column nowrap;
  max-height: calc(var(--ladder-rows) * var(--ladder-row));

  &::-webkit-scrollbar {
    display: none;
  }

  // Edge fades from the shared recipe (rules/_scroll-fade.scss). Only the top
  // one is wanted: it says "there are older rungs above". The bottom edge is
  // where the newest rung sits against the console and must never be dimmed,
  // so its fade is zeroed rather than left to cover the live clue.
  //
  // Deep enough to cover a whole wrapped line: the cap is a fixed height, so
  // on a narrow screen it lands MID-ROW, and a shallow fade leaves the older
  // rung sliced through its own text — which reads as broken rendering rather
  // than as something receding out of the band.
  @include scroll-fade($top: 3.2rem, $bottom: 0rem);
}

// The stack recedes as it climbs: the newest rung (age 0) carries full ink
// against the console, older ones step back in opacity and scale — the same
// language the dot waves speak, where only the newest era holds the weight.
// Capped at age 2 so a deep scroll never fades a rung to nothing.
.hint-ladder .hint-chip {
  --age: min(var(--rung-age), 2);
  flex: 0 0 auto;
  transform-origin: bottom center;
  opacity: calc(1 - var(--age) * 0.26);
  transform: scale(calc(1 - var(--age) * 0.04));
  transition:
    opacity var(--motion-slow) var(--ease-smooth),
    transform var(--motion-slow) var(--ease-smooth);
  // The audio rounds' chip sits on a dark field; this one sits on the cream
  // page, where milk-on-milk vanishes. Ink the surface instead.
  color: var(--dark-blue);
  background: #{ink(0.06)};
  border: 0.1rem solid #{ink(0.12)};
}

// `hint-pop` lands at scale(1)/opacity(1), which is exactly the newest rung's
// resting state — so only the newest may wear it. Left on every rung, the
// shared TransitionGroup class would animate an older one back to full ink and
// then drop it to its age, reading as a flicker on a chip nobody touched.
.hint-ladder .hint-chip:not(:last-child).hint-enter-active {
  animation: none;
}

.stage {
  z-index: 2;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  // The section is click-through for the map; only the controls catch input.
  > * {
    pointer-events: auto;
  }
}

.card-options {
  grid-template-columns: repeat(2, minmax(14rem, 20rem));
}

@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

// Narrow screens wrap a rung to two lines, so a row is worth roughly double
// and two full rungs would eat the dots. The band keeps ONE whole rung and
// leaves a sliver of the one above — enough to say the stack continues, which
// is the fade's job anyway.
@media (max-width: $phone) {
  .hint-ladder {
    --ladder-row: 5.2rem;
    --ladder-rows: 1.4;
  }
}
</style>
