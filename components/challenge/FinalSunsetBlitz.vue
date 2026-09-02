<template>
  <div class="final-sunset-blitz">
    <!-- The night itself is two real layers, no big overlay: the SEA darkens
         via a gradient plane UNDER the map (body.sunset-blitz .layout::before,
         slid by the --sunset-veil transform), and the LAND rolls through an
         amber dusk on its own paths (.sunset-dark). Lit countries paint above
         both, so nothing ever dims them. Only the terminator itself floats
         above everything: a narrow glowing band that makes the front legible
         across land and sea alike. -->
    <div class="terminator" :class="{ settled: finished }" aria-hidden="true">
      <span class="band" />
    </div>
    <footer ref="consoleFooter" class="shell-footer">
      <NightConsole
        v-show="!finished"
        :lit="named.size"
        :quota="quota"
        :seconds-left="secondsLeft"
        :duration-seconds="challenge.durationSeconds"
        :feedback="feedback"
        :beads="beads"
      >
        <CountryGuessInput
          ref="guessInput"
          placeholder="Type a country before it goes dark…"
          :disabled="paused || finished"
          :excluded="excluded"
          @guess="onGuess"
        />
      </NightConsole>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import NightConsole, { type LanternState } from '~/components/challenge/NightConsole.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { MAP_REGIONS } from '~~/data/map.gen'
