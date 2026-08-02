<template>
  <div class="audio-dock" :class="{ playing, armed, loading }">
    <!-- Two sources: Opus/WebM covers Chrome/Firefox/Android, AAC/M4A Safari.
         With <source> children a failed load fires `error` at the FAILING
         SOURCE, not the media element — those events don't bubble, so an
         @error on <audio> is dead code. The last source is the spec's signal
         that the whole candidate list is exhausted, so the handler lives
         there. -->
    <audio ref="element" preload="auto" @timeupdate="onTimeUpdate" @ended="onEnded">
      <source :src="current.webm" type="audio/webm" />
      <source :src="current.m4a" type="audio/mp4" @error="onError" />
    </audio>

    <!-- NEVER disabled while sound could still be coaxed out: on iOS no media
         event fires before a user gesture (preload is downgraded at the OS's
         whim), so a button gated on readiness deadlocks — the press IS the
         thing that makes loading possible. -->
    <button
      type="button"
      class="stage"
      :disabled="failed"
      :aria-label="playing ? 'Pause the clip' : armed ? 'Play the clip again' : 'Play the clip'"
      @click="toggle"
    >
      <!-- The ring tracks the clip, not the round: it is the one place that
           shows how much of the recording is left to hear. -->
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" :r="RING_RADIUS" />
        <circle
          class="ring-progress"
          cx="50"
          cy="50"
          :r="RING_RADIUS"
          :stroke-dasharray="RING_CIRCUMFERENCE"
          :stroke-dashoffset="RING_CIRCUMFERENCE * (1 - heard)"
        />
      </svg>

      <span class="glyph" aria-hidden="true">
        <span v-if="loading" class="spinner" />
        <svg v-else-if="playing" class="icon" viewBox="0 0 24 24">
          <rect x="7" y="5" width="3.5" height="14" rx="1.2" />
          <rect x="13.5" y="5" width="3.5" height="14" rx="1.2" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>

    </button>

    <!-- The waveform takes the caption's place while sound is running: one
         thing in that slot at a time, and the moving bars say "listening"
         better than the word does. -->
    <Transition name="dock-swap" mode="out-in">
      <span v-if="playing" key="dial" class="dial" aria-hidden="true">
        <span v-for="bar in BAR_COUNT" :key="bar" class="bar" :style="barStyle(bar)" />
      </span>
      <p v-else key="caption" class="caption">{{ caption }}</p>
    </Transition>
  </div>
</template>
<script lang="ts" setup>
import type { AudioClip } from '~~/types/challenges/group-modes.type'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * The sound stage for the audio rounds: one big play control, a ring that
 * tracks the recording, and a level dial while it runs.
 *
 * NOTHING PLAYS ON ITS OWN. The player presses play; that press starts the clip
 * and, through `started`, the round's clock. Autoplay is not attempted at all —
 * Safari refuses it outright, and letting it succeed elsewhere would run the
 * same round two different ways depending on the browser. A deliberate press
 * also means nobody loses buzz time to a clip that is still downloading.
 *
 * The bars are decoration: they animate off the clock, never off real audio
 * analysis, so there is no AudioContext to unlock or tear down.
 */
const props = withDefaults(
  defineProps<{
    /** The recordings, in play order. One for an anthem; the tongue round
     *  ships every voice sample it has, and the dock runs them as a sequence
     *  with a breath between — then cycles from the top on a replay press. */
    clips: AudioClip[]
    /** Copy before the first play — the round is waiting on this tap. */
    idleLabel?: string
    playingLabel?: string
    endedLabel?: string
  }>(),
  {
    idleLabel: 'Tap to hear the clip',
    playingLabel: 'Listening…',
    endedLabel: 'Tap to hear it again',
  }
)

/** Fires the first time sound genuinely reaches the player — the round's clock
 *  hangs off this, never off a load event. */
const emit = defineEmits<{ started: [] }>()

const BAR_COUNT = 7
const RING_RADIUS = 44
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** The breath between samples in a sequence — long enough to read as "next
 *  voice", short enough that the listening never feels stopped. */
