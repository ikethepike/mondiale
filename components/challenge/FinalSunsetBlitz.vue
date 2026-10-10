<template>
  <div class="final-sunset-blitz">
    <!-- The night is compositor planes (SunsetVeil): dusk past the window, then
         sea, darkened land and the terminator's glow moving together; the base
         map is never written to mid-round. Lit countries paint on top. -->
    <SunsetVeil
      :field="field"
      :frame="challenge.frame"
      :sweep="sweep"
      :lit="litList"
      :next="nextUp"
      :settled="finished"
    />
    <div class="lost-names" aria-hidden="true">
      <span
        v-for="loss in losses"
        :key="loss.isoCode"
        class="lost-name"
        :style="{ left: `${loss.left}%`, top: `${loss.top}%` }"
        @animationend="forget(loss.isoCode)"
        >{{ loss.name }}</span
      >
    </div>
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
          :disabled="paused || !sweep || finished"
          :excluded="excluded"
          @guess="onGuess"
        />
        <template #actions>
          <button type="button" class="let-fall" :disabled="!sweep || finished" @click="finish">
            Let night fall
          </button>
        </template>
      </NightConsole>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import NightConsole, { type LanternState } from '~/components/challenge/NightConsole.vue'
import SunsetVeil from '~/components/challenge/SunsetVeil.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { MICRO_COUNTRIES } from '~~/data/map.gen'
import { NIGHT_CHROME, setChromeTint } from '~~/lib/chrome-tint'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { labelAnchorFor } from '~~/lib/label-anchor'
import { sweepBounds } from '~~/lib/sunset-veil'
import {
  sunsetDarkCount,
  sunsetDuskCoordinate,
  sunsetOutcome,
  sunsetQuota,
  sunsetSchedule,
  sunsetSweep,
} from '~~/lib/sunset-window'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { currentViewBox, useMapViewBox } from '~~/lib/use-map-viewbox'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/**
 * The gauntlet finale. The camera frames the dealt window and the rest of the
 * world falls to dusk; then night takes the window east→west, one country per
 * turn of the schedule, and a correctly typed country "holds the light". The
 * run ends the moment it is decided — quota lit, or out of reach.
 *
 * Client-trust grading, like the higher-lower gates.
 */
const props = defineProps<{ challenge: SunsetBlitzChallenge; paused: boolean }>()

const emit = defineEmits<{
  finished: [named: ISOCountryCode[]]
}>()

const { gameStore, game } = useClientEvents()

const field = computed(() => props.challenge.countries)
const fieldSet = computed(() => new Set(field.value))
const schedule = computed(() =>
  sunsetSchedule(field.value.length, game.value?.difficulty ?? 'normal')
)
const durationSeconds = computed(() => Math.ceil(schedule.value.at(-1) ?? 0))
const quota = computed(() => sunsetQuota(props.challenge))

const TICK_MS = 100
// The frame is the subject: the default pad floor would push the field into
// the middle third of the screen
const WINDOW_FRAME_PAD = { scale: 0.06, floor: 12 }
const LOST_NAMES_SHOWN = 3

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()
const named = ref(new Set<ISOCountryCode>())
const litList = computed(() => [...named.value])
const finished = ref(false)
const feedback = ref('')
const { toScreenPercent } = useMapViewBox()

// The dealt window stays visible above the console (and the keyboard); the
// sweep bounds lock against the berthed camera, so line and window agree
const consoleFooter = ref<HTMLElement>()
useFooterBerth(consoleFooter)

const secondsLeft = ref(durationSeconds.value)
// Undefined until the camera settles — the night stays parked off-screen and
// the clock holds through the camera's flight
const sweep = shallowRef<{
  duskAt: (elapsedSeconds: number) => number
  startTime: number
  duration: number
}>()

// The field is sorted east→west and the schedule is too, so this one integer
// is the whole dark set
const darkCount = ref(0)
const isDark = (isoCode: ISOCountryCode) => field.value.indexOf(isoCode) < darkCount.value
const standing = computed(() =>
  field.value.slice(darkCount.value).filter(isoCode => !named.value.has(isoCode))
)
const nextUp = computed(() => (sweep.value && !finished.value ? standing.value.slice(0, 2) : []))

const excluded = computed(() => [
  ...named.value,
  ...field.value.slice(0, darkCount.value).filter(isoCode => !named.value.has(isoCode)),
])

const beads = computed<LanternState[]>(() =>
  field.value.map((isoCode, index) =>
    named.value.has(isoCode)
      ? 'lit'
      : index < darkCount.value
        ? 'dark'
        : nextUp.value.includes(isoCode)
          ? 'next'
          : 'pending'
  )
)

