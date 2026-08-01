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

/** `Du gamla, du [[fria]]` → [{text:'Du gamla, du '},{text:'fria',blanked:true}] */
const parseLine = (line: string): LyricSpan[] => {
  const spans: LyricSpan[] = []
  // `\[\[` escapes a literal bracket pair; nothing has needed it yet.
  const pattern = /\\\[\\\[|\[\[(.+?)\]\]/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line))) {
    if (match.index > cursor) spans.push({ text: line.slice(cursor, match.index) })
    if (match[1] === undefined) spans.push({ text: '[[' })
    else spans.push({ text: match[1], blanked: true })
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

/** Only a verse that actually overflows drifts. Kimigayo is five lines; it
 *  should sit still rather than crawl for no reason. */
const measureDrift = () => {
  const element = column.value
  if (!element || prefersReducedMotion()) {
    driftDistance.value = 0
    return
  }
  const overflow = element.scrollHeight - element.clientHeight
  driftDistance.value = Math.max(0, overflow)
  driftSeconds.value = Math.round(
    (driftDistance.value / Math.max(1, window.innerHeight)) * DRIFT_SECONDS_PER_SCREEN * 2
  )
}

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
  display: flex;
  overflow: hidden;
  align-items: center;
  pointer-events: none;
  justify-content: center;
  // Fades at both edges so the text dissolves rather than being cut off.
  mask-image: linear-gradient(to bottom, transparent, #000 14%, #000 86%, transparent);
}

.verse {
  gap: 0.6em;
  margin: 0;
  padding: 12vh 6vw;
  display: flex;
  max-height: 100%;
  list-style: none;
  text-align: center;
  flex-flow: column nowrap;
  // The system stack: this is chrome, not the game's editorial voice, so it
  // stays out of the way of the serif the rest of the round is set in.
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, 'Helvetica Neue', arial, sans-serif;
}

.drifting .verse {
  animation: lyric-drift var(--drift-seconds) linear infinite alternate;
}

.line {
  opacity: 0;
  font-size: clamp(1.6rem, 4.4vw, 2.8rem);
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.01em;
  // Pale enough to sit behind the round without competing with it.
  color: #{ink(0.13)};
  animation: row-land 0.7s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 70ms);
}

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
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  .mask {
    inset: 0.12em 0;
    position: absolute;
    border-radius: 0.2em;
    background: #{ink(0.16)};
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  &.open {
    .word {
      opacity: 1;
      color: #{flame(0.5)};
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

@keyframes lyric-drift {
  to {
    transform: translateY(calc(var(--drift-distance) * -1));
  }
}
</style>
