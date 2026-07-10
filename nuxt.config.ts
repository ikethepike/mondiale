// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  pages: true,
  css: ['~/assets/scss/main.scss'],
  modules: ['@pinia/nuxt', '@nuxt/eslint', '@tresjs/nuxt'],
  // Keep the Nuxt 3 root-level directory layout (pages/, components/, ...)
  srcDir: '.',
  dir: {
    app: 'app',
  },
  app: {
    head: {
      title: 'Mondiale',
      meta: [
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
        },
      ],
    },
  },
  // The codebase predates Nuxt 4's noUncheckedIndexedAccess default
  typescript: {
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: false,
      },
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          noUncheckedIndexedAccess: false,
        },
      },
    },
  },
  compatibilityDate: '2026-07-07',
})
