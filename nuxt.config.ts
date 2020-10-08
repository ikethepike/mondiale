import { NuxtConfig } from '@nuxt/types'

const config: NuxtConfig = {
  // Global page headers (https://go.nuxtjs.dev/config-head)
  head: {
    title: 'globalissimo',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: '' },
    ],
    link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
  },

  env: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000/',
  },
  css: [],

  plugins: [],
  components: {
    dirs: [
      '~/components',
      {
        path: '~/components/modal/',
        prefix: 'Modal',
      },
    ],
  },
  buildModules: ['@nuxt/typescript-build', '@nuxtjs/composition-api'],

  // Modules (https://go.nuxtjs.dev/config-modules)
  modules: [
    // https://go.nuxtjs.dev/axios
    '@nuxtjs/axios',
    // https://go.nuxtjs.dev/pwa
    '@nuxtjs/pwa',
  ],

  // Axios module configuration (https://go.nuxtjs.dev/config-axios)
  axios: {},

  serverMiddleware: [{ path: '/api', handler: '~/api/index.ts' }],

  // Build Configuration (https://go.nuxtjs.dev/config-build)
  build: {},
  typescript: {
    typeCheck: {
      eslint: {
        files: './**/*.{ts,js,vue}',
      },
    },
  },
}

export default config
