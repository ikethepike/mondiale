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
    include: ['lib/**/*.test.ts', 'assets/**/*.test.ts'],
  },
})
