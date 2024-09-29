// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  pages: true,
  css: ['~/assets/scss/main.scss'],
  modules: ['@pinia/nuxt'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'Mondiale',
    },
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or 'modern'
        },
      },
    },
  },
  compatibilityDate: '2024-09-26',
})
