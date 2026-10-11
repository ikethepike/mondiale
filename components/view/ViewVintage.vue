<template>
  <section v-if="challenge" class="vintage challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="vintage"
      title="Time runs backward"
      :stakes="stakes"
      @done="begin({ onTimeout: lockIn })"
    />
    <template v-else>
      <VintageField
        v-if="region && pass"
        :region="region"
        :labelled="challenge.labelled"
        :pass="pass"
        :starts-at="passStartsAt"
        :interactive="phase !== 'rewind'"
        :tape="flashing"
        @scene="scene => (shownScene = scene)"
      />

      <VhsRewind :active="flashing" />

      <ChallengePrompt
        ref="promptHost"
        :hint="hint"
        :hint-tone="hintTone"
        :attributions="sources"
        attribution-label="Source"
      >
        <h1 v-if="!outcome" class="map-caption">{{ headline }}</h1>
        <ChallengeResult
          v-else
          :status="verdict.kind === 'inside' || verdict.kind === 'close' ? 'correct' : 'incorrect'"
          :correct-message="verdictLine"
          :incorrect-message="verdictLine"
        >
          <p>{{ because }}</p>
          <p class="held">This map held {{ heldLine }}.</p>
        </ChallengeResult>
        <span v-if="!outcome" class="map-caption sub" :class="{ rewinding: phase === 'rewind' }">
          <RewindGlyph v-if="phase === 'rewind'" class="sub-glyph" />
          <Transition name="caption" mode="out-in">
            <span :key="caption?.key ?? phase" class="sub-line" aria-live="polite">
              {{ caption?.line ?? subline }}
            </span>
          </Transition>
        </span>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </ChallengePrompt>

      <ul v-if="legend.length" class="legend" aria-label="Whose rule">
        <li v-for="entry in legend" :key="entry.wash" class="map-caption">
          <span class="vintage-swatch" :class="`wash-${entry.wash}`" />
          {{ entry.label }}
        </li>
      </ul>

      <footer ref="consoleFooter" class="console" :class="{ lowered: phase === 'rewind' }">
        <VintageTimebar
          v-model="guess"
          class="timebar"
          :range="challenge.range"
          :interactive="phase === 'guess'"
          :disabled="phase !== 'guess' || submitted"
          :band="outcome?.runs"
          :pawns="
            outcome && myGuess !== undefined && me ? [{ player: me, year: myGuess }] : undefined
          "
          :marker="marker"
          @update:model-value="touched = true"
        />
        <div v-if="!outcome" class="lock-row">
          <ButtonFilled :disabled="phase !== 'guess' || submitted || !touched" @click="lockIn">
            {{
              submitted
                ? 'Dated'
                : phase !== 'guess'
                  ? 'Watch the map…'
                  : touched
                    ? `Date it ${guess}`
                    : 'Drag to a year'
            }}
          </ButtonFilled>
          <ChallengeTimerRadial
            v-if="phase === 'guess'"
            class="lock-clock"
            :value="Math.min(secondsLeft, VINTAGE_GUESS_SECONDS)"
            :total="VINTAGE_GUESS_SECONDS"
          />
        </div>
      </footer>
    </template>
  </section>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import RewindGlyph from '~/components/challenge/RewindGlyph.vue'
import VhsRewind from '~/components/challenge/VhsRewind.vue'
import VintageField from '~/components/challenge/VintageField.vue'
import VintageTimebar from '~/components/challenge/VintageTimebar.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { useClientEvents } from '~~/lib/events/client-side'
import {
  VINTAGE_CAPTION_MS,
  VINTAGE_FLASH_MS,
  VINTAGE_GUESS_SECONDS,
  VINTAGE_LEAD_MS,
  VINTAGE_REPLAY_BUDGET_MS,
  VINTAGE_REPLAY_LEAD_MS,
  VINTAGE_REWIND_BUDGET_MS,
} from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { usePromptBerth } from '~~/lib/use-prompt-berth'
import { useServerWindow } from '~~/lib/use-server-window'
import { useVintageStory } from '~~/lib/use-vintage-story'
import { sentenceCase } from '~~/lib/strings'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import {
  finalScene,
  loadVintageRegion,
  passCaptions,
  passLengthMs,
  passStep,
  sceneAt,
  type VintagePass,
} from '~~/lib/vintage'
import {
  WASH_RULERS,
  dealtRun,
  describeRewind,
  formatRuns,
  formatYears,
  leadChange,
  unitChanges,
  verdictReason,
  vintageVerdict,
  yearsWord,
} from '~~/lib/vintage-story'
import {
  VINTAGE_LAST_YEAR,
  VINTAGE_REGION_NAMES,
  type VintageRegion,
  type VintageWash,
} from '~~/types/vintage.types'

const VINTAGE_FRAME_PAD = { scale: 0.04, floor: 6 }

