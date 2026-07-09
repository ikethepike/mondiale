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
    include: ['lib/**/*.test.ts'],
  },
})
