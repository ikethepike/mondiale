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
  // None of these trees need HMR, and watching them exhausts macOS's default
  // 256-fd limit (EMFILE): public/ is 626MB of static media nitro serves
  // straight from disk, .claude/worktrees/ can hold full repo copies, and
  // .output/ is 700MB+ of build product (screenshot dirs are Playwright
  // dumps). MUST stay dev-scoped: at build time `ignore` feeds nitro, which
  // relativizes 'public/**' against the public dir into '!**' and ships an
  // EMPTY .output/public (every static asset 404'd in prod, 2026-08-03).
  $development: {
    ignore: ['public/**', '.claude/**', '.output/**', 'screenshots/**', 'reveal-screenshots/**'],
  },
  vite: {
    server: {
      watch: {
        ignored: [
          '**/public/**',
          '**/.claude/**',
          '**/.output/**',
          '**/screenshots/**',
          '**/reveal-screenshots/**',
        ],
      },
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
  routeRules: {
    // Static public pages render ONCE at build time: the runtime server then
    // serves flat HTML and never loads their SSR chunks (the first live render
    // of `/` measured +62MB RSS — issue #110). Same HTML, same SEO; only
    // /room/* renders live, since its content arrives over the socket.
    '/': { prerender: true },
    '/privacy': { prerender: true },
    '/sources': { prerender: true },
    '/atlas': { prerender: true },
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
