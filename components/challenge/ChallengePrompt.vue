<template>
  <header class="challenge-prompt" :class="{ compact }">
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
 *
 * `compact` is for the modes where the prompt is NOT the equal of what it
 * introduces — a chronicle board being assembled, a ledger being ordered. The
 * question still has to be readable, so this steps the whole column down one
 * notch rather than hiding anything: the caption scale, both pills' padding
 * and the column's gaps, with the sub demoted to a caption line under a title
 * that stays the loudest thing in the header. It hands the stage ~50px on a
 * phone, which is most of a card.
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
    /** Yield the column to the stage — see the note above. */
    compact?: boolean
  }>(),
  {
    hint: undefined,
    hintTone: 'neutral',
    attributions: undefined,
    attributionLabel: undefined,
    attributionCredit: undefined,
    compact: false,
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

// The compact cut: the header yields its room to the stage below it.
//
// `:deep`, not `:slotted` — the rule has to reach the caption pills, and those
// are rendered by the mode's OWN component (an individual gate is mounted two
// levels down inside the slot), so they carry that component's scope id and
// never the prompt's slotted marker. The existing `:slotted(.sub)` padding has
// only ever applied to views that write their sub directly into the slot.
//
// The heading retunes `--caption-display` rather than declaring a size: the
// scale is the token's job (templates/_map-caption.scss), and the same shallow
// slope keeps it fluid through the intermediate widths instead of slamming into
// the cap at 700px.
.challenge-prompt.compact {
  padding-block: 1rem;
  --caption-display: clamp(1.5rem, 0.9rem + 1.1vw, 2.2rem);

  .prompt {
    gap: 0.5rem;
  }

  :deep(h1.map-caption),
  :deep(h2.map-caption) {
    padding: 0.5rem 1.6rem;
  }

  // The sub carries the instruction, so it stays a legible caption — just no
  // longer the title's equal in weight or in the room it takes.
  :deep(.map-caption.sub) {
    font-size: 1.3rem;
    padding: 0.3rem 1.2rem;
  }
}

// A heading in the prompt carries no margin of its own — the column's gap is
// what spaces it. `h1 { margin-bottom: 1em }` in text/_heading-text.scss is the
// rule being answered, and this was `:slotted(h1)`, which only reaches a
// heading a VIEW writes straight into the slot: a mode that renders one from
// its own component (every individual gate, two levels down) carried the stray
// em, worth 18-32px under the title depending on the caption scale. `:deep` is
// the superset — it matches the slotted heading and the nested one both.
//
// A heading that wants its own spacing still declares it: a component's own
// class rule outranks this attribute-plus-element selector.
:deep(h1),
:deep(h2) {
  margin: 0;
}

:deep(.sub) {
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

  // Where the squeeze is real. Side padding stays — the pills need their
  // gutter, and the round clock parks in it.
  //
  // Selected by class, not by `header.compact`: a media query adds no
  // specificity, and `header.compact` (0,2,1 once scoped) loses to the
  // unconditional `.challenge-prompt.compact` (0,3,0) above, so the phone
  // squeeze silently never applied.
  .challenge-prompt.compact {
    padding-block: 0.6rem;
  }
}
</style>
