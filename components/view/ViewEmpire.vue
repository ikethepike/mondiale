<template>
  <section v-if="challenge" class="empire">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Ghosts of Empires`"
      title="A vanished power sweeps the map"
      :stakes="stakes"
      @done="start"
    />
    <template v-else>
      <EmpireGhostField
        v-if="paths.length"
        ref="ghostField"
        :paths="paths"
        :years="challenge.keyframeYears"
        :peak-year="challenge.peakYear"
        :precisions="precisions"
        :revealed="beat === 'reveal'"
        :capitals="beat === 'reveal' ? empire?.capitals : undefined"
        @year="onYear"
        @progress="onProgress"
      />

      <header>
        <div class="prompt">
          <span ref="yearEl" class="map-caption year">&nbsp;</span>
          <h1 class="map-caption">{{ headline }}</h1>
          <Transition name="verdict">
            <div v-if="verdict" class="verdict-banner map-caption" :class="verdict.tone">
              <EmpireFlag
                v-if="challenge && flags[challenge.empireId]"
                class="verdict-flag"
                :svg="flags[challenge.empireId]"
              />
              <div class="verdict-copy">
                <small>{{ verdict.eyebrow }}</small>
                <strong>{{ verdict.name }}</strong>
                <span>greatest extent, {{ formatEventYear(challenge.peakYear) }}</span>
              </div>
            </div>
          </Transition>
          <span v-if="subline" class="map-caption sub">{{ subline }}</span>
          <Transition name="caption">
            <span v-if="hint" class="map-caption hint">{{ hint }}</span>
          </Transition>
        </div>
      </header>

      <section class="stage">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </section>

      <footer :class="{ 'has-input': beat === 'guess' && !challenge.options }">
        <!-- Beat 1: buzz with the empire's name — option cards outside hard
             (flag tiles only when every option has an honest one), free-typed
             inside the bar on hard. -->
        <template v-if="beat === 'guess'">
          <div
            v-if="challenge.options"
            class="options card-options"
            :class="{ 'with-flags': optionsAllFlagged }"
          >
            <button
              v-for="option in challenge.options"
              :key="option"
              class="option card-option"
              :class="{ 'is-spent': spent.includes(option) }"
              type="button"
              :disabled="lockedOut || spent.includes(option) || !started"
              @click="onOptionPick(option)"
            >
              <EmpireFlag
                v-if="optionsAllFlagged"
                class="option-flag"
                :svg="flags[option] ?? ''"
              />
              <span>{{ EMPIRES[option]?.name ?? option }}</span>
            </button>
          </div>
          <EmpireTimebar
            ref="timebar"
            :years="challenge.keyframeYears"
            :clock-value="secondsLeft"
            :clock-total="challenge.durationSeconds"
          >
            <template v-if="!challenge.options" #default>
              <form class="guess-form" @submit.prevent="onTypedGuess">
                <input
                  ref="nameInput"
                  v-model="typedName"
                  type="text"
                  placeholder="Name the power…"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  :disabled="lockedOut || !started"
                />
              </form>
            </template>
          </EmpireTimebar>
        </template>

        <!-- Beat 2: name the modern countries inside the frozen peak — the
             blitz-modes' skill, typed against the same bar. -->
        <template v-else-if="beat === 'tap'">
          <ul v-if="picks.length" class="picks">
            <li v-for="isoCode in picks" :key="isoCode" class="stop map-caption">
              <button type="button" @click="toggle(isoCode)">
                <CountryFlag class="stop-flag" :country="getCountry(isoCode)" mode="background" />
                <span>{{ countryName(isoCode) }}</span>
                <span class="remove">×</span>
              </button>
            </li>
          </ul>
          <EmpireTimebar
            ref="timebar"
            :years="challenge.keyframeYears"
            :clock-value="tapSecondsLeft"
            :clock-total="challenge.tapSeconds"
          >
            <CountryGuessInput
              ref="countryInput"
              :disabled="submitted"
              placeholder="Name a country it held…"
              @guess="onCountryGuess"
              @miss="announce({ hint: 'No country by that name' })"
            />
            <button type="button" class="lock" @click="lockIn">
              {{ picks.length ? 'Lock it in' : 'Nothing held' }}
            </button>
          </EmpireTimebar>
        </template>

        <!-- Reveal: the same bar turns scrubber — drag the extent through time. -->
        <template v-else>
          <EmpireTimebar
            ref="timebar"
            :years="challenge.keyframeYears"
            interactive
            @scrub="onScrub"
          />
          <EmpireRevealCard
            v-if="empire"
            :empire="empire"
            :found-count="foundCount"
            :flag-svg="flags[challenge.empireId]"
          />
        </template>
      </footer>
    </template>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import EmpireFlag from '~/components/challenge/EmpireFlag.vue'
import EmpireGhostField from '~/components/challenge/EmpireGhostField.vue'
import EmpireRevealCard from '~/components/challenge/EmpireRevealCard.vue'
import EmpireTimebar from '~/components/challenge/EmpireTimebar.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { EMPIRES } from '~~/data/empires.gen'
import { countryName, getCountry } from '~~/lib/country'
import {
  empireAnswerMatches,
  empireDisplayName,
  empirePots,
  normalizeEmpireAnswer,
} from '~~/lib/empires'
import { prefersReducedMotion } from '~~/lib/motion'
import { buzzScore } from '~~/lib/scoring'
import { formatEventYear } from '~~/lib/timeline'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { sentenceCase } from '~~/lib/strings'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  stopCountdown,
  hint,
  announce,
  entries,
  gameStore,
  update,
  registerCleanup,
} = useGroupChallenge('empire-challenge')

type Beat = 'guess' | 'tap' | 'reveal'
const beat = ref<Beat>('guess')

// Solo blanks the board (the harness default); landmass keeps the continents
// as one silhouette so the ghost reads against real coastlines, not a void.
gameStore.map.landmass = true

const ghostField = ref<InstanceType<typeof EmpireGhostField>>()
const timebar = ref<InstanceType<typeof EmpireTimebar>>()
const yearEl = ref<HTMLElement>()
const nameInput = ref<HTMLInputElement>()
const countryInput = ref<InstanceType<typeof CountryGuessInput>>()

const paths = ref<string[]>([])
const precisions = ref<number[]>()
const flags = ref<Record<string, string>>({})
const typedName = ref('')
const lockedOut = ref(false)
const spent = ref<string[]>([])
const picks = ref<ISOCountryCode[]>([])
const tapSecondsLeft = ref(0)
/** The beat-1 outcome banner: flag, name, year and the buzz's worth — a
 *  moment, not a toast; never the orange hint channel. */
const verdict = ref<{ tone: 'won' | 'missed'; eyebrow: string; name: string }>()

const empire = computed(() => (challenge.value ? EMPIRES[challenge.value.empireId] : undefined))
const pots = computed(() => empirePots(challenge.value?.maximumPoints ?? 0))

/** Flags are all-or-none per round: honest banners don't exist for many
 *  polities, and a lone flagged card among bare ones reads as a tell. */
const optionsAllFlagged = computed(() =>
  Boolean(challenge.value?.options?.every(option => flags.value[option]))
)

/** The empire timeline ticking along the footer bar — direct DOM downstream. */
const onProgress = (t: number) => timebar.value?.setT(t)

/** Beat-1 outcome, carried into the single end-of-round submit. */
let beat1Guess: string | undefined
let beat1Score = 0

let lockoutTimer: ReturnType<typeof setTimeout> | undefined
let beatTimer: ReturnType<typeof setTimeout> | undefined
let tapClock: ReturnType<typeof setInterval> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => {
  for (const timer of [lockoutTimer, beatTimer, revealTimer]) if (timer) clearTimeout(timer)
  if (tapClock) clearInterval(tapClock)
})

const stakes = computed(() =>
  challenge.value?.options
    ? 'Its extent rises and falls, year by year. Buzz early with its name for more — then trace the modern countries it held.'
    : 'Its extent rises and falls, year by year. Name it — early buzzes pay more — then trace the modern countries it held.'
)

const headline = computed(() => {
  if (beat.value === 'guess') return 'What power is this?'
  if (beat.value === 'tap') return 'Name every modern country inside it'
  const display = empireDisplayName(empire.value?.name ?? 'the empire')
  return `${sentenceCase(display)} — greatest extent, ${formatEventYear(challenge.value?.peakYear ?? 0)}`
})

const subline = computed(() => {
  if (beat.value === 'guess')
    return 'The shape sweeps from rise to dissolution — the story is the hint.'
  if (beat.value === 'tap') return 'Its heartlands only — edge territories are forgiven either way.'
  return ''
})

/** The year counter writes textContent directly — a 2,000-year sweep changes
 *  the label far too often for a reactive ref. */
const onYear = (year: number) => {
  if (yearEl.value) yearEl.value.textContent = formatEventYear(year)
}

const start = async () => {
  const active = challenge.value
  if (!active) return

  const meta = EMPIRES[active.empireId]
  // Frame the camera to the empire's own bounds while the board is blank —
  // the flashpoint empty-`d` feature trick; no GameMap changes needed.
  if (meta) gameStore.map.feature = { d: '', kind: 'area', bounds: meta.bounds }

  const [pathsModule, flagsModule] = await Promise.all([
    import('~~/data/empire-paths.gen'),
    import('~~/data/empire-flags.gen'),
  ])

  // The challenge ships subsampled years; map them back onto the full
  // keyframe list to pick the matching paths.
  const allYears = meta?.keyframeYears ?? []
  const indices = active.keyframeYears.map(year => allYears.indexOf(year)).filter(i => i >= 0)
  const allPaths = pathsModule.EMPIRE_PATHS[active.empireId] ?? []
  paths.value = indices.map(index => allPaths[index]).filter(Boolean)
  precisions.value = indices.map(
    index => pathsModule.EMPIRE_KEYFRAME_PRECISION[active.empireId]?.[index] ?? 2
  )
  flags.value = flagsModule.EMPIRE_FLAGS

  const reduced = prefersReducedMotion()
  const frames = active.keyframeYears.length
  // begin() first: the ghost field lives behind the interstitial's v-else, so
  // it only mounts once the round starts — building against the ref before
  // that would silently hit nothing and the blob would never draw.
  begin({
    onTimeout: () => resolveBeat1(undefined, 0),
    onTick: left => {
      // Reduced motion steps the keyframes discretely instead of morphing.
      if (reduced && beat.value === 'guess') {
        const elapsed = active.durationSeconds - left
        const step = Math.min(frames - 1, Math.floor((elapsed / active.durationSeconds) * frames))
        ghostField.value?.seek(step)
      }
    },
  })
  await nextTick()
  await ghostField.value?.build()
  ghostField.value?.play()
  nextTick(() => nameInput.value?.focus())
}

/** A wrong buzz costs three seconds, not points — the silhouette contract. */
const lockOut = (message: string) => {
  announce({ kind: 'locked', hint: message })
  lockedOut.value = true
  if (lockoutTimer) clearTimeout(lockoutTimer)
  lockoutTimer = setTimeout(() => {
    lockedOut.value = false
    nextTick(() => nameInput.value?.focus())
  }, 3000)
}

const buzz = (guessedId: string) => {
  const active = challenge.value
  if (!active || beat.value !== 'guess') return
  resolveBeat1(guessedId, buzzScore(pots.value.name, remainingFraction.value))
}

const onOptionPick = (option: string) => {
  const active = challenge.value
  if (!active || lockedOut.value || !started.value || beat.value !== 'guess') return
  if (option === active.empireId) return buzz(option)
  spent.value = [...spent.value, option]
  lockOut(`Not ${empireDisplayName(EMPIRES[option]?.name ?? option)} — locked out for 3 seconds`)
}

const onTypedGuess = () => {
  const active = challenge.value
  const typed = normalizeEmpireAnswer(typedName.value)
  if (!active || !typed || lockedOut.value || beat.value !== 'guess') return

  const matches = (id: string) => {
    const candidate = EMPIRES[id]
    return Boolean(candidate && empireAnswerMatches(typedName.value, candidate))
  }

  if (matches(active.empireId)) return buzz(active.empireId)

  const other = Object.keys(EMPIRES).find(matches)
  typedName.value = ''
  if (other) {
    lockOut(`Not ${empireDisplayName(EMPIRES[other].name)} — locked out for 3 seconds`)
  } else {
    announce({ hint: 'No power by that name in the register' })
  }
}

/**
 * Beat 1 resolves (buzz or timeout): the sweep glides to the frozen peak, a
 * short memorize hold, then the overlay lifts and the modern borders bloom
 * back for the tap beat. The camera never moves.
 */
const resolveBeat1 = (guessedId: string | undefined, clientScore: number) => {
  const active = challenge.value
  if (!active || beat.value !== 'guess') return
  stopCountdown()
  beat1Guess = guessedId
  beat1Score = clientScore
  verdict.value = {
    tone: guessedId ? 'won' : 'missed',
    eyebrow: guessedId ? `Well named · +${clientScore} on the buzz` : 'Time runs out — it was',
    name: EMPIRES[active.empireId]?.name ?? active.empireId,
  }

  ghostField.value?.freezeAtPeak()
  if (yearEl.value) yearEl.value.textContent = formatEventYear(active.peakYear)

  const hold = prefersReducedMotion() ? 400 : 1800
  beatTimer = setTimeout(() => {
    ghostField.value?.fadeOut()
    gameStore.map.solo = false
    gameStore.map.landmass = false
    beat.value = 'tap'
    tapSecondsLeft.value = active.tapSeconds
    tapClock = setInterval(() => {
      tapSecondsLeft.value--
      if (tapSecondsLeft.value <= 0) lockIn()
    }, 1000)
    nextTick(() => countryInput.value?.focus())
  }, hold)
}

const toggle = (isoCode: ISOCountryCode) => {
  picks.value = picks.value.includes(isoCode)
    ? picks.value.filter(code => code !== isoCode)
    : [...picks.value, isoCode]
  gameStore.map.highlighted = new Set(picks.value)
}

const onCountryGuess = (country: Country) => {
  if (beat.value !== 'tap' || submitted.value) return
  if (picks.value.includes(country.isoCode)) {
    announce({ hint: `${countryName(country)} is already on your list` })
    return
  }
  // Presence only: a named guess would hand the room the extent.
  announce({ kind: 'probe', isoCode: country.isoCode })
  toggle(country.isoCode)
}

const foundCount = computed(() => {
  const core = new Set(challenge.value?.members ?? [])
  return picks.value.filter(isoCode => core.has(isoCode)).length
})

/**
 * Beat 2 locks (or times out): verdict tints land, the extent returns over
 * modern borders in the reveal treatment, and the scrubber hands the timeline
 * to the player. The submit follows after the reveal hold.
 */
const REVEAL_HOLD_MS = 12000
const lockIn = () => {
  const active = challenge.value
  if (!active || beat.value !== 'tap' || submitted.value) return
  if (tapClock) clearInterval(tapClock)
  tapClock = undefined
  beat.value = 'reveal'
  verdict.value = undefined

  const core = new Set(active.members)
  const partial = new Set(active.partialMembers)
  for (const isoCode of picks.value) {
    if (partial.has(isoCode)) continue // forgiven, untinted — confessed on the card
    gameStore.map.tints[isoCode] = core.has(isoCode) ? 'optimal' : 'stray'
  }
  for (const isoCode of active.members) {
    if (!picks.value.includes(isoCode)) gameStore.map.tints[isoCode] = 'inefficient'
  }
  gameStore.map.highlighted = new Set()
  gameStore.map.labels = true

  // freezeAtPeak re-applies a frame, whose progress emit parks the bar's
  // fill and thumb on the peak — no separate seek needed.
  ghostField.value?.freezeAtPeak()
  ghostField.value?.fadeIn()

  revealTimer = setTimeout(submitRound, REVEAL_HOLD_MS)
}

const onScrub = (t: number) => ghostField.value?.seek(t)

/** One submit carries both beats: taps in `ranking`, the buzz in `empire`.
 *  Mirrors submitOnce, which can't carry the extra field. */
const submitRound = () => {
  if (submitted.value) return
  submitted.value = true
  update({
    event: 'submit-group-challenge-answers',
    ranking: picks.value,
    empire: { ...(beat1Guess ? { guessedId: beat1Guess } : {}), clientScore: beat1Score },
  })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.empire {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  display: flex;
  text-align: center;
  padding: 2rem 4rem;
  align-items: center;
  flex-flow: column nowrap;
  gap: 1rem;

  h1 {
    margin: 0;
  }

  .year {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-size: clamp(1.6rem, 5vw, 2.4rem);
    padding: 0.3rem 1.6rem;
    min-width: 9ch;
  }

  .sub,
  .hint {
    padding: 0.4rem 1.4rem;
    max-width: min(80vw, 44rem);
  }
  .hint {
    color: var(--hior-ange);
  }

  // The beat-1 verdict: the ghost's banner, name and worth land as one card.
  .verdict-banner {
    gap: 1.2rem;
    display: flex;
    align-items: center;
    text-align: left;
    padding: 0.8rem 1.6rem 0.8rem 1rem;
    border-left: 0.4rem solid hsl(150, 45%, 36%);

    &.missed {
      border-left-color: hsla(215.7, 76.4%, 21.6%, 0.45);
    }

    .verdict-flag {
      width: 6.4rem;
      height: 4.2rem;
      flex-shrink: 0;
      filter: drop-shadow(0 0.1rem 0.3rem hsla(215.7, 76.4%, 21.6%, 0.25));
    }

    .verdict-copy {
      display: flex;
      flex-flow: column nowrap;

      small {
        font-size: 1.05rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: hsl(150, 45%, 28%);
      }
      strong {
        font-size: 2rem;
        line-height: 1.2;
      }
      span {
        opacity: 0.7;
        font-size: 1.25rem;
        font-variant-numeric: tabular-nums;
      }
    }

    &.missed .verdict-copy small {
      color: hsla(215.7, 76.4%, 21.6%, 0.75);
    }
  }

  .prompt {
    gap: 1rem;
    display: flex;
    position: relative;
    align-items: center;
    flex-flow: column nowrap;
  }

}

header .prompt .hint {
  top: 100%;
  left: 0;
  right: 0;
  z-index: 3;
  width: max-content;
  max-width: 100%;
  position: absolute;
  margin: 0.4rem auto 0;
}

.stage {
  z-index: 2;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  > * {
    pointer-events: auto;
  }

  &.has-input {
    padding-bottom: clamp(6rem, 18vh, 14rem);
  }
}

// The house multiple-choice recipe (flashpoint/capital-guess card-options),
// text-only when the round's flags aren't all-or-none honest.
.card-options {
  gap: 1.4rem;
  display: grid;
  pointer-events: auto;
  width: min(44rem, calc(100vw - 3.2rem));
  grid-template-columns: 1fr;

  &.with-flags {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.card-option {
  cursor: pointer;
  padding: 1rem;
  gap: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-flow: column nowrap;
  font-size: 1.5rem;
  font-weight: 600;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-0.3rem);
      border-color: var(--dark-blue);
    }
  }
  &:active:not(:disabled) {
    border-color: var(--dark-blue);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &.is-spent {
    opacity: 0.35;
    border-color: var(--hior-ange);
    animation: spent-shake 0.4s var(--ease-smooth);
  }

  .option-flag {
    width: 100%;
    height: 4.2rem;
    filter: drop-shadow(0 0.1rem 0.3rem hsla(215.7, 76.4%, 21.6%, 0.25));
  }
}

@keyframes spent-shake {
  20% {
    transform: translateX(-0.5rem);
  }
  45% {
    transform: translateX(0.4rem);
  }
  70% {
    transform: translateX(-0.25rem);
  }
}

// The verdict lands with intent: rises and settles, expressive ease.
.verdict-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}
.verdict-leave-active {
  transition: opacity var(--motion-quick) var(--ease-in-soft);
}
.verdict-enter-from {
  opacity: 0;
  transform: translateY(1.2rem) scale(0.96);
}
.verdict-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .card-option.is-spent {
    animation: none;
  }
  .verdict-enter-active,
  .verdict-leave-active {
    transition: none;
  }
}

// Named countries, in the house flag-chip recipe (neighbour-blitz found-list).
.picks {
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  display: flex;
  list-style: none;
  flex-flow: row wrap;
  justify-content: center;
  max-width: min(52rem, 100%);

  .stop {
    padding: 0;

    button {
      gap: 0.6rem;
      border: none;
      display: flex;
      cursor: pointer;
      background: none;
      font: inherit;
      font-size: 1.2rem;
      font-weight: 600;
      align-items: center;
      color: var(--dark-blue);
      padding: 0.3rem 0.9rem;
    }
  }

  .stop-flag {
    width: 2.2rem;
    height: 1.5rem;
    border-radius: 0.2rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }

  .remove {
    opacity: 0.6;
  }
}

// The timebar's lock: a quiet chip-weight action docked in the console row,
// not a filled slab shouting over the input.
.lock {
  flex-shrink: 0;
  cursor: pointer;
  font: inherit;
  font-size: 1.3rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--dark-blue);
  padding: 0.5rem 1.2rem;
  border-radius: 999px;
  background: hsla(0, 0%, 100%, 0.55);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition: border-color var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover {
      border-color: var(--dark-blue);
    }
  }
}

@media (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }
  footer {
    width: 100%;
    padding: 1.2rem 1.6rem calc(1.2rem + var(--safe-bottom));

    &.has-input {
      padding-bottom: clamp(6rem, 18dvh, 14rem);
    }
  }
  .card-options.with-flags {
    grid-template-columns: repeat(3, minmax(0, 1fr));

    .card-option {
      font-size: 1.25rem;
      padding: 0.8rem 0.6rem;
    }
  }
}
</style>
