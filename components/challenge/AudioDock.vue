<template>
  <div class="audio-dock" :class="{ playing, waiting }">
    <!-- Two sources: Opus/WebM covers Chrome/Firefox/Android, AAC/M4A Safari. -->
    <!-- `loadedmetadata` as well as `canplaythrough`: iOS Safari downgrades
         preload to metadata and withholds canplaythrough until a gesture, so
         waiting on it alone would leave the dock stuck on "Loading…". -->
    <audio
      ref="element"
      preload="auto"
      @canplaythrough="onReady"
      @loadedmetadata="onReady"
      @error="onReady"
      @ended="playing = false"
    >
      <source :src="clip.webm" type="audio/webm" />
      <source :src="clip.m4a" type="audio/mp4" />
    </audio>

    <div class="dial" aria-hidden="true">
      <span v-for="bar in BAR_COUNT" :key="bar" class="bar" :style="barStyle(bar)" />
    </div>

    <p class="caption">
      <span v-if="playing">{{ label }}</span>
      <span v-else-if="blocked">Tap to play — your browser held the sound</span>
      <span v-else-if="waiting">Loading the clip…</span>
      <span v-else>{{ endedLabel }}</span>
    </p>

    <!-- Always reachable while the clip isn't playing. On iOS the only way to
         start audio is a real tap, and the round's clock is already running —
         so the button must be there whether or not a play() was refused.
         A clip that has finished can be replayed: the clock is still going, so
         a second listen costs points rather than being free. -->
    <button v-if="!playing" type="button" class="replay" :class="{ unblock: blocked }" @click="play">
      {{ blocked ? 'Play the clip' : hasPlayed ? 'Hear it again' : 'Play' }}
    </button>
  </div>
</template>
<script lang="ts" setup>
import type { AudioClip } from '~~/types/challenges/group-modes.type'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * The sound stage for the audio rounds. Autoplay is blocked everywhere until a
 * real gesture, so the host view calls `play()` from the interstitial's tap —
 * the same one that starts the clock — and waits for `ready` before arming it,
 * so a slow connection can't eat the pot while the clip is still buffering.
 *
 * The bars are decoration only: they animate off the clock, never off actual
 * audio analysis, so there is no AudioContext to unlock or tear down.
 */
const props = withDefaults(
  defineProps<{
    clip: AudioClip
    /** 0..1 of the round clock left; drives the bar animation. */
    fraction?: number
    label?: string
    endedLabel?: string
    replayable?: boolean
  }>(),
  {
    fraction: 1,
    label: 'Listening…',
    endedLabel: 'Clip finished',
    replayable: false,
  }
)

const emit = defineEmits<{ ready: []; blocked: [] }>()

const BAR_COUNT = 9

const element = ref<HTMLAudioElement>()
const playing = ref(false)
const waiting = ref(true)
/** Set when the browser refused playback for want of a gesture — the view
 *  surfaces a tap-to-play button rather than running a silent round. */
const blocked = ref(false)
/** Whether the clip has been heard at least once, so the button can offer a
 *  replay rather than a first play. */
const hasPlayed = ref(false)

/** Fires on canplaythrough OR error — a clip that 404s must not hang the round;
 *  the view starts anyway and the round plays out silent rather than frozen. */
const onReady = () => {
  if (!waiting.value) return
  waiting.value = false
  emit('ready')
}

/**
 * The interstitial auto-advances on a timer as often as it is tapped, so the
 * `done` that starts the round frequently carries NO user gesture and the
 * browser refuses playback. That refusal is expected, not exceptional: catch
 * it, flag it, and let the view offer a tap — never let the round run silent
 * while the clock burns.
 */
const play = async () => {
  const audio = element.value
  if (!audio) return
  audio.currentTime = 0
  await audio.play().then(
    () => {
      playing.value = true
      hasPlayed.value = true
      blocked.value = false
    },
    () => {
      playing.value = false
      blocked.value = true
      emit('blocked')
    }
  )
}

const stop = () => {
  const audio = element.value
  if (!audio) return
  audio.pause()
  playing.value = false
}

// Never let audio bleed into the scorecard.
onBeforeUnmount(stop)

/** Bars idle flat under reduced motion; the caption still carries the state. */
const barStyle = (bar: number) => {
  if (prefersReducedMotion() || !playing.value) return { animationPlayState: 'paused' }
  // Each bar runs the same keyframe on its own offset and a length that varies
  // with the clock, so the dial visibly tightens as time runs out.
  const spread = 0.45 + (bar % 3) * 0.12
  return {
    animationDelay: `${bar * 90}ms`,
    animationDuration: `${(0.5 + spread * props.fraction).toFixed(2)}s`,
  }
}

defineExpose({ play, stop })
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.audio-dock {
  gap: 1.2rem;
  display: flex;
  padding: 1.6rem;
  align-items: center;
  flex-flow: column nowrap;
  pointer-events: auto;
}

.dial {
  gap: 0.5rem;
  height: 7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar {
  width: 0.6rem;
  height: 1.2rem;
  border-radius: 0.3rem;
  background: var(--soft-blue);
  transform-origin: center;
  animation: audio-pulse 0.9s ease-in-out infinite alternate;
  animation-play-state: paused;
}

.playing .bar {
  animation-play-state: running;
  background: #{flame()};
}

.waiting .bar {
  opacity: 0.4;
}

.caption {
  margin: 0;
  font-size: 1.4rem;
  color: var(--soft-blue);
}

.replay {
  border: 0;
  cursor: pointer;
  padding: 0.6rem 1.6rem;
  font-size: 1.3rem;
  font-weight: 600;
  border-radius: 2rem;
  color: #{milk()};
  background: #{ink()};
}
</style>