const losses = ref<{ isoCode: ISOCountryCode; name: string; left: number; top: number }[]>([])
const lose = (isoCode: ISOCountryCode) => {
  const anchor = labelAnchorFor(isoCode)
  const screen = anchor && toScreenPercent(...anchor.point)
  if (!screen) return
  losses.value = [...losses.value, { isoCode, name: countryName(isoCode), ...screen }].slice(
    -LOST_NAMES_SHOWN
  )
}
const forget = (isoCode: ISOCountryCode) => {
  losses.value = losses.value.filter(loss => loss.isoCode !== isoCode)
}

// The bounds lock ONCE after the camera settles — a flight stalled by the HD
// tier's import once locked a world-wide frame, so the delay alone is not the
// signal: the camera must also hold still, and an unpolled camera is not still.
const SETTLE_DELAY_MS = 1500
let lastSeenBox: string | undefined

const lockSweep = (elapsedMs: number) => {
  const vb = currentViewBox()
  const seen = vb?.w ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : undefined
  const still = seen !== undefined && seen === lastSeenBox
  lastSeenBox = seen
  if (elapsedMs < SETTLE_DELAY_MS || !still || !vb) return
  const start = Math.max(sweepBounds(vb).start, sunsetDuskCoordinate(field.value[0]!))
  sweep.value = {
    duskAt: sunsetSweep(field.value, schedule.value, start),
    startTime: performance.now(),
    duration: schedule.value.at(-1) ?? 0,
  }
  void nextTick(() => guessInput.value?.focus({ auto: true }))
}

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
  emit('finished', [...named.value])
}

const settleIfDecided = () => {
  if (sunsetOutcome(named.value.size, standing.value.length, quota.value)) finish()
}

const tick = () => {
  if (!sweep.value) return lockSweep(performance.now() - startedAt)
  const elapsed = (performance.now() - sweep.value.startTime) / 1000
  const dark = sunsetDarkCount(schedule.value, elapsed)
  if (dark !== darkCount.value) {
    for (const isoCode of field.value.slice(darkCount.value, dark)) {
      if (!named.value.has(isoCode)) lose(isoCode)
    }
    darkCount.value = dark
  }
  const left = Math.max(0, Math.ceil(sweep.value.duration - elapsed))
  if (left !== secondsLeft.value) secondsLeft.value = left
  settleIfDecided()
}

const start = () => {
  if (ticker || finished.value) return
  gameStore.map.frame = props.challenge.frame
  gameStore.map.framePad = WINDOW_FRAME_PAD
  gameStore.map.spotlight = [...field.value]
  document.body.classList.add('sunset-blitz')
  startedAt = performance.now()
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
    return flash(`${countryName(country)} isn't in the last light.`)
  }
  if (named.value.has(isoCode)) return
  if (isDark(isoCode)) {
    return flash(`${countryName(country)} is already gone.`)
  }
  named.value.add(isoCode)
  // A micro-nation's outline is sub-pixel at window framing, so the map's own
  // halo disc is the only "this one is lit" it can show
  if (isoCode in MICRO_COUNTRIES) gameStore.map.highlighted.add(isoCode)
  settleIfDecided()
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
// The sweep holds still: no panning or zooming while the terminator runs —
// the dusk line, the darkened land and the framed window must stay in
// agreement
body.sunset-blitz .game-map {
  pointer-events: none;
}

// The run is over: page settles on City Nocturne's night. The base map's own
// fill transitions are cut so the post-round highlight lands in one paint
// under the settled veil instead of animating beneath it.
body.sunset-settled {
  background: var(--night-page);
  transition: background 1.4s var(--ease-smooth);

  // The night outranks the reveal's correct/incorrect wash: the veil covers
  // the land, but its feather and the sea gradient are still translucent at
  // the west edge while the settle push runs.
  .game-map path[data-id] {
    fill: var(--night-land) !important;
    stroke: var(--night-stroke) !important;
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

// The night moves under the console every frame — a backdrop blur would
// re-run with it, so the glass goes near-opaque instead
.shell-footer :deep(.night-console) {
  backdrop-filter: none;
  background: hsla(216, 45%, 12%, 0.94);
}

.lost-names {
  inset: 0;
  position: absolute;
}

.lost-name {
  position: absolute;
  padding: 0.2rem 0.9rem;
  font-size: 1.4rem;
  font-weight: bold;
  white-space: nowrap;
  border-radius: 2rem;
  letter-spacing: 0.04em;
  color: hsla(216, 30%, 82%, 1);
  border: 0.1rem solid var(--night-cold);
  background: hsla(216, 50%, 7%, 0.85);
  animation: lost-name 2.6s var(--ease-smooth) both;
}

@keyframes lost-name {
  from {
    opacity: 0;
    transform: translate(-50%, -30%);
  }

  20%,
  70% {
    opacity: 1;
    transform: translate(-50%, -50%);
  }

  to {
    opacity: 0;
    transform: translate(-50%, -70%);
  }
}

.let-fall {
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.8rem;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsla(216, 30%, 70%, 0.85);
  background: none;
  font-family: inherit;

  &:hover:not(:disabled) {
    color: var(--night-amber);
  }

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }
}
</style>