import { NIGHT_CHROME, setChromeTint } from '~~/lib/chrome-tint'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { playableCountries } from '~~/lib/game-rules'
import { SUNSET_TILT, sunsetDuskCoordinate, sunsetQuota } from '~~/lib/sunset-window'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { currentViewBox, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/**
 * The gauntlet finale. The camera frames the dealt window and its field
 * stands lit against a receded world; night sweeps it east→west along a
 * tilted terminator, and a correctly typed country "holds the light" while
 * unnamed ones tint dark as the line passes them — once dark, they're gone.
 *
 * The sweep runs in map-space dusk coordinates and is projected onto the
 * screen through the live map viewBox, so the drawn line and the tint timing
 * can never disagree (a country is dark exactly when the line has passed
 * it). Client-trust grading, like the higher-lower gates.
 */
const props = defineProps<{ challenge: SunsetBlitzChallenge; paused: boolean }>()

const emit = defineEmits<{
  finished: [named: ISOCountryCode[]]
}>()

const { gameStore, game } = useClientEvents()

// The night takes every country it crosses — the whole board darkens on
// screen — but only the window's field can be named or scored
const pool = computed(() =>
  game.value
    ? playableCountries(game.value)
    : playableCountries({ variant: 'world', difficulty: 'normal' })
)
const field = new Set(props.challenge.countries)

const TICK_MS = 100
// The frame is the subject: the default pad floor would push the field into
// the middle third of the screen
const WINDOW_FRAME_PAD = { scale: 0.06, floor: 12 }

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const named = ref(new Set<ISOCountryCode>())
const elapsedMs = ref(0)
const finished = ref(false)
const feedback = ref('')
// Subscribing keeps the camera poller live; the ticker reads currentViewBox()
// imperatively so the veil tracks the true camera between the bus's
// reactive commits.
useMapViewBox()

// The dealt window stays visible above the console (and the keyboard); the
// sweep bounds lock against the berthed camera, so line and window agree
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

const durationMs = props.challenge.durationSeconds * 1000
// The sweep clock starts once the camera has settled and the bounds are
// locked — the full duration buys one constant-speed crossing of the region
const sweepElapsed = ref(0)
const fraction = computed(() =>
  boundsLocked.value ? Math.min(1, sweepElapsed.value / durationMs) : 0
)
const secondsLeft = computed(() => Math.max(0, Math.ceil((durationMs - sweepElapsed.value) / 1000)))
// The sweep in dusk-coordinate space: seeded from the window, then widened
// to the locked camera's true edges so the night ENTERS from off-screen east
// and has fully crossed the screen when time runs out
const duskCoordinates = props.challenge.countries.map(sunsetDuskCoordinate)
const duskMax = Math.max(...duskCoordinates)
const duskMin = Math.min(...duskCoordinates)
const duskMargin = Math.max(6, (duskMax - duskMin) * 0.1)
const sweepStart = ref(duskMax + duskMargin * 2)
const sweepEnd = ref(duskMin - duskMargin)

// Pure linear motion: one constant speed from just off the east edge to just
// past the west edge. The bounds lock ONCE after the camera settles —
// adjusting them mid-flight remaps the clock and the line lurches.
const SETTLE_DELAY_MS = 1500
const boundsLocked = ref(false)
let sweepClockStart = 0

const lockSweepBounds = () => {
  if (boundsLocked.value || elapsedMs.value < SETTLE_DELAY_MS) return
  const vb = currentViewBox()
  if (vb?.w) {
    const tan = Math.tan(SUNSET_TILT)
    sweepStart.value = Math.max(sweepStart.value, vb.x + vb.w - vb.y * tan + 8)
    sweepEnd.value = Math.min(sweepEnd.value, vb.x - (vb.y + vb.h) * tan - 8)
  }
  boundsLocked.value = true
  sweepClockStart = performance.now()
}

const currentDusk = computed(
  () => sweepStart.value - fraction.value * (sweepStart.value - sweepEnd.value)
)

const isDark = (isoCode: ISOCountryCode) => sunsetDuskCoordinate(isoCode) >= currentDusk.value

/**
 * The VISUAL darkening waits for the line to pass a country's western edge —
 * by centre alone, a giant like Russia blacks out land far ahead of the
 * terminator. The game rule (isDark, centre-based) stays: a country whose
 * tail is still lit remains typeable, which matches what the eye sees.
 */
const duskWestCoordinate = (isoCode: ISOCountryCode): number => {
  const rings = MAP_REGIONS[isoCode]
  if (!rings?.length) return sunsetDuskCoordinate(isoCode)
  const [x, y, , height] = rings[0]!
  return x - (y + height / 2) * Math.tan(SUNSET_TILT)
}
const isFullyPast = (isoCode: ISOCountryCode) => duskWestCoordinate(isoCode) >= currentDusk.value

// Countries outside the field stay suggestible: a list that only ever offers
// the window's names would hand the field over
const excluded = computed(() => [
  ...named.value,
  ...props.challenge.countries.filter(isoCode => !named.value.has(isoCode) && isDark(isoCode)),
])

const quota = computed(() => sunsetQuota(props.challenge))

// One lantern per country in the order the night takes them
const beads = computed<LanternState[]>(() =>
  props.challenge.countries.map(isoCode =>
    named.value.has(isoCode) ? 'lit' : isDark(isoCode) ? 'dark' : 'pending'
  )
)

/**
 * The night edge projected through the live camera. In map space the line is
 * x = d + y·tanθ; each screen-y maps through the viewBox to screen percent,
 * and the sea plane under the map is slid/tilted to match with a single
 * transform (compositor-only) via the --sunset-veil custom property.
 */
const positionSeaNight = () => {
  const vb = currentViewBox()
  if (!vb || !vb.w) return
  const dusk = currentDusk.value
  const tan = Math.tan(SUNSET_TILT)
  const toScreenX = (mapX: number) => ((mapX - vb.x) / vb.w) * 100
  const top = toScreenX(dusk + vb.y * tan)
  const bottom = toScreenX(dusk + (vb.y + vb.h) * tan)

  const width = window.innerWidth
  const height = window.innerHeight
  const midPx = (((top + bottom) / 2) * width) / 100
  const angle = (-Math.atan2(((bottom - top) / 100) * width, height) * 180) / Math.PI
  document.body.style.setProperty('--sunset-veil', `translateX(${midPx}px) rotate(${angle}deg)`)
}

let ticker: ReturnType<typeof setInterval> | undefined
let startedAt = 0

const finish = () => {
  if (finished.value) return
  finished.value = true
  if (ticker) clearInterval(ticker)
  // The night completes: every unlit country rolls through the same dusk,
  // the sea and page settle dark — full scene, in City Nocturne's exact
  // palette. The two modes echo.
  for (const isoCode of pool.value) {
    if (!named.value.has(isoCode)) darken(isoCode)
  }
  document.body.classList.add('sunset-settled')
  // Only now: mid-sweep the body abutting the browser chrome is still day —
  // the rolling night is the clipped .layout::before plane, never the bar
  setChromeTint(NIGHT_CHROME)
  emit('finished', [...named.value])
}

// Night takes every country it crosses, windowed or not — on the REAL map
// paths (nocturne's technique), each blushing amber before going dark as the
// line passes it, while the day side stays untouched
const darkPaths = new Set<Element>()
const darken = (isoCode: ISOCountryCode) => {
  const path = document.querySelector(`.game-map path[data-id][id="${isoCode}"]`)
  if (!path || path.classList.contains('sunset-dark')) return
  path.classList.add('sunset-dark')
  darkPaths.add(path)
}
const paintNightfall = () => {
  for (const isoCode of pool.value) {
    if (!named.value.has(isoCode) && isFullyPast(isoCode)) darken(isoCode)
  }
}

const start = () => {
  if (ticker || finished.value) return
  gameStore.map.frame = props.challenge.frame
  gameStore.map.framePad = WINDOW_FRAME_PAD
  gameStore.map.spotlight = [...props.challenge.countries]
  document.body.classList.add('sunset-blitz')
  startedAt = performance.now()
  guessInput.value?.focus({ auto: true })
  ticker = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt
    lockSweepBounds()
    // Until the camera settles and the bounds lock, the night stays entirely
    // off-screen (the --sunset-veil fallback) and takes no land — positioning
    // against a mid-flight viewBox drags the veil across the territory
    if (!boundsLocked.value) return
    sweepElapsed.value = performance.now() - sweepClockStart
    positionSeaNight()
    paintNightfall()
    if (sweepElapsed.value >= durationMs) finish()
  }, TICK_MS)
}