const {
  challenge,
  showInterstitial,
  submitted,
  secondsLeft,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  gameStore,
  submitOnce,
  stopCountdown,
  clearBoard,
} = useGroupChallenge('vintage-challenge')
const { seatCursor, player: me } = useClientEvents()

const sources = datasetAttribution('vintage')
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)
const promptHost = ref<InstanceType<typeof ChallengePrompt>>()
usePromptBerth(
  computed(() => promptHost.value?.$el as HTMLElement | undefined),
  () => true,
  'vintage-prompt'
)

gameStore.map.landmass = true

const region = shallowRef<VintageRegion>()
watch(
  () => challenge.value?.region,
  async id => {
    if (!id) return
    region.value = await loadVintageRegion(id)
  },
  { immediate: true }
)
watch(
  [region, showInterstitial],
  () => {
    if (!region.value) return
    gameStore.map.framePad = VINTAGE_FRAME_PAD
    gameStore.map.frame = region.value.frame
  },
  { immediate: true }
)

const round = computed(() => (gameStore.game ? latestRound(gameStore.game) : undefined))
const answer = computed(() => (me.value ? round.value?.groupAnswers[me.value.id] : undefined))
const outcome = useVintageStory(
  () => (gameStore.game ? gameStore.game.rounds.length - 1 : undefined),
  () => !!answer.value
)
const myGuess = computed(() => answer.value?.year)

const rewind = computed<VintagePass | undefined>(() => {
  const active = challenge.value
  if (!active || !region.value) return undefined
  return {
    from: finalScene(region.value),
    to: active.scene,
    weights: [...active.stepWeights].reverse(),
    budgetMs: VINTAGE_REWIND_BUDGET_MS,
    leadMs: VINTAGE_LEAD_MS,
  }
})
const replay = computed<VintagePass | undefined>(() => {
  const active = challenge.value
  if (!active || !region.value) return undefined
  return {
    from: active.scene,
    to: finalScene(region.value),
    weights: active.stepWeights,
    budgetMs: VINTAGE_REPLAY_BUDGET_MS,
    leadMs: VINTAGE_REPLAY_LEAD_MS,
  }
})

/** The replay runs on the seat's verdict hold, stamped by the server. */
const verdictAt = computed(() =>
  seatCursor.value?.step === 'round-verdict' ? seatCursor.value.enteredAt : undefined
)
const pass = computed(() =>
  outcome.value && verdictAt.value !== undefined ? replay.value : rewind.value
)
const passStartsAt = computed(() =>
  outcome.value && verdictAt.value !== undefined ? verdictAt.value : round.value?.playStartsAt
)

const playWindow = useServerWindow(
  () => round.value?.playStartsAt,
  () => challenge.value?.durationSeconds ?? 0
)
const phase = computed<'rewind' | 'guess' | 'answered'>(() => {
  if (outcome.value) return 'answered'
  if (!rewind.value || !playWindow.running.value) return 'rewind'
  return playWindow.elapsedMs.value >= passLengthMs(rewind.value) ? 'guess' : 'rewind'
})

/** The opening sign, while the round's first beats tick by — a seat that
 *  arrives mid-rewind never sees it. */
const flashing = computed(
  () =>
    phase.value === 'rewind' &&
    playWindow.running.value &&
    playWindow.elapsedMs.value < VINTAGE_FLASH_MS
)

const captions = computed(() =>
  rewind.value && challenge.value?.labelled ? passCaptions(rewind.value, VINTAGE_CAPTION_MS) : []
)
/** What the rewind is undoing right now, in words — named maps only, since a
 *  hard table's map carries no names to read the line against. */
const caption = computed(() => {
  if (phase.value !== 'rewind' || flashing.value || !region.value || !rewind.value) return
  const elapsed = playWindow.elapsedMs.value
  let current: (typeof captions.value)[number] | undefined
  for (const entry of captions.value) if (entry.atMs <= elapsed) current = entry
  if (!current) return
  const changes = unitChanges(region.value, passStep(rewind.value, current.crossing))
  const lead = leadChange(changes)
  if (!lead) return
  const more = changes.length - 1
  return {
    key: current.crossing,
    line: `${describeRewind(lead)}${more ? ` · +${more} more` : ''}`,
  }
})

const guess = ref(
  challenge.value ? Math.round((challenge.value.range[0] + challenge.value.range[1]) / 2) : 1950
)
const touched = ref(false)
const shownScene = ref<number>()

const lockIn = () => {
  if (submitted.value || gameStore.watching) return
  stopCountdown()
  submitOnce([], undefined, undefined, touched.value ? { year: guess.value } : {})
}

watch(phase, (now, before) => {
  if (now === 'guess' && before === 'rewind')
    announce({ hint: 'The map has stopped — when is it from?' })
})

