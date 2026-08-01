<template>
  <div class="audio-dock" :class="{ playing, armed, loading }">
    <!-- Two sources: Opus/WebM covers Chrome/Firefox/Android, AAC/M4A Safari.
         `loadedmetadata` counts as ready as well as `canplaythrough`: iOS
         downgrades preload to metadata and withholds canplaythrough until a
         gesture, so waiting on it alone would stall on "Loading". -->
    <audio
      ref="element"
      preload="auto"
      @canplaythrough="onReady"
      @loadedmetadata="onReady"
      @error="onError"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
    >
      <source :src="clip.webm" type="audio/webm" />
      <source :src="clip.m4a" type="audio/mp4" />
    </audio>

    <button
      type="button"
      class="stage"
      :disabled="loading"
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
    clip: AudioClip
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

const element = ref<HTMLAudioElement>()
const playing = ref(false)
const loading = ref(true)
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

const onReady = () => {
  loading.value = false
}

/** A clip that 404s must not strand the round behind a dead button. */
const onError = () => {
  loading.value = false
  failed.value = true
  if (!armed.value) {
    armed.value = true
    emit('started')
  }
}

const onTimeUpdate = () => {
  const audio = element.value
  if (!audio?.duration) return
  heard.value = Math.min(1, audio.currentTime / audio.duration)
}

const onEnded = () => {
  playing.value = false
  heard.value = 1
}

const play = async () => {
  const audio = element.value
  if (!audio) return
  // A finished clip restarts; a paused one resumes where it stopped.
  if (audio.ended) audio.currentTime = 0

  await audio.play().then(
    () => {
      playing.value = true
      loading.value = false
      // The clock starts on the FIRST confirmed play and never again, so a
      // replay costs the player time rather than buying more.
      if (!armed.value) {
        armed.value = true
        emit('started')
      }
    },
    () => {
      playing.value = false
    }
  )
}

const pause = () => {
  const audio = element.value
  if (!audio) return
  audio.pause()
  playing.value = false
}

const toggle = () => (playing.value ? pause() : play())

const stop = () => {
  pause()
  heard.value = 0
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
