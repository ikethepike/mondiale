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

  plugins: [
    "~/plugins/composition",
  ],
  components: {
    dirs: [
      '~/components',
      {
        path: '~/components/modal/',
        prefix: 'Modal',
      },
      {
        path: '~/components/map/',
        prefix: 'Map',
      },
    ],
  },
  buildModules: ['@nuxt/typescript-build', '@nuxtjs/composition-api'],

  modules: [
    '@nuxtjs/axios',
    '@nuxtjs/pwa',
  ],

  axios: {},

  serverMiddleware: [{ path: '/api', handler: '~/api/index.ts' }],

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