const INTER_CLIP_GAP_MS = 700

const element = ref<HTMLAudioElement>()
const playing = ref(false)

/** Which recording the element is loaded with. */
const index = ref(0)
const current = computed(() => props.clips[index.value] ?? props.clips[0])

/** Failed loads in the CURRENT cycle — a broken sample is skipped, but once
 *  every clip has refused in a row there is nothing left to coax. */
let consecutiveErrors = 0
let advanceTimer: ReturnType<typeof setTimeout> | undefined

/** Point the element at another recording. The `<source>` children re-render
 *  from `current`, but the element only reconsults them on load(). */
const selectClip = async (next: number) => {
  index.value = next
  await nextTick()
  element.value?.load()
}
/** True from the press until sound is confirmed running — the only moment a
 *  spinner is honest. NEVER true before a press: pre-gesture "readiness" is
 *  unknowable on iOS, which fires no media events until a gesture loads. */
const loading = ref(false)
/** True once the clip has played at all — the control becomes a replay. */
const armed = ref(false)
/** 0..1 of the RECORDING heard, for the ring. */
const heard = ref(0)
const failed = ref(false)

const caption = computed(() => {
  if (failed.value) return 'This clip could not be loaded'
  if (loading.value) return 'Loading the clip…'
  if (playing.value) return props.playingLabel
  return armed.value ? props.endedLabel : props.idleLabel
})

/** A clip that 404s must not strand the round behind a dead button. Group
 *  settlement waits on every seat, so an unstarted clock here would stall the
 *  whole table. A broken sample mid-sequence is skipped; only once EVERY clip
 *  has refused does the dock fail — and even then the round arms and runs
 *  silent rather than stalling. */
const onError = () => {
  consecutiveErrors++
  if (consecutiveErrors < props.clips.length) {
    void selectClip((index.value + 1) % props.clips.length).then(() => {
      if (playing.value || loading.value) void play()
    })
    return
  }
  loading.value = false
  playing.value = false
  failed.value = true
  if (!armed.value) {
    armed.value = true
    emit('started')
  }
}

const onTimeUpdate = () => {
  const audio = element.value
  if (!audio?.duration) return
  // The ring spans the whole SEQUENCE, so with three samples each fills a
  // third — one recording, and it collapses to the old single-clip ring.
  heard.value = Math.min(
    1,
    (index.value + Math.min(1, audio.currentTime / audio.duration)) / props.clips.length
  )
}

const onEnded = () => {
  // More voices to hear: keep the session alive through a short breath, then
  // the next sample. `playing` stays true so the dial keeps pulsing — the
  // pause is a beat in the listening, not a stop.
  if (index.value < props.clips.length - 1) {
    advanceTimer = setTimeout(async () => {
      await selectClip(index.value + 1)
      void play()
    }, INTER_CLIP_GAP_MS)
    return
  }

  // Sequence complete. Rewind to the top so the replay press cycles again.
  playing.value = false
  heard.value = 1
  if (props.clips.length > 1) void selectClip(0)
}

const play = async () => {
  const audio = element.value
  if (!audio) return
  // A finished clip restarts; a paused one resumes where it stopped.
  if (audio.ended) audio.currentTime = 0

  loading.value = true
  await audio.play().then(
    () => {
      playing.value = true
      loading.value = false
      consecutiveErrors = 0
      // The clock starts on the FIRST confirmed play and never again, so a
      // replay costs the player time rather than buying more.
      if (!armed.value) {
        armed.value = true
        emit('started')
      }
    },
    () => {
      loading.value = false
      playing.value = false
      // Distinguish "nothing here can ever play" from a refused gesture: with
      // the candidate list exhausted the button must not sit as a silent
      // dead end — that's the same stranding the source error guards.
      if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) onError()
    }
  )
}

const pause = () => {
  const audio = element.value
  if (!audio) return
  // A pause during the inter-clip breath must stop the SEQUENCE, not just
  // the (already silent) element.
  if (advanceTimer) clearTimeout(advanceTimer)
  audio.pause()
  playing.value = false
}

const toggle = () => (playing.value ? pause() : play())

