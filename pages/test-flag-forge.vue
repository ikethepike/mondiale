<template>
  <!-- eslint-disable vue/no-v-html — dev harness rendering SVGs produced by
       our own forgeFlag generator; no user-supplied markup. -->
  <div class="forge">
    <header class="bar">
      <h1>Flag forge</h1>
      <div class="controls">
        <input
          v-model.trim="custom"
          type="text"
          placeholder="try a hash…"
          spellcheck="false"
          maxlength="12"
        />
        <button type="button" @click="reroll">Reroll 20</button>
      </div>
    </header>

    <section v-if="customFlag" class="hero">
      <figure class="pane tr decorator-bottom card big">
        <div class="plate" v-html="customFlag.svg" />
        <figcaption>
          <code>{{ customFlag.seed }}</code>
          <span class="chip">{{ customFlag.family }}</span>
          <span class="colors">{{ customFlag.colors.join(', ') }}</span>
        </figcaption>
      </figure>
    </section>

    <div class="grid">
      <figure v-for="flag in flags" :key="flag.seed" class="pane tr decorator-bottom card">
        <div class="plate" v-html="flag.svg" />
        <figcaption>
          <code>{{ flag.seed }}</code>
          <span class="chip">{{ flag.family }}</span>
          <span class="colors">{{ flag.colors.join(', ') }}</span>
        </figcaption>
      </figure>
    </div>
  </div>
</template>

<script setup lang="ts">
import { forgeFlag } from '~~/lib/flags/forge'

definePageMeta({ layout: false })

const HEX = '0123456789abcdef'
const randomHash = () =>
  Array.from({ length: 7 }, () => HEX[Math.floor(Math.random() * 16)]).join('')

const hashes = ref<string[]>([])
const reroll = () => {
  hashes.value = Array.from({ length: 20 }, randomHash)
}
onMounted(reroll)

const custom = ref('')
const customFlag = computed(() => (custom.value ? forgeFlag(custom.value) : null))
const flags = computed(() => hashes.value.map((h) => forgeFlag(h)))
</script>

<style scoped lang="scss">
.forge {
  min-height: 100vh;
  padding: 3rem;
  background: var(--background-color);
  color: var(--text-color);
}

.bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.6rem;

  h1 {
    margin-bottom: 0.6em;
  }
}

.controls {
  display: flex;
  gap: 1rem;

  input,
  button {
    padding: 0.6rem 1.2rem;
    border: 0.1rem solid var(--text-color);
    border-top-right-radius: 0.9rem;
    background: var(--background-color);
    color: inherit;
    font-family: inherit;
  }

  input {
    font-family: ui-monospace, Menlo, monospace;
    width: 15rem;
  }

  button {
    cursor: pointer;

    &:hover {
      background: hsla(170.5, 24.7%, 65.1%, 0.25);
    }
  }
}

.hero {
  display: grid;
  place-items: center;
  margin-bottom: 3rem;

  .big {
    width: min(46rem, 100%);
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
  gap: 2.4rem;
}

.card {
  margin: 0;
  padding: 1.2rem 1.2rem 1.4rem;
}

.plate {
  border: 0.1rem solid var(--text-color);
  aspect-ratio: 3 / 2;

  :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
}

figcaption {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1rem;
  font-size: 1.3rem;
  color: var(--dark-blue);

  code {
    font-family: ui-monospace, Menlo, monospace;
    font-weight: bold;
    color: var(--text-color);
  }
}

.colors {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
}
</style>
