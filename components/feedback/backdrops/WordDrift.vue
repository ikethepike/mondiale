<template>
  <div class="word-drift" aria-hidden="true">
    <span
      v-for="glyph in glyphs"
      :key="glyph.key"
      class="glyph"
      :class="{ script: glyph.script }"
      :style="glyph.style"
    >
      {{ glyph.char }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Letters pushing outward from the middle, in twelve scripts. */
const props = defineProps<{ seed: number }>()

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SCRIPTS =
  'ΑΒΓΔΛΠΣΦΩ' +
  'БГДЖИЛФЦЧШЯ' +
  'אבגדהחלמשת' +
  'بجحسصطعكمنه' +
  'अआकखगचजञटपबमयरल' +
  'กขคงจฉชญฐณ' +
  '가나다라마바사아' +
  'あいうえおかきくけこ' +
  '山川日月木火土水金' +
  'ԱԲԳԴԵԼՄՆ' +
  'ႠႡႢႣႤႥ' +
  'ሀለሐመሠረ'

const GLYPHS = 34

const glyphs = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: GLYPHS }, (_, index) => {
    const script = random() > 0.5
    const alphabet = script ? SCRIPTS : LATIN
    const angle = random() * Math.PI * 2
    const reach = 26 + random() * 34
    const size = 2.6 + random() * 6
    return {
      key: `glyph-${index}`,
      char: alphabet[Math.floor(random() * alphabet.length)],
      script,
      style: {
        left: `${(50 + Math.cos(angle) * reach).toFixed(1)}%`,
        top: `${(50 + Math.sin(angle) * reach * 0.9).toFixed(1)}%`,
        fontSize: `${size.toFixed(1)}rem`,
        '--spin': `${(random() * 22 - 11).toFixed(1)}deg`,
        '--at': `${(index * 0.05 + random() * 0.2).toFixed(2)}s`,
        '--drift': `${(reach * 0.22).toFixed(1)}%`,
        '--dx': `${Math.cos(angle).toFixed(3)}`,
        '--dy': `${Math.sin(angle).toFixed(3)}`,
        opacity: (0.2 + random() * 0.3).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.word-drift {
  @include backdrop-field(0.75, 1, 30%, 74%);
  overflow: hidden;
}

.glyph {
  position: absolute;
  font-weight: bold;
  line-height: 1;
  color: ink(0.38);
  translate: -50% -50%;
  animation: glyph-out 1.1s var(--ease-out-expressive) var(--at, 0s) backwards;
}

.script {
  font-family: system-ui, sans-serif;
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .glyph {
    animation: none;
  }
}

@keyframes glyph-out {
  from {
    opacity: 0;
    scale: 0.3;
    rotate: 0deg;
    translate: calc(-50% - var(--dx) * var(--drift)) calc(-50% - var(--dy) * var(--drift));
  }
  to {
    scale: 1;
    rotate: var(--spin);
  }
}
</style>
