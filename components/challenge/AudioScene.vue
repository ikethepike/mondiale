<template>
  <div class="audio-scene">
    <!-- Scenic layer per the `.challenge-shell` contract: inset, inert, behind
         everything. The field holds no controls, so it never steals a tap. -->
    <div class="field" :class="{ 'stand-down': standDown }" aria-hidden="true">
      <AudioFieldGl :iso-codes="isoCodes" :progress="progress" :settled="settled" />
    </div>

    <!-- Anything that belongs behind the stage but above the field: the anthem
         round's lyric wall lives here. -->
    <slot name="backdrop" />

    <section class="stage">
      <AudioDock
        ref="dock"
        :clips="clips"
        idle-label="Tap play to start the round"
        :playing-label="settled ? 'That was it' : 'Listening…'"
        ended-label="Tap to hear it again — the clock is still running"
        @started="emit('started')"
      />

      <!-- Chips land one at a time as the clock crosses each threshold. `hint`
           rather than the generic `chain`: no -move rule, so an arriving chip
           cannot animate its neighbours sideways. -->
      <TransitionGroup v-if="!settled" tag="ul" name="hint" class="hints hint-ladder">
        <slot name="hints" />
      </TransitionGroup>

      <slot name="stage" />
    </section>
  </div>
</template>
<script lang="ts" setup>
import AudioDock from '~/components/challenge/AudioDock.vue'
import AudioFieldGl from '~/components/challenge/AudioFieldGl.client.vue'
import type { AudioClip } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The shared scene for both audio rounds: the drifting colour field, the play
 * dock and the hint row. The two modes were near-duplicates of each other and
 * had already begun to drift apart — one had `position: relative` on its stage
 * and the other did not.
 *
 * Views supply their own prompt, hints and guess handling; everything a
 * listening round needs to look like a listening round lives here.
 */
defineProps<{
  /** The recordings, in play order — the dock sequences them. */
  clips: AudioClip[]
  /** Elapsed 0..1, driving how far the field's colours have travelled. */
  progress: number
  /** The answer's countries — one for an anthem, every speaker for a language. */
  isoCodes: ISOCountryCode[]
  /** Once the answer is out the field stops drifting and holds. */
  settled: boolean
  /** Clear the field away so the map behind it can be the reveal. the Tongues
   *  round's answer IS geography — every speaker lit at once — where the
   *  anthem round's answer is the settled colour, so only one mode asks. */
  standDown?: boolean
}>()

const emit = defineEmits<{ started: [] }>()

const dock = ref<InstanceType<typeof AudioDock>>()

/** The view owns the guess, so it needs to silence the clip on a correct one. */
defineExpose({ stop: () => dock.value?.stop() })
</script>
<style lang="scss" scoped>
.audio-scene {
  flex: 1;
  display: flex;
  min-height: 0;
  flex-flow: column nowrap;
}

// Scenic layer: full-bleed and inert, so the stage above it keeps every tap.
.field {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  transition: opacity var(--motion-slow) var(--ease-smooth);
}

// Stepping aside for the map reveal. Slower than a cross-fade on purpose: the
// colours recede as the geography arrives, so the two read as one movement.
.field.stand-down {
  opacity: 0;
}

.stage {
  flex: 1;
  gap: 1.4rem;
  display: flex;
  min-height: 0;
  padding: 1rem 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
  // Above the field and any backdrop slotted behind it.
  position: relative;
  z-index: 1;
}

// Box and chip recipe both live in `templates/_hint-ladder.scss`, shared with
// flashpoint's ladder — see the warning there about the paid-hint shop.
</style>
