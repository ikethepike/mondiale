<template>
  <div class="final-sunset-blitz">
    <!-- The night is one compositor plane (SunsetVeil): sea, darkened land and
         the terminator's glow move together, and the base map is never
         written to mid-round. Lit countries paint on the veil's top layer. -->
    <SunsetVeil :dusk="dusk" :lit="litList" :settled="finished" :roll="roll" />
    <footer ref="consoleFooter" class="shell-footer">
      <NightConsole
        v-show="!finished"
        :lit="named.size"
        :quota="quota"
        :seconds-left="secondsLeft"
        :duration-seconds="durationSeconds"
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
import SunsetVeil, { type SunsetRoll } from '~/components/challenge/SunsetVeil.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { NIGHT_CHROME, setChromeTint } from '~~/lib/chrome-tint'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { playableCountries } from '~~/lib/game-rules'
import { darkPrefixCount, sweepBounds } from '~~/lib/sunset-veil'
import {
  mapRegionCentre,
  sunsetDuskCoordinate,
  sunsetQuota,
  sunsetSeconds,
} from '~~/lib/sunset-window'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { currentViewBox, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/**
 * The gauntlet finale. The camera frames the dealt window; once it settles,
 * everything whose centre is on screen is the field (the window is the
 * floor) and stands lit against a receded world. Night sweeps it east→west
 * along a tilted terminator, and a correctly typed country "holds the light"
 * while unnamed ones go dark as the line passes them — once dark, they're
 * gone. Quota and clock are the difficulty's share of that field.
 *
 * The sweep runs in map-space dusk coordinates and is projected onto the
 * screen through the live map viewBox, so the drawn line and the grading can
 * never disagree. Client-trust grading, like the higher-lower gates.
 */
const props = defineProps<{ challenge: SunsetBlitzChallenge; paused: boolean }>()

const emit = defineEmits<{
  finished: [named: ISOCountryCode[], inPlay: ISOCountryCode[]]
}>()

const { gameStore, game } = useClientEvents()

// Prototype switch for the two dusk rolls — `?roll=timed` in the harness
const roll: SunsetRoll = useRoute().query.roll === 'timed' ? 'timed' : 'spatial'

const rules = computed(
  () => game.value ?? { variant: 'world' as const, difficulty: 'normal' as const }
)
// The night takes every country it crosses — the whole board darkens on
// screen — but only the field can be named or scored
const pool = computed(() => playableCountries(rules.value))
// The field, east→west: the dealt window until the camera settles, then
// everything the locked camera shows — a country you can see and can't name
// reads as a bug, and the quota scales with it so a wide screen is no gift
const field = ref<ISOCountryCode[]>([...props.challenge.countries])
const fieldSet = computed(() => new Set(field.value))

const TICK_MS = 100
// The frame is the subject: the default pad floor would push the field into
// the middle third of the screen
const WINDOW_FRAME_PAD = { scale: 0.06, floor: 12 }

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const named = ref(new Set<ISOCountryCode>())
const litList = computed(() => [...named.value])
const finished = ref(false)
const feedback = ref('')
// Subscribing keeps the camera poller live; the ticker reads currentViewBox()
// imperatively so the sweep locks against the true camera.
useMapViewBox()

// The dealt window stays visible above the console (and the keyboard); the
// sweep bounds lock against the berthed camera, so line and window agree
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

// The dealt clock is the floor; the locked field re-sizes it through the
// same curve the dealer used
const durationSeconds = computed(() =>
  Math.max(
    props.challenge.durationSeconds,
    sunsetSeconds(field.value.length, rules.value.difficulty)
  )
)
const durationMs = computed(() => durationSeconds.value * 1000)
const secondsLeft = ref(durationSeconds.value)

// The sweep in dusk-coordinate space: seeded from the window, then widened
// to the locked camera's true edges so the night ENTERS from off-screen east
// and has fully crossed the screen when time runs out
const duskCoordinates = props.challenge.countries.map(sunsetDuskCoordinate)
const duskMax = Math.max(...duskCoordinates)
const duskMin = Math.min(...duskCoordinates)
const duskMargin = Math.max(6, (duskMax - duskMin) * 0.1)
let sweepStart = duskMax + duskMargin * 2
let sweepEnd = duskMin - duskMargin

// The terminator's position, written once per tick; undefined until the
// bounds lock keeps the night parked off-screen through the camera's flight
const dusk = ref<number>()
// How many of the field the night has taken — the field is sorted east→west,
// so this one integer is the whole dark set, and it only moves as a country
// crosses. Everything graded or rendered off "who is dark" reads it.
const darkCount = ref(0)
const isDark = (isoCode: ISOCountryCode) => {
  const index = field.value.indexOf(isoCode)
  return index >= 0 && index < darkCount.value
}

// Pure linear motion: one constant speed from just off the east edge to just
// past the west edge. The bounds lock ONCE after the camera settles —
// adjusting them mid-flight remaps the clock and the line lurches.
const SETTLE_DELAY_MS = 1500
let boundsLocked = false
let sweepClockStart = 0

const lockSweepBounds = (elapsedMs: number) => {
  if (boundsLocked || elapsedMs < SETTLE_DELAY_MS) return
  const vb = currentViewBox()
  if (vb?.w) {
    const bounds = sweepBounds(vb)
    sweepStart = Math.max(sweepStart, bounds.start)
    sweepEnd = Math.min(sweepEnd, bounds.end)
    field.value = [
      ...new Set([...props.challenge.countries, ...pool.value.filter(isVisible)]),
    ].sort((a, b) => sunsetDuskCoordinate(b) - sunsetDuskCoordinate(a))
    gameStore.map.spotlight = [...field.value]
  }
  boundsLocked = true
  sweepClockStart = performance.now()
}

/** On screen right now — centre inside the live camera viewBox. */
const isVisible = (isoCode: ISOCountryCode) => {
  const vb = currentViewBox()
  if (!vb) return false
  const { x, y } = mapRegionCentre(isoCode)
  return x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h
}

// Countries outside the field stay suggestible: a list that only ever offers
// the window's names would hand the field over
const excluded = computed(() => [
  ...named.value,
  ...field.value.slice(0, darkCount.value).filter(isoCode => !named.value.has(isoCode)),
])

const quota = computed(() => sunsetQuota(field.value, props.challenge.quotaRatio))

// One lantern per country in the order the night takes them
const beads = computed<LanternState[]>(() =>
  field.value.map((isoCode, index) =>
    named.value.has(isoCode) ? 'lit' : index < darkCount.value ? 'dark' : 'pending'
  )
)

let ticker: ReturnType<typeof setInterval> | undefined
let startedAt = 0

const finish = () => {
  if (finished.value) return
  finished.value = true
  if (ticker) clearInterval(ticker)
  // The standard highlight is the post-round "stayed lit" state on the base
  // map — stamped once, under the settled night, never per guess
  for (const isoCode of named.value) gameStore.map.highlighted.add(isoCode)
  document.body.classList.add('sunset-settled')
  // Only now: mid-sweep the body abutting the browser chrome is still day —
  // the rolling night is the veil's plane, never the bar
  setChromeTint(NIGHT_CHROME)
  emit('finished', [...named.value], [...field.value])
}

const tick = () => {
  const now = performance.now()
  lockSweepBounds(now - startedAt)
  if (!boundsLocked) return
  const sweepElapsed = now - sweepClockStart
  const fraction = Math.min(1, sweepElapsed / durationMs.value)
  dusk.value = sweepStart - fraction * (sweepStart - sweepEnd)
  const dark = darkPrefixCount(field.value, dusk.value)
  if (dark !== darkCount.value) darkCount.value = dark
  const left = Math.max(0, Math.ceil((durationMs.value - sweepElapsed) / 1000))
  if (left !== secondsLeft.value) secondsLeft.value = left
  if (sweepElapsed >= durationMs.value) finish()
}

const start = () => {
  if (ticker || finished.value) return
  gameStore.map.frame = props.challenge.frame
  gameStore.map.framePad = WINDOW_FRAME_PAD
  gameStore.map.spotlight = [...props.challenge.countries]
  document.body.classList.add('sunset-blitz')
  startedAt = performance.now()
  guessInput.value?.focus({ auto: true })
  ticker = setInterval(tick, TICK_MS)
}

let feedbackTimeout: ReturnType<typeof setTimeout> | undefined
const flash = (message: string) => {
  feedback.value = message
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  feedbackTimeout = setTimeout(() => (feedback.value = ''), 1800)
}

const onGuess = (country: Country) => {
  const { isoCode } = country
  if (!fieldSet.value.has(isoCode)) {
    return flash(`${countryName(country)} isn't under tonight's sky.`)
  }
  if (named.value.has(isoCode)) return
  if (isDark(isoCode)) {
    return flash(`${countryName(country)} is already gone.`)
  }
  named.value.add(isoCode)
  if (field.value.every(code => named.value.has(code))) finish()
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
  document.body.classList.remove('sunset-blitz')
  document.body.classList.remove('sunset-settled')
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
  .game-map path[data-id].dimmed-country {
    fill-opacity: 0.35;
    transition: fill-opacity 1.2s var(--ease-smooth);
  }
}

// The run is over: page settles on City Nocturne's night. The base map's own
// fill transitions are cut so the post-round highlight lands in one paint
// under the settled veil instead of animating beneath it.
body.sunset-settled {
  background: var(--night-page);
  transition: background 1.4s var(--ease-smooth);

  .game-map path[data-id] {
    transition: none;
  }
}
</style>
<style lang="scss" scoped>
// Scenic overlay per the challenge-shell contract: the veil stays
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
</style>
