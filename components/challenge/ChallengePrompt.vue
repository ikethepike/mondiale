<template>
  <header class="challenge-prompt">
    <div class="prompt">
      <slot />
      <span v-if="attributions?.length || $slots.corner" class="prompt-corner">
        <slot name="corner" />
        <SourceInfo
          v-if="attributions?.length"
          class="prompt-source"
          :attributions="attributions"
          :label="attributionLabel"
          :item-credit="attributionCredit"
        />
      </span>
      <Transition name="caption">
        <span v-if="hint" class="map-caption hint" :class="hintTone">{{ hint }}</span>
      </Transition>
    </div>
  </header>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import type { Attribution } from '~~/lib/attribution'
import type { HintTone } from '~~/types/events.types'

/**
 * The round's header: a centred prompt column (title, subs, whatever the mode
 * stacks) with the shared miss-hint channel floating beneath it. Every
 * challenge view renders its header through this — 23 views used to carry the
 * same 30 lines of header CSS each. Pass `hint` for the standard floating
 * hint; modes with a bespoke hint treatment (Manhunt's dispatch card)
 * leave it unset and put their own in the slot.
 *
 * `hintTone` colours it. Neutral by default because most hints are not
 * failures — an unresolved name, a duplicate, a country outside the round's
 * scope — and only a genuine miss earns the alert coral. Views hand over the
 * `hintTone` ref from `useGroupChallenge` beside the `hint` it belongs to.
 *
 * `attributions` hangs the round's data provenance off the header as the
 * quiet corner ⓘ (SourceInfo). Views resolve through lib/attribution.ts and
 * pass the result — the prompt never names a source in copy.
 *
 * The `corner` slot joins that same top-right row, to the left of the ⓘ —
 * glanceable mode chrome (the gauntlet's lives) shares the corner instead of
 * absolutely positioning itself into a collision with it.
 */
withDefaults(
  defineProps<{
    hint?: string
    /** How the hint reads — see the note above. */
    hintTone?: HintTone
    /** Resolved credits for whatever data the round quotes, primary first. */
    attributions?: Attribution[]
    /** Panel heading — defaults to SourceInfo's own "Source". */
    attributionLabel?: string
    /** A single item's own credit (photographer, performer) when known. */
    attributionCredit?: string
  }>(),
  {
    hint: undefined,
    hintTone: 'neutral',
    attributions: undefined,
    attributionLabel: undefined,
    attributionCredit: undefined,
  }
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;
}

.prompt {
  gap: 1rem;
  display: flex;
  position: relative;
  align-items: center;
  flex-flow: column nowrap;
}

:slotted(h1),
:slotted(h2) {
  margin: 0;
}

:slotted(.sub) {
  padding: 0.4rem 1.4rem;
}

// The corner row (mode chrome + the provenance ⓘ) hangs off the prompt's
// top-right rather than joining the flex column — appearing must never
// reflow the question. Anchored at the column's top, so a corner pill built
// like the prompt's own first-row pill lands on the same line as it; the
// smaller ⓘ centers against whatever shares the row.
// Doubled selector: SourceInfo's own `.source-info` rule must not win.
.prompt .prompt-corner {
  top: 0;
  right: 0;
  gap: 0.2rem;
  display: inline-flex;
  position: absolute;
  align-items: center;
}

// The miss hint floats below the prompt instead of joining its flex flow —
// popping in and out must not reflow the header (or the view under it).
.hint {
  top: 100%;
  left: 0;
  right: 0;
  z-index: 3;
  width: max-content;
  max-width: 100%;
  position: absolute;
  margin: 0.4rem auto 0;
  padding: 0.4rem 1.4rem;
  // Neutral inherits .map-caption's ink; only a real miss burns.
}

.hint.alert {
  color: var(--hior-ange);
}

@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
}
</style>
