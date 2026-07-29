<template>
  <div v-if="challenge" class="unique-or-bust challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Unique or Bust`"
      title="Only the lonely answer pays"
      :stakes="`One letter, ${challenge.categories.length} blanks, one shared clock. An answer any rival also picks cancels to zero — reach past the obvious.`"
      @done="beginRound"
    />

    <ChallengePrompt :hint="hint">
      <template v-if="!finished">
        <!-- The letter stays sealed through the briefing: it drops for the
             whole table at once, when the clock starts. -->
        <h1 v-if="briefing" class="map-caption">Unique or Bust</h1>
        <h1 v-else class="map-caption headline-line">
          <span>The letter is</span>
          <UniqueLetterBadge :letter="challenge.letter" />
        </h1>
        <span v-if="!briefing" class="map-caption sub">{{ statusLine }}</span>
      </template>
      <template v-else>
        <h1 class="map-caption">The board is in — duplicates cancel</h1>
        <span class="map-caption sub">{{ verdictLine }}</span>
      </template>
      <GuessTicker
        v-if="!briefing && !finished"
        :entries="entries"
        :players="gameStore.game?.players ?? {}"
      />
    </ChallengePrompt>

    <!-- The briefing: a rules card each player dismisses explicitly (The
         Despot's gate). No clock runs until the whole table is ready — or the
         server's reading cap forces it. -->
    <section v-if="briefing" class="briefing briefing-card pane tr decorator-bottom">
      <UniqueLetterBadge class="banner" letter="?" />
      <h2>Unique or Bust</h2>
      <ul class="briefing-points">
        <li>A letter drops when everyone's ready. Four blanks start with it: {{ boardLine }}.</li>
        <li>Everyone writes on one clock, {{ challenge.durationSeconds }} seconds.</li>
        <li>An answer only you hold pays. Shared answers cancel to zero.</li>
        <li>Each pick locks its blank — commit with care.</li>
      </ul>
      <!-- The table, pawn by pawn: colour = briefed and ready, faded = still
           reading. The gate's state at a glance, no counting required. -->
      <div class="ready-row">
        <div
          v-for="playerId in state.order"
          :key="playerId"
          class="ready-seat"
          :class="{ waiting: !state.ready.includes(playerId) }"
        >
          <PlayerPawn class="ready-pawn" :player="gameStore.game?.players[playerId]" />
          <span class="seat-name">{{ seatName(playerId) }}</span>
        </div>
      </div>
      <ButtonFilled v-if="!iAmReady" @click="sendReady">Pencils up</ButtonFilled>
      <p v-else class="briefing-waiting">Waiting for the rest of the table…</p>
    </section>

    <section v-else-if="!finished && !showInterstitial" class="guess-box board">
      <ul class="slot-list">
        <li
          v-for="category in challenge.categories"
          :key="category"
          class="slot-row"
          :class="{ active: category === activeCategory, done: isMineLocked(category) }"
        >
          <button
            type="button"
            class="slot-face"
            :disabled="isMineLocked(category)"
            @click="activeCategory = category"
          >
            <StatTopicIcon class="slot-icon" v-bind="UNIQUE_CATEGORIES[category].icon" />
            <span class="slot-prompt">{{ UNIQUE_CATEGORIES[category].prompt }}</span>
            <!-- A locked country is a chosen-country label — it wears the flag. -->
            <CountryChip
              v-if="ownCountryPick(category)"
              class="slot-chip"
              compact
              tag="span"
              :country="ownCountryPick(category)!"
            />
            <span v-else-if="ownPick(category)" class="slot-answer">
              {{ ownPick(category)!.name }}
            </span>
            <span v-else-if="isMineLocked(category)" class="slot-answer">Locked in</span>
            <span v-else class="slot-answer open">{{ challenge.letter }}…</span>
          </button>
          <!-- Rivals who have locked this blank — presence, never the word. -->
          <span class="slot-locks">
            <PlayerPawn
              v-for="playerId in rivalsLocked(category)"
              :key="playerId"
              class="lock-pawn"
              :player="gameStore.game?.players[playerId]"
            />
          </span>
        </li>
      </ul>
    </section>

    <!-- Plain footer, no suggest-berth: the box is blind (no dropdown) — it
         only needs the keyboard lift. -->
    <footer v-if="!briefing && !finished && !showInterstitial">
      <div class="guess-box">
        <ChallengeConsole class="console" :value="secondsOnClock" :total="challenge.durationSeconds">
          <!-- Blind box: a recall round with a browsable dropdown is a menu.
               Typos still land through the submit-time fuzzy match. -->
          <SuggestInput
            v-if="!allMineLocked"
            ref="input"
            :options="activeOptions"
            :suggest="false"
            placeholder="Type your answer…"
            @pick="pick"
            @miss="announce({ hint: `Nothing on the ${categoryLabel} list by that name` })"
          />
          <p v-else class="all-in map-caption">All in — waiting for the table…</p>
        </ChallengeConsole>
      </div>
    </footer>

    <UniqueRevealGrid
      v-if="finished"
      class="reveal"
      :challenge="challenge"
      :players="gameStore.game?.players ?? {}"
      :player-id="gameStore.playerId"
    />
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import SuggestInput, { type SuggestOption } from '~/components/challenge/SuggestInput.vue'
import UniqueLetterBadge from '~/components/challenge/UniqueLetterBadge.vue'
import UniqueRevealGrid from '~/components/challenge/UniqueRevealGrid.vue'
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import PlayerPawn from '~/components/player/PlayerPawn.vue'
import { getCountry } from '~~/lib/country'
import { seatLabel } from '~~/lib/player'
import {
  UNIQUE_CATEGORIES,
  uniqueEntriesForLetter,
  uniqueRegisters,
  type UniqueEntry,
} from '~~/lib/unique-or-bust'
import { useDeadlineClock } from '~~/lib/use-deadline-clock'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { UniqueCategoryId, UniqueOrBustState } from '~~/types/challenges/group-modes.type'
import { isValidISOCode } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  hint,
  announce,
  entries,
  gameStore,
  update,
} = useGroupChallenge('unique-or-bust-challenge')

