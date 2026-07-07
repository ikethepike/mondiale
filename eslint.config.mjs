// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['data/*.gen.ts', 'generators/**/*.gen.ts', 'types/vendor/**/*.gen.ts'],
  },
  {
    rules: {
      // Single-word component names (Board, Waiting, ...) are established here
      'vue/multi-word-component-names': 'off',
      // The pre-existing type guards take `any`; surface as warnings instead
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Keep Prettier the sole authority on formatting
  prettier
)