const stop = () => {
  pause()
  heard.value = 0
  if (index.value !== 0) void selectClip(0)
}

// Never let audio bleed into the scorecard.
onBeforeUnmount(pause)

/** Bars idle flat under reduced motion; the caption still carries the state. */
const barStyle = (bar: number) => {
  if (prefersReducedMotion()) return { animationPlayState: 'paused' }
  // Each bar runs the same keyframe on its own fixed offset and tempo. The
  // duration must NEVER track the round clock: retiming a running CSS
  // animation remaps its phase, so a per-tick duration made every bar leap
  // mid-pulse once a second. Urgency is the console radial's job — these bars
  // only say "sound is playing".
  const spread = 0.45 + (bar % 3) * 0.12
  return {
    animationDelay: `${bar * 90}ms`,
    animationDuration: `${(0.5 + spread).toFixed(2)}s`,
  }
}

defineExpose({ play, pause, stop })
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.audio-dock {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  pointer-events: auto;
}

.stage {
  padding: 0;
  border: 0;
  width: 9.6rem;
  height: 9.6rem;
  cursor: pointer;
  display: grid;
  position: relative;
  border-radius: 50%;
  place-items: center;
  background: #{milk(0.9)};
  box-shadow: 0 0.2rem 1.6rem #{ink(0.14)};
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    box-shadow var(--motion-quick) var(--ease-smooth);

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    cursor: default;
  }
}

// The whole ring lives under the glyph, so the button reads as one object.
.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track,
.ring-progress {
  fill: none;
  stroke-width: 4;
}

.ring-track {
  stroke: #{ink(0.1)};
}

.ring-progress {
  stroke: #{flame()};
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear;
}

.glyph {
  display: grid;
  place-items: center;
}

.icon {
  width: 3.4rem;
  height: 3.4rem;
  fill: #{ink()};
}

.spinner {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  border: 0.28rem solid #{ink(0.15)};
  border-top-color: #{ink(0.6)};
  animation: spin 0.8s linear infinite;
}

// Stands where the caption otherwise sits. A FIXED-height track with the bars
// centred in it: the keyframes animate each bar's own height, so the row's
// footprint never shifts and the caps stay round at every frame.
.dial {
  gap: 0.4rem;
  height: 2.4rem;
  display: flex;
  padding: 0 1.2rem;
  align-items: center;
  justify-content: center;
  // The bars animate height (rounded caps need it), which is per-frame layout
  // × 7 for the whole clip — containment fences that reflow inside this row.
  contain: layout;
  // Its own ground, exactly like the caption it replaces — bare bars over the
  // map read as debris rather than a level meter.
  border-radius: 2rem;
  background: #{milk(0.92)};
}

.bar {
  width: 0.3rem;
  height: 0.5rem;
  // The keyframes drive height between these, so the row can never grow past
  // its track — a percentage against an auto-height parent overflowed instead.
  min-height: 0.4rem;
  max-height: 1.6rem;
  border-radius: 0.3rem;
  background: #{flame()};
  animation: audio-pulse 0.9s var(--ease-smooth) infinite alternate;
  // Promotes each bar to its own layer so the rounded caps land on whole
  // device pixels instead of being resampled every frame.
  transform: translateZ(0);
  will-change: height;
}

// Sits over the map, so it needs its own ground to stay legible against
// country borders and labels.
.caption {
  margin: 0;
  padding: 0.4rem 1.2rem;
  font-size: 1.4rem;
  font-weight: 600;
  text-align: center;
  border-radius: 2rem;
  color: var(--soft-blue);
  background: #{milk(0.92)};
}

// Caption ⇄ waveform: they share one slot, so one fades out before the other
// arrives (mode="out-in") rather than the two jostling.
.dock-swap-enter-active,
.dock-swap-leave-active {
  transition:
    opacity var(--motion-quick) var(--ease-smooth),
    transform var(--motion-quick) var(--ease-out-expressive);
}

.dock-swap-enter-from,
.dock-swap-leave-to {
  opacity: 0;
  transform: translateY(0.3rem);
}

</style>
