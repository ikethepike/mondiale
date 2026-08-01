<template>
  <div v-if="lines.length" class="lyric-wall" :class="{ revealed, translated }">
    <Transition name="wall" appear>
      <ol class="verse" :style="{ '--line-count': lines.length }">
        <li v-for="(line, index) in lines" :key="index" class="line" :style="{ '--i': index }">
          <template v-for="(span, spanIndex) in line" :key="spanIndex">
            <span v-if="span.blanked" class="span blanked" :class="{ open: revealed }">
              <!-- The word sits underneath the mask the whole time: the mask is
                   what fades, so the line never reflows on the reveal. -->
              <span class="word">{{ span.text }}</span>
              <span class="mask" aria-hidden="true" />
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

/**
 * The anthem's own words, drifting up behind the round.
 *
 * A hint, never the question: anything naming the country is masked while the
 * clock runs. When it stops, the masks fade off and the verse cross-fades into
 * English — the beat where the round tells you what was being sung.
 *
 * Format and the licensing rules for adding a country:
 * public/anthems/lyrics/readme-anthems.md
 */
const props = withDefaults(
  defineProps<{
    lyrics?: AnthemLyrics
    /** Clock is done: drop the masks. */
    revealed?: boolean
    /** Swap the local verse for its English rendering. */
    translated?: boolean
    /** Keeps the wall to a sane height — anthems run from 5 lines to 95. */
    maxLines?: number
  }>(),
  { lyrics: undefined, revealed: false, translated: false, maxLines: 10 }
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

const lines = computed<LyricSpan[][]>(() => {
  const verses = props.lyrics?.verses ?? []
  const column = verses.flatMap(verse => (props.translated ? verse.english : verse.local))
  return column
    .filter(line => line.trim())
    .slice(0, props.maxLines)
    .map(parseLine)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Its own ground: the verse sits over the map, and unbacked italic text is
// unreadable against country borders and labels.
.lyric-wall {
  display: flex;
  padding: 1.4rem 1.8rem;
  max-width: min(52rem, 90vw);
  border-radius: 1.2rem;
  pointer-events: none;
  justify-content: center;
  background: #{milk(0.9)};
  backdrop-filter: blur(2px);
}

.verse {
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  text-align: center;
  flex-flow: column nowrap;
}

// Lines drift up in sequence, so the wall reads as arriving rather than
// appearing. The stagger is bounded so a long verse still lands promptly.
.line {
  opacity: 0;
  font-size: 1.5rem;
  line-height: 1.5;
  color: #{ink(0.62)};
  font-style: italic;
  animation: row-land 0.6s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 90ms);
}

.span {
  white-space: pre-wrap;
}

// The masked word keeps its width, so line length stays a legible clue — the
// mask covers the letters without collapsing the shape of the verse.
.blanked {
  position: relative;
  display: inline-block;

  .word {
    opacity: 0;
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  .mask {
    inset: 0.1em 0;
    position: absolute;
    border-radius: 0.3rem;
    background: #{ink(0.34)};
    transition: opacity var(--motion-base) var(--ease-smooth);
  }

  &.open {
    .word {
      opacity: 1;
      color: #{flame()};
      font-weight: 600;
    }

    .mask {
      opacity: 0;
    }
  }
}

// The whole wall fades between local and English, so the swap reads as one
// movement rather than ten lines changing independently.
.wall-enter-active,
.wall-leave-active {
  transition: opacity var(--motion-slow) var(--ease-smooth);
}

.wall-enter-from,
.wall-leave-to {
  opacity: 0;
}

@media screen and (max-width: 480px) {
  .line {
    font-size: 1.3rem;
  }
}
</style>