const regionName = computed(() =>
  challenge.value ? VINTAGE_REGION_NAMES[challenge.value.region] : ''
)
const stakes = computed(
  () =>
    `${sentenceCase(regionName.value)}'s map runs backward from ${VINTAGE_LAST_YEAR} — borders unpick, names change, empires return. When it stops, drag to the year you think it shows.`
)
const headline = computed(() =>
  phase.value === 'rewind' ? 'Time runs backward…' : 'When is this map from?'
)
const subline = computed(() =>
  phase.value === 'rewind'
    ? 'Rewinding — watch what changes'
    : challenge.value?.labelled
      ? 'Any name or border can date it. Tap a country to read its name.'
      : 'No names this time — the lines and the colours of rule are your clues.'
)

const run = computed(() =>
  outcome.value && challenge.value ? dealtRun(outcome.value, challenge.value.scene) : undefined
)
const verdict = computed(() =>
  region.value && outcome.value && run.value && challenge.value
    ? vintageVerdict(
        region.value,
        outcome.value,
        run.value,
        challenge.value.labelled,
        myGuess.value
      )
    : ({ kind: 'none' } as const)
)
const verdictLine = computed(() => {
  const v = verdict.value
  if (v.kind === 'inside') return `Spot on — ${myGuess.value}`
  if (v.kind === 'close') return `Within ${yearsWord(v.off)} — full marks`
  if (v.kind === 'none') return 'No date given'
  return `${yearsWord(v.off)} too ${v.kind}`
})
const because = computed(() => sentenceCase(verdictReason(verdict.value)))
const heldLine = computed(() => (outcome.value ? formatRuns(outcome.value.runs) : ''))

/** The year on the ruler: masked through the rewind, then riding the replay
 *  up through every change to 2019. */
const marker = computed(() => {
  const story = outcome.value
  const active = challenge.value
  if (!story || !active) return phase.value === 'rewind' ? { label: '????' } : undefined
  if (shownScene.value === undefined || shownScene.value === active.scene)
    return run.value ? { year: run.value[0], label: formatYears(run.value) } : undefined
  const year = story.stepYears[shownScene.value - 1] ?? story.firstYear
  return { year, label: String(year) }
})

const legend = computed(() => {
  if (!region.value || shownScene.value === undefined) return []
  const washes = new Set<VintageWash>()
  for (const [shape, era] of sceneAt(region.value, shownScene.value).looks)
    if (shape >= 0 && region.value.eras[era].wash) washes.add(region.value.eras[era].wash!)
  return [...washes].map(wash => ({
    wash,
    label: wash === 'contested' ? 'Occupied or disputed' : `${WASH_RULERS[wash]} rule`,
  }))
})

onBeforeUnmount(() => {
  gameStore.map.frame = undefined
  gameStore.map.framePad = undefined
  gameStore.map.landmass = false
  clearBoard()
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;

.held {
  color: ink(0.7);
}

.legend {
  position: absolute;
  left: 2rem;
  bottom: calc(var(--footer-band, 14rem) + 1rem);
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.8rem;
    font-size: 1.2rem;
  }

  .vintage-swatch {
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 0.3rem;
    border: 1px solid ink(0.3);
  }
}

@keyframes rewind-pulse {
  50% {
    opacity: 0.45;
  }
}

.rewinding {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(64rem, calc(100vw - 3.2rem));

  .sub-glyph {
    flex: none;
    animation: rewind-pulse 1.6s ease-in-out infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }

  // The prompt's height is the map's berth: a line that wrapped mid-rewind
  // would re-frame the camera with every caption.
  .sub-line {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (max-width: $tablet) {
    .sub-line {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      white-space: normal;
      min-height: 2lh;
    }
  }
}

.caption-enter-active,
.caption-leave-active {
  transition:
    opacity var(--motion-quick) var(--ease-smooth),
    transform var(--motion-quick) var(--ease-smooth);
}
.caption-enter-from {
  opacity: 0;
  transform: translateX(0.6rem);
}
.caption-leave-to {
  opacity: 0;
  transform: translateX(-0.6rem);
}

.console {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  width: min(76rem, 92vw);
  margin: 0 auto;
  pointer-events: auto;
  transition:
    transform var(--motion-slow) var(--ease-out-expressive),
    opacity var(--motion-base) var(--ease-smooth);

  &.lowered {
    opacity: 0;
    transform: translateY(calc(100% + 3rem));
    pointer-events: none;
  }

  @media (min-width: $tablet) {
    flex-direction: row;
    align-items: flex-end;
    gap: 2.4rem;

    .lock-row {
      flex: none;
      padding-bottom: 1.6rem;
    }

    .timebar {
      flex: 1;
      min-width: 0;
    }
  }
}

@media (max-width: $tablet) {
  .legend {
    left: 1rem;
    right: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;

    li {
      padding: 0.1rem 0.6rem;
      font-size: 1.1rem;
    }
  }

  .lock-row {
    width: 100%;

    :deep(.button) {
      flex: 1;
      min-width: 0;
    }
  }
}
</style>
