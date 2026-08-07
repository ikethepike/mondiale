<template>
  <div class="media-dock">
    <Transition name="dock" mode="out-in">
      <div v-if="expanded" key="stage" class="dock-stage">
        <div class="dock-scrim" aria-hidden="true" @click="expanded = false" />
        <div class="dock-frame">
          <!-- A single photo is the common case and its own default. A subject
               that is not one still image (World of Change's crossfading pair)
               supplies its own stage here and keeps the scrim, the frame, the
               close button and the thumb. -->
          <slot>
            <ZoomableImage :src="src" :alt="alt" />
          </slot>
          <SourceInfo
            v-if="attributions?.length"
            class="dock-source on-photo"
            label="Photo"
            :attributions="attributions"
            :item-credit="itemCredit"
          />
          <button type="button" class="dock-close" title="Collapse photo" @click="expanded = false">
            <svg class="dock-close-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      <button
        v-else
        key="thumb"
        type="button"
        class="dock-thumb"
        title="Show the photo"
        @click="expanded = true"
      >
        <img class="thumb-photo" :src="src" :alt="alt" draggable="false" />
      </button>
    </Transition>
  </div>
</template>
<script lang="ts" setup>
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import type { Attribution } from '~~/lib/attribution'

/**
 * Phone presentation for a media prompt whose ANSWER surface is the map:
 * expanded, the subject takes the stage (map dimmed behind a tap-to-close
 * scrim) for studying; collapsed, it docks as a corner thumbnail so the map
 * is fully unobscured. The host view decides when to auto-collapse (e.g. on
 * the first pin drop) via v-model:expanded.
 *
 * `src` is the dock's subject: the thumbnail always, and the expanded frame
 * unless the default slot replaces it — a prompt that is not one still image
 * stages itself there rather than reimplementing the scrim and the thumb.
 *
 * `attributions`/`itemCredit` put the photo's provenance ⓘ on the expanded
 * frame (the thumbnail has no room). Hold `itemCredit` back while the
 * photographer's line could name the answer.
 */
withDefaults(
  defineProps<{
    src: string
    alt?: string
    attributions?: Attribution[]
    itemCredit?: string
  }>(),
  { alt: 'A photo to identify', attributions: undefined, itemCredit: undefined }
)

const expanded = defineModel<boolean>('expanded', { default: true })
</script>
<style lang="scss" scoped>
// Stage, scrim, frame, close button and the dock transition come from
// templates/_dock.scss — only the photo's own pieces live here.
.media-dock {
  pointer-events: none;
}

// Top-left: the close button owns the top-right corner, the zoom controls
// the bottom-right. Doubled selector so SourceInfo's own positioning never
// wins.
.dock-frame .dock-source {
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  z-index: 4;
}

// The collapsed thumbnail borrows the wide-tile grammar: pane surface with
// the right-edge ink accent (see CountryTile's mobile mode).
.dock-thumb {
  width: 9.6rem;
  height: 7.2rem;
  padding: 0.3rem;
  display: block;
  cursor: pointer;
  appearance: none;
  overflow: hidden;
  pointer-events: auto;
  touch-action: manipulation;
  border-radius: 0.6rem 0 0 0.6rem;
  background: var(--background-color);
  border: 0.1rem solid var(--text-color);
  border-right: 0.4rem solid var(--black);
}

.thumb-photo {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 0.4rem;
}
</style>
