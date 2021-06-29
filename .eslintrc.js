module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
  },
  extends: ['@nuxtjs/eslint-config-typescript', 'prettier', 'plugin:nuxt/recommended'],
  plugins: ['prettier'],
  ignorePatterns: ['testcafe/**/*.test.ts', 'static/', '.nuxt/', 'types/declarations.d.ts'],
  rules: {
    'no-undef': 'off', // prefer ts
    'no-console': 'off',
    'vue/no-v-html': 'off',
    'no-case-declarations': 'off',
    'no-use-before-define': 'off', // prefer ts
    'prefer-regex-literals': 'off',
    'vue/order-in-components': 'off',
  },
}
