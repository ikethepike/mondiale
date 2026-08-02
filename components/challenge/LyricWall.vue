<template>
  <div v-if="lines.length" class="lyric-wall" :class="{ revealed, drifting }" aria-hidden="true">
    <Transition name="wall" appear>
      <ol
        :key="translated ? 'english' : 'local'"
        ref="column"
        class="verse"
        :style="{ '--drift-seconds': `${driftSeconds}s`, '--drift-distance': `${driftDistance}px` }"
      >
        <li v-for="(line, index) in lines" :key="index" class="line" :style="{ '--i': index }">
          <template v-for="(span, spanIndex) in line" :key="spanIndex">
            <span v-if="span.blanked" class="span blanked" :class="{ open: revealed }">
              <!-- The word sits under the mask the whole time: the mask is what
                   fades, so the line never reflows on the reveal. -->
              <span class="word">{{ span.text }}</span>
              <span class="mask" />
            </span>
            <span v-else class="span">{{ span.text }}</span>
          </template>
        </li>
      </ol>
    </Transition>
  </div>
</template>
<script lang="ts" setup>
import type { AnthemLyrics, LyricSpan } from '~~/types/challenges/group-modes.type'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * The anthem's words as a full-bleed backdrop — a "now playing" wall behind the
 * round rather than a card on top of it. Decorative: `aria-hidden`, no pointer
 * events, and it sits under every interactive layer.
 *
 * A verse taller than the screen drifts slowly upward on a loop. It makes NO
 * attempt to follow the recording: anthems run from five lines to ninety-five,
 * so any sync would be fiction. The drift is atmosphere, not karaoke.
 *
 * Format: public/anthems/lyrics/readme-anthems.md
 */
const props = withDefaults(
  defineProps<{
    lyrics?: AnthemLyrics
    /** Clock is done: drop the masks. */
    revealed?: boolean
    /** Swap the local verse for its English rendering. */
    translated?: boolean
  }>(),
  { lyrics: undefined, revealed: false, translated: false }
)

/**
 * `Du gamla, du [[fria]]` → [{text:'Du gamla, du '},{text:'fria',blanked:true}]
 *
 * Leading and trailing spaces around a mask are moved OUT of the masked span
 * and kept as their own plain span. A masked word is `inline-block` so its
 * width survives the reveal, and Vue strips the whitespace between element
 * tags — so a space left at the edge of a mask vanished and the words collided.
 */
const parseLine = (line: string): LyricSpan[] => {
  const spans: LyricSpan[] = []
  // `\[\[` escapes a literal bracket pair; nothing has needed it yet.
  const pattern = /\\\[\\\[|\[\[(.+?)\]\]/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line))) {
    if (match.index > cursor) spans.push({ text: line.slice(cursor, match.index) })
    if (match[1] === undefined) {
      spans.push({ text: '[[' })
    } else {
      // Split the padding off so it renders as ordinary text either side of the
      // inline-block mask, rather than being swallowed with it.
      const [, before = '', word = '', after = ''] = match[1].match(/^(\s*)(.*?)(\s*)$/s) ?? []
      if (before) spans.push({ text: before })
      spans.push({ text: word, blanked: true })
      if (after) spans.push({ text: after })
    }
    cursor = match.index + match[0].length
  }
  if (cursor < line.length) spans.push({ text: line.slice(cursor) })
  return spans
}

/** Every line of the chosen column — the wall shows the whole text and lets the
 *  drift handle length, rather than truncating a verse mid-thought. */
const lines = computed<LyricSpan[][]>(() => {
  const verses = props.lyrics?.verses ?? []
  const column = verses.flatMap(verse => (props.translated ? verse.english : verse.local))
  return column.filter(line => line.trim()).map(parseLine)
})

/** Seconds of travel per screen-height of overflow: slow enough to read a line
 *  twice, so it reads as breathing rather than scrolling. */
const DRIFT_SECONDS_PER_SCREEN = 40

const column = ref<HTMLElement>()
const driftDistance = ref(0)
const driftSeconds = ref(0)
const drifting = computed(() => driftDistance.value > 0)

/**
 * Only a verse taller than the screen drifts — Kimigayo is five lines and
 * should sit still rather than crawl for no reason.
 *
 * Measured as CONTENT vs the wall's own box, not `scrollHeight - clientHeight`
 * on the column: the column is centred in a grid cell, so it shrink-wraps its
 * content and those two are always equal. That returned zero for every verse
 * and no wall ever drifted.
 */
const measureDrift = () => {
  const element = column.value
  const frame = element?.parentElement
  if (!element || !frame || prefersReducedMotion()) {
    driftDistance.value = 0
    return
  }

  // The scroll height of the line stack against the height available to it.
  const content = element.scrollHeight
  const available = frame.clientHeight
  const overflow = content - available
  // Ignore hairline overflows: a couple of stray pixels are a rounding artefact,
  // not a verse that needs to move.
  driftDistance.value = overflow > MINIMUM_DRIFT_PX ? overflow : 0
  driftSeconds.value = Math.max(
    DRIFT_SECONDS_PER_SCREEN,
    Math.round((driftDistance.value / Math.max(1, available)) * DRIFT_SECONDS_PER_SCREEN)
  )
}