let feedbackTimeout: ReturnType<typeof setTimeout> | undefined
const flash = (message: string) => {
  feedback.value = message
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  feedbackTimeout = setTimeout(() => (feedback.value = ''), 1800)
}

// A named country ignites on the real map path — a one-shot flare that
// settles into a warm lit fill. Classes are cleaned up on unmount; the
// standard highlight stays underneath as the post-round "stayed lit" state.
const litPaths = new Set<Element>()
const ignite = (isoCode: ISOCountryCode) => {
  const path = document.querySelector(`.game-map path[data-id][id="${isoCode}"]`)
  if (!path) return
  path.classList.add('sunset-lit')
  litPaths.add(path)
}

const onGuess = (country: Country) => {
  const { isoCode } = country
  if (!field.has(isoCode)) {
    return flash(`${countryName(country)} isn't under tonight's sky.`)
  }
  if (named.value.has(isoCode)) return
  if (isDark(isoCode)) {
    return flash(`${countryName(country)} is already gone.`)
  }

  named.value.add(isoCode)
  gameStore.map.highlighted.add(isoCode)
  ignite(isoCode)

  if (props.challenge.countries.every(code => named.value.has(code))) finish()
}

watch(
  () => props.paused,
  paused => {
    if (!paused) start()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  litPaths.forEach(path => path.classList.remove('sunset-lit'))
  darkPaths.forEach(path => path.classList.remove('sunset-dark'))
  document.body.classList.remove('sunset-blitz')
  document.body.classList.remove('sunset-settled')
  document.body.style.removeProperty('--sunset-veil')
  setChromeTint()
})
</script>
<style lang="scss">
body.sunset-blitz {
  // The sweep holds still: no panning or zooming while the terminator runs —
  // the dusk line, the darkened land and the framed window must stay in
  // agreement
  .game-map {
    pointer-events: none;
  }

  // The world beyond the field is already in twilight: its land recedes and
  // its borders soften, so the window reads as the stage before the night
  // even enters
  .game-map path[data-id].dimmed-country:not(.sunset-dark):not(.sunset-lit) {
    fill-opacity: 0.35;
    transition: fill-opacity 1.2s var(--ease-smooth);
  }

  // The sea's night: a gradient plane UNDER the map svg (the ocean is the
  // page showing through), slid and tilted by one transform per tick —
  // compositor-only, and it converges on City Nocturne's page night. Land
  // and lit countries paint over it untouched.
  // Oversized well past the viewport: the rotation must never swing a corner
  // into view and let the day peek under the night
  .layout::before {
    content: '';
    top: -75vh;
    left: 0;
    width: 340vw;
    height: 250vh;
    position: absolute;
    transform: var(--sunset-veil, translateX(200vw));
    transform-origin: left center;
    border-radius: 5vw 0 0 5vw / 50% 0 0 50%;
    // A burning horizon on the water: gold into rose into night
    background: linear-gradient(
      90deg,
      hsla(35, 95%, 62%, 0) 0,
      hsla(35, 95%, 58%, 0.55) 2vw,
      hsla(2, 65%, 45%, 0.55) 8vw,
      hsla(216, 50%, 7%, 0.85) 20vw,
      var(--night-page) 38vw
    );
    transition: transform 0.12s linear;
    will-change: transform;
  }
}