// Total fallback: timers and watchers keep evaluating for a beat after the
// round advances past this mode, so the state must never dereference undefined.
const EMPTY_STATE: UniqueOrBustState = { ready: [], deadline: 0, order: [], locked: {} }
const state = computed(() => challenge.value?.state ?? EMPTY_STATE)
const finished = computed(() => !!state.value.finished)
const briefing = computed(
  () => !!state.value.briefing && !finished.value && !showInterstitial.value
)

// The server owns the one deadline — this only repaints it. The composable's
// begin() is deliberately not called: it would arm a second, local countdown
// off durationSeconds.
const { secondsOnClock } = useDeadlineClock(
  () => state.value.deadline,
  () => challenge.value?.durationSeconds
)

const beginRound = () => {
  showInterstitial.value = false
  started.value = true
}

const seatName = (playerId: string) =>
  seatLabel(gameStore.game?.players, playerId, gameStore.playerId)

const iAmReady = computed(() => state.value.ready.includes(gameStore.playerId))
const readySent = ref(false)
const sendReady = () => {
  if (readySent.value) return
  readySent.value = true
  update({ event: 'unique-ready' })
}

const boardLine = computed(() =>
  (challenge.value?.categories ?? [])
    .map(category => UNIQUE_CATEGORIES[category].prompt.toLowerCase())
    .join(', ')
)

/** Letter-filtered options per category, from the shared registers. */
const optionsByCategory = ref<Partial<Record<UniqueCategoryId, UniqueEntry[]>>>({})

// Immediate watch, not onMounted: the challenge can land a beat after mount,
// and an early return then would leave every suggestion list empty all round.
watch(
  challenge,
  async active => {
    if (!active || Object.keys(optionsByCategory.value).length) return
    const rules = gameStore.game ?? { variant: 'world' as const, difficulty: 'normal' as const }
    const registers = await uniqueRegisters(rules)
    optionsByCategory.value = Object.fromEntries(
      active.categories.map(category => [
        category,
        uniqueEntriesForLetter(registers[category], active.letter),
      ])
    )
  },
  { immediate: true }
)

const activeCategory = ref<UniqueCategoryId>('country')
watch(
  challenge,
  active => {
    if (active) activeCategory.value = active.categories[0]
  },
  { immediate: true }
)

const categoryLabel = computed(() => UNIQUE_CATEGORIES[activeCategory.value].label.toLowerCase())
const activeOptions = computed<SuggestOption[]>(
  () => optionsByCategory.value[activeCategory.value] ?? []
)

const myLocked = computed(() => state.value.locked[gameStore.playerId] ?? [])
const isMineLocked = (category: UniqueCategoryId) =>
  myLocked.value.includes(category) || ownPicks.value[category] !== undefined
const allMineLocked = computed(() =>
  (challenge.value?.categories ?? []).every(category => isMineLocked(category))
)

/** Own picks, client-side only — the wire carries presence. After a mid-round
 *  reconnect the slot shows "Locked in" instead; the reveal restores the word. */
const ownPicks = ref<Partial<Record<UniqueCategoryId, SuggestOption>>>({})
const ownPick = (category: UniqueCategoryId) => ownPicks.value[category]

