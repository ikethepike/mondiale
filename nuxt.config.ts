import { execSync } from 'node:child_process'

// Baked in at build time for /health. In Docker the .git dir is excluded, so
// the SHA arrives via the GIT_SHA build arg (see Dockerfile + deploy script);
// locally it comes straight from git.
const commitHash = (() => {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
})()

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
          // maximum-scale=1 suppresses the input-focus auto-zoom; iOS still
          // honours user pinch gestures despite it (accessibility override),
          // and the map/photos ship their own pinch-zoom.
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
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
  runtimeConfig: {
    public: {
      commitHash,
      buildTime: new Date().toISOString(),
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
