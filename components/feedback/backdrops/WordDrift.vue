<template>
  <div class="word-drift" aria-hidden="true">
    <span
      v-for="letter in letters"
      :key="letter.key"
      class="glyph ambient-loop"
      :style="letter.style"
    >
      {{ letter.char }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The culture card's ground — culture being what is left once the split took
 * the languages, the places and the cities out of it: the word games, where
 * the naming IS the mechanic and the subject is incidental. So: letters.
 */
const props = defineProps<{ seed: number }>()

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LETTERS = 22

const letters = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LETTERS }, (_, index) => ({
    key: `glyph-${index}`,
    char: ALPHABET[Math.floor(random() * ALPHABET.length)],
    style: {
      left: `${(random() * 104 - 2).toFixed(1)}%`,
      top: `${(random() * 104 - 2).toFixed(1)}%`,
      fontSize: `${(3 + random() * 9).toFixed(1)}rem`,
      transform: `rotate(${(random() * 24 - 12).toFixed(1)}deg)`,
      animationDelay: `${(-random() * 14).toFixed(2)}s`,
      animationDuration: `${(10 + random() * 9).toFixed(2)}s`,
      opacity: (0.18 + random() * 0.3).toFixed(2),
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.word-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.75;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.glyph {
  position: absolute;
  font-weight: bold;
  line-height: 1;
  color: ink(0.34);
  animation: glyph-settle 14s ease-in-out infinite;
}

@keyframes glyph-settle {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -0.6rem;
  }
}
</style>