/** Below this, the overflow is rounding noise rather than real spill. */
const MINIMUM_DRIFT_PX = 24

onMounted(() => {
  measureDrift()
  window.addEventListener('resize', measureDrift)
})
onBeforeUnmount(() => window.removeEventListener('resize', measureDrift))
// Re-measure when the column swaps to English: the translation is a different
// length, so its overflow is different too.
watch(() => [props.translated, lines.value.length], () => nextTick(measureDrift))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Full-bleed backdrop. Pinned behind everything and inert: the round's own
// chrome and the guess console must stay reachable through it.
.lyric-wall {
  position: absolute;
  inset: 0;
  z-index: 0;
  // Multiply presses the ink INTO the colour field: the verse always darkens
  // what it sits on, so the contrast ratio holds over every palette the clamp
  // allows — no halos, no shadows, just the glyphs. It must sit HERE, on the
  // wall root — the verse's drift transform isolates a stacking context, so a
  // blend set any deeper never reaches the field.
  mix-blend-mode: multiply;
  // Grid rather than flex: both columns occupy the SAME cell (see the swap
  // rules below), so the longer English verse cannot reflow the shorter local
  // one mid-fade.
  display: grid;
  overflow: hidden;
  place-items: center;
  pointer-events: none;
  // Fades at both edges so the text dissolves rather than being cut off. The
  // bottom fade now runs to just above the console band: the console carries
  // its own solid milk surface, so the verse only needs to be out from under
  // its top edge (~74% of the shell on a phone), not banished half a screen
  // above it — the wall gets to USE the stage it stands on.
  mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 10%,
    #000 58%,
    #{rgba(#000, 0.35)} 74%,
    transparent 84%
  );
}

.verse {
  // Both columns share one cell so the swap cross-fades in place instead of
  // reflowing — the English lines run longer than the local ones.
  grid-area: 1 / 1;
  gap: 0.45em;
  margin: 0;
  // Generous gutters, and enough room top and bottom that the mask fades over
  // empty space rather than mid-word.
  padding: 10vh clamp(1.6rem, 7vw, 8rem);
  width: 100%;
  display: flex;
  max-width: 76rem;
  list-style: none;
  text-align: left;
  flex-flow: column nowrap;
  // The system stack: this is chrome, not the game's editorial voice, so it
  // stays out of the way of the serif the rest of the round is set in.
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, 'Helvetica Neue', arial, sans-serif;
}

.drifting .verse {
  animation: lyric-drift var(--drift-seconds) linear infinite alternate;
}

// Big, soft and set on its own terms — the Apple Music treatment. The size
// scales with the viewport so a phone gets the same presence a desktop does,
// and long lines wrap rather than shrinking to fit.
.line {
  opacity: 0;
  // Size tracks the SHORTER edge too, so a wide-but-short desktop window does
  // not blow the verse past the bottom of the screen.
  font-size: clamp(2rem, min(5.6vw, 4.6vh), 4.2rem);
  font-weight: 700;
  line-height: 1.45;
  text-wrap: balance;
  letter-spacing: -0.02em;
  // Dense enough for a clear contrast ratio under the wall's multiply — the
  // Apple Music read: crisp glyphs against the artwork, no halo. Still shy of
  // solid, so the field's colour breathes through the strokes and the wall
  // stays a backdrop rather than becoming foreground copy.
  color: #{ink(0.5)};
  animation: row-land 0.7s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 70ms);
}

// pre-wrap keeps the spaces the parser hands us: the compiler strips whitespace
// between element tags, so a plain span holding " " would otherwise collapse and
// the word either side of a mask would touch it.
.span {
  white-space: pre-wrap;
}

// Masked words keep their width, so line length stays a clue and nothing
// reflows when the mask lifts.
.blanked {
  position: relative;
  display: inline-block;

  .word {
    opacity: 0;
    // inline-block so the reveal's scale beat actually applies — transforms
    // are ignored on a plain inline box.
    display: inline-block;
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  .mask {
    inset: 0.12em 0;
    position: absolute;
    border-radius: 0.2em;
    background: #{ink(0.16)};
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  // Revealed: the hidden words are the whole point of the wall — the thing
  // that would have named the country. They come up brighter than the verse
  // around them and settle, so the eye lands on them rather than scanning.
  &.open {
    .word {
      opacity: 1;
      color: #{flame()};
      animation: lyric-strike var(--motion-slow) var(--ease-out-expressive) both;
    }

    .mask {
      opacity: 0;
    }
  }
}

// Local ⇄ English swap the whole wall at once, so it reads as one movement.
.wall-enter-active,
.wall-leave-active {
  transition: opacity var(--motion-slow) var(--ease-smooth);
}

.wall-enter-from,
.wall-leave-to {
  opacity: 0;
}

// The revealed word swells briefly before settling — a beat of emphasis on the
// span that was hiding the answer.
@keyframes lyric-strike {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.09);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes lyric-drift {
  to {
    transform: translateY(calc(var(--drift-distance) * -1));
  }
}
</style>