// A country the night has taken: it blushes amber, then joins City
// Nocturne's exact night. Keyframes (not a transition) because an animation
// outranks the engine's inline fill writes without needing !important —
// which would kill the dusk roll entirely.
.game-map path[data-id].sunset-dark {
  stroke: var(--night-stroke) !important;
  stroke-width: 1.1px !important;
  vector-effect: non-scaling-stroke;
  animation: country-dusk 3.6s var(--ease-smooth) forwards;
}

@keyframes country-dusk {
  0% {
    fill: hsl(36, 45%, 92%);
  }
  18% {
    fill: hsl(30, 62%, 60%);
  }
  100% {
    fill: var(--night-land);
  }
}

// The run is over: page and sea settle on City Nocturne's night, and any
// shape outside the played pool (disputed areas, far territories) joins the
// dark. The blanket excludes the animated/lit paths so it can't fight them,
// and outranks the correct/incorrect map wash at the reveal.
body.sunset-settled {
  background: var(--night-page);
  transition: background 1.4s var(--ease-smooth);

  .game-map path[data-id]:not(.sunset-lit):not(.sunset-dark) {
    fill: var(--night-land) !important;
    stroke: var(--night-stroke) !important;
    stroke-width: 1.1px !important;
    vector-effect: non-scaling-stroke;
    transition:
      fill 1.4s var(--ease-smooth),
      stroke 1.4s var(--ease-smooth);
  }
}

// Unscoped: the ignition styles the REAL map paths, so it moves with the
// camera natively. !important wins over the engine's inline stroke writes.
.game-map path[data-id].sunset-lit {
  fill: hsla(45, 90%, 74%, 0.95) !important;
  stroke: hsla(38, 90%, 42%, 0.9) !important;
  filter: drop-shadow(0 0 0.5rem hsla(45, 96%, 65%, 0.75));
  animation: sunset-ignite 0.7s var(--ease-smooth);
}

@keyframes sunset-ignite {
  from {
    filter: drop-shadow(0 0 1.6rem hsla(45, 96%, 62%, 1));
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-map path[data-id].sunset-lit {
    animation: none;
  }

  // Without the dusk animation the night fill must land directly
  .game-map path[data-id].sunset-dark {
    animation: none;
    fill: var(--night-land) !important;
  }
}
</style>
<style lang="scss" scoped>
// Scenic overlay per the challenge-shell contract: the terminator stays
// pointer-inert; the console stands in a .shell-footer at the column's foot
// and inherits the shared berth + bottom clearance.
.final-sunset-blitz {
  inset: 0;
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: flex-end;
}

// The visible front: a slim glowing band riding the same transform as the
// sea plane, floating above land so the line always reads
.terminator {
  top: -75vh;
  left: 0;
  width: 0;
  height: 250vh;
  position: absolute;
  transform: var(--sunset-veil, translateX(200vw));
  transform-origin: left center;
  transition:
    transform 0.12s linear,
    opacity 1.4s var(--ease-smooth);
  will-change: transform;

  &.settled {
    opacity: 0;
  }

  // One plane, three acts, all in fixed vw so the shape survives any width:
  // a short golden lead, the afterglow tail blanketing land the line just
  // crossed, then the NIGHT itself — a deep plane rolling in behind and
  // covering everything to the east
  .band {
    left: -4vw;
    width: 340vw;
    height: 100%;
    display: block;
    position: absolute;
    background: linear-gradient(
      90deg,
      hsla(35, 95%, 62%, 0) 0,
      hsla(42, 98%, 70%, 0.6) 4vw,
      hsla(30, 92%, 58%, 0.4) 7vw,
      hsla(12, 75%, 48%, 0.35) 12vw,
      hsla(340, 55%, 35%, 0.4) 20vw,
      hsla(216, 50%, 7%, 0.68) 34vw,
      hsla(216, 50%, 7%, 0.85) 64vw
    );
  }
}
</style>
