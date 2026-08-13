import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The scoring functions are pure — no Nuxt context needed, so this runs bare.
export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // assets/ carries the shared style templates' own invariants — a shell
    // rule that outweighs the views standing in it has no on-screen tell.
    // generators/lib/ holds the PURE halves of the pipelines (the wikitext
    // parsers); the generators themselves run their whole fetch at import and
    // are not importable by a test, which is why the parse logic lives there.
    include: ['lib/**/*.test.ts', 'assets/**/*.test.ts', 'generators/lib/**/*.test.ts'],
  },
})