/** The locked country slot's chip subject — id is the ISO code there. */
const ownCountryPick = (category: UniqueCategoryId) => {
  if (category !== 'country') return undefined
  const pick = ownPicks.value[category]
  return pick && isValidISOCode(pick.id) ? getCountry(pick.id) : undefined
}

const rivalsLocked = (category: UniqueCategoryId) =>
  state.value.order.filter(
    playerId => playerId !== gameStore.playerId && state.value.locked[playerId]?.includes(category)
  )

const input = ref<InstanceType<typeof SuggestInput>>()

const pick = (option: SuggestOption) => {
  const category = activeCategory.value
  if (!challenge.value || finished.value || isMineLocked(category)) return

  ownPicks.value = { ...ownPicks.value, [category]: option }
  update({ event: 'submit-unique-answer', category, id: option.id })
  // Presence only — the room learns a blank was filled, never the word.
  announce({ kind: 'presence' })

  const next = challenge.value.categories.find(candidate => !isMineLocked(candidate))
  if (next) {
    activeCategory.value = next
    nextTick(() => input.value?.focus())
  }
}

const statusLine = computed(() => {
  const total = challenge.value?.categories.length ?? 0
  const mine = (challenge.value?.categories ?? []).filter(category => isMineLocked(category)).length
  if (mine >= total) return 'All in — waiting for the table'
  const open = total - mine
  return `${open} ${open === 1 ? 'blank' : 'blanks'} left — one answer locks each`
})

/** Own banked points, straight off the collision grid the server published. */
const verdictLine = computed(() => {
  const results = state.value.results ?? {}
  let banked = 0
  for (const cells of Object.values(results)) {
    for (const cell of cells) {
      if (cell.holders.includes(gameStore.playerId)) banked += cell.scored
    }
  }
  return `You banked ${banked} of ${challenge.value?.maximumPoints ?? 0} points`
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.headline-line {
  gap: 1rem;
  display: inline-flex;
  align-items: center;
}

// The rules card wears The Despot's briefing recipe — same pane classes, same
// ready-row grammar — so the tutorial gate reads identically across modes.
// Layout and scrolling come from the shared .briefing-card template.
.briefing {
  h2 {
    margin: 0;
  }
}

// The points list and ready row come from the shared .briefing-card template.

.board {
  // Centred in the space under the prompt: the suggestion list opens downward
  // from the console and needs the room below.
  margin: auto 0;
}

.slot-list {
  margin: 0;
  padding: 0;
  gap: 0.6rem;
  display: flex;
  list-style: none;
  flex-flow: column nowrap;
  width: min(42rem, calc(100vw - 3.2rem));
}

.slot-row {
  gap: 0.8rem;
  display: flex;
  align-items: center;

  &.active .slot-face {
    border-color: ink(0.55);
  }

  &.done .slot-face {
    opacity: 0.75;
    border-style: solid;
  }
}

.slot-face {
  flex: 1;
  gap: 1rem;
  display: flex;
  min-width: 0;
  cursor: pointer;
  text-align: left;
  align-items: center;
  font-family: inherit;
  font-size: 1.5rem;
  padding: 0.7rem 1.2rem;
  border-radius: 1rem;
  color: var(--dark-blue);
  background: milk(0.85);
  border: 0.15rem dashed ink(0.25);
  justify-content: space-between;

  &:disabled {
    cursor: default;
  }
}

.slot-icon {
  flex: none;
  width: 1.7rem;
  height: 1.7rem;
  opacity: 0.5;
  color: var(--dark-blue);
}

.slot-prompt {
  flex: none;
  opacity: 0.7;
  font-size: 1.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: auto;
}

.slot-answer {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;

  &.open {
    opacity: 0.35;
    font-weight: 400;
  }
}

// Flush in the row like its text siblings — the chip's padding is for
// floating over the map.
.slot-chip {
  padding: 0;
  min-width: 0;

  :deep(.chip-name) {
    font-weight: 600;
  }
}

.slot-locks {
  gap: 0.2rem;
  width: 4.4rem;
  display: flex;
  flex: none;
  justify-content: flex-start;

  .lock-pawn {
    width: 1.3rem;
    height: 1.7rem;
  }
}

.all-in {
  margin: 0;
  width: 100%;
  opacity: 0.75;
  font-size: 1.6rem;
  text-align: center;
}

.reveal {
  z-index: 2;
  margin: auto;
  overflow-y: auto;
  pointer-events: auto;
  max-height: calc(var(--viewport-height) - 16rem);
  max-width: min(76rem, calc(100% - 2.4rem));
}

@media screen and (max-width: $tablet) {
  .slot-face {
    font-size: 1.35rem;
    padding: 0.55rem 1rem;
  }

  .reveal {
    max-height: calc(var(--viewport-height) - 14rem);
  }
}
</style>
