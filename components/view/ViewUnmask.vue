<template>
  <section v-if="challenge" class="unmask challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="unmask"
      title="Who is behind the file?"
      :stakes="`A leader's file opens a rung every ${challenge.secondsPerRung} seconds — a face that sharpens, then the facts, then the name. You get ONE accusation — name them or their country, and your first pick is final. The earlier it lands, the more it pays.`"
      @done="begin"
    />

    <ChallengePrompt
      ref="prompt"
      compact
      :hint="hint"
      :hint-tone="hintTone"
      :attributions="sources"
    >
      <template v-if="!verdictShown">
        <h1 class="map-caption">Who is behind the file?</h1>
        <span v-if="!isPhone || accusedAt !== undefined" class="map-caption sub">
          {{ promptLine }}
        </span>
      </template>
      <ChallengeResult
        v-else
        :status="caught ? 'correct' : 'incorrect'"
        :correct-message="`Unmasked — ${leaderName}`"
        :incorrect-message="missLine"
      >
        <LeaderReveal v-if="answer" :country="answer" />
      </ChallengeResult>
      <UnmaskFile
        v-if="isPhone && !verdictShown"
        compact
        :rungs="challenge.rungs"
        :clues="displayClues"
        :bounty="bounty"
        :suspects="field.length"
      />
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <UnmaskFile
      v-if="!isPhone"
      class="side-stage"
      :rungs="challenge.rungs"
      :clues="displayClues"
      :bounty="bounty"
      :suspects="field.length"
      :revealed="!!answer"
      :photo="answerLeader?.image"
      :photo-label="answerLeader?.name"
    />

    <footer v-if="!submitted && !gameStore.watching" ref="footer">
      <div class="guess-box">
        <ul v-if="suspectRail.length" class="country-chip-list rail suspects">
          <li v-for="isoCode in suspectRail" :key="isoCode">
            <CountryChip
              tag="button"
              type="button"
              compact
              :country="getCountry(isoCode)"
              @click="pick(isoCode)"
            />
          </li>
        </ul>
        <ChallengeConsole class="console" :value="secondsLeft" :total="totalSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="!started"
            :excluded="ruledOut"
            :people="suspects"
            placeholder="Leader or country"
            @guess="country => pick(country.isoCode)"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
    </footer>

    <MembershipSheet
      v-if="!isPhone && started && !gameStore.watching"
      :countries="field"
      subject="the file"
      noun="suspects"
      :settled="submitted"
      @pick="pick"
    />
  </section>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import MembershipSheet from '~/components/challenge/MembershipSheet.vue'
import UnmaskFile from '~/components/challenge/UnmaskFile.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import { BORDERS } from '~~/data/borders.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { quizLeader } from '~~/lib/leaders'
import { UNMASK_SUSPECT_FILL, unmaskFacts } from '~~/lib/unmask'
import { classicPlaySeconds } from '~~/lib/round-beats'
import { buzzScore } from '~~/lib/scoring'
import { seatVerdictOn } from '~~/lib/seat-view'
import { UNMASK_NAMED_FIELD, unmaskRemainingFraction, unmaskRungsShown } from '~~/lib/unmask-pace'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { usePromptBerth } from '~~/lib/use-prompt-berth'
import { useServerWindow } from '~~/lib/use-server-window'
import { useUnmaskDossier } from '~~/lib/use-unmask-dossier'
import { useIsPhone } from '~~/lib/use-viewport'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { isMapClickEvent } from '~~/types/events.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

const {
  challenge,
  showInterstitial,
  started,
  submitted,
  begin: beginRound,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  currentRound,
  gameStore,
  outcomeShown,
  registerCleanup,
} = useGroupChallenge('unmask-challenge', { solo: false })
const { seatCursor } = useClientEvents()

const sources = datasetAttribution('leaders')
const isPhone = useIsPhone()
const footer = ref<HTMLElement>()
useFooterBerth(footer)
const prompt = ref<InstanceType<typeof ChallengePrompt>>()
usePromptBerth(computed(() => prompt.value?.$el as HTMLElement | undefined))
const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const roundIndex = computed(() => (gameStore.game ? gameStore.game.rounds.length - 1 : undefined))
const totalSeconds = computed(() => classicPlaySeconds(challenge.value) ?? 0)
const playWindow = useServerWindow(() => currentRound.value?.round.playStartsAt, totalSeconds)
const { secondsLeft } = playWindow

const due = computed(() =>
  challenge.value && playWindow.running.value
    ? unmaskRungsShown(challenge.value, playWindow.elapsedMs.value)
    : 0
)
const dossier = useUnmaskDossier(roundIndex, due, () => outcomeShown.value)
const answer = computed(() => dossier.value?.reveal?.country)
const answerLeader = computed(() => (answer.value ? quizLeader(answer.value) : undefined))
const leaderName = computed(() => answerLeader.value?.name ?? '')

/** The rungs open when the accusation landed — the file stops there until
 *  the reveal opens the rest. */
const accusedAt = ref<number>()
const displayClues = computed(() => {
  const clues = dossier.value?.clues ?? []
  if (dossier.value?.reveal || accusedAt.value === undefined) return clues
  return clues.slice(0, accusedAt.value)
})

const field = computed(() => dossier.value?.field ?? challenge.value?.suspects ?? [])
const suspects = computed(() =>
  Object.fromEntries(field.value.map(isoCode => [isoCode, unmaskFacts(isoCode)?.leader.name]))
)
const ruledOut = computed(() => {
  const lit = new Set(field.value)
  return ISOCountryCodes.filter(isoCode => !lit.has(isoCode))
})

const bounty = computed(() => {
  const active = challenge.value
  if (!active) return 0
  const shown = Math.max(1, displayClues.value.length)
  return buzzScore(active.maximumPoints, unmaskRemainingFraction(active, shown))
})

const promptLine = computed(() =>
  accusedAt.value !== undefined
    ? 'Accusation filed — the file is being checked'
    : 'Your first pick is your accusation. The less of the file you need, the more it pays.'
)

const suspect = ref<ISOCountryCode>()
const suspectRail = computed(() =>
  isPhone.value && !suspect.value && field.value.length <= UNMASK_NAMED_FIELD
    ? [...field.value].sort((a, b) => countryName(a).localeCompare(countryName(b)))
    : []
)
const pick = (isoCode: ISOCountryCode) => {
  const active = challenge.value
  if (!active || !started.value || submitted.value || gameStore.watching) return
  if (!active.suspects.includes(isoCode)) {
    announce({ hint: `No file on ${countryName(isoCode)}'s leader` })
    return
  }
  if (!field.value.includes(isoCode)) {
    announce({ hint: `The file already rules ${countryName(isoCode)} out` })
    return
  }
  suspect.value = isoCode
  gameStore.map.highlighted = new Set([isoCode])
  accusedAt.value = displayClues.value.length
  playWindow.stop()
  announce({ kind: 'probe' })
  submitOnce([isoCode])
}

const begin = () => {
  beginRound()
  nextTick(() => guessInput.value?.focus({ auto: true }))
}

watch(
  () => playWindow.expired.value && started.value && !gameStore.watching,
  ran => {
    if (!ran || submitted.value) return
    accusedAt.value = displayClues.value.length
    submitOnce([])
  }
)

watch(
  field,
  (next, previous) => {
    if (answer.value) return
    gameStore.map.spotlight = [...next]
    gameStore.map.focus = [...next]
    gameStore.map.countryGroupings = [{ color: UNMASK_SUSPECT_FILL, countries: [...next] }]
    gameStore.map.countryLabels =
      next.length <= UNMASK_NAMED_FIELD
        ? Object.fromEntries(next.map(isoCode => [isoCode, countryName(isoCode)]))
        : undefined
    const dropped = (previous?.length ?? next.length) - next.length
    if (dropped > 0 && !submitted.value) {
      announce({ hint: `The file rules out ${dropped} — ${next.length} suspects left` })
    }
  },
  { immediate: true }
)

const scored = computed(() => {
  if (gameStore.watching) {
    return currentRound.value?.round.playerTurns[gameStore.seatId]?.points.scored ?? 0
  }
  return seatVerdictOn(seatCursor.value, 'round')?.scored ?? 0
})
const caught = computed(() => scored.value > 0)
const verdictShown = computed(() => outcomeShown.value && !!answer.value)
const accused = computed(
  () =>
    !!suspect.value ||
    currentRound.value?.round.groupAnswers[gameStore.seatId]?.unmaskRung !== undefined
)
const missLine = computed(() => {
  const country = answer.value ? countryName(answer.value) : ''
  return accused.value
    ? `It was ${leaderName.value} of ${country}`
    : `Out of time — it was ${leaderName.value} of ${country}`
})

watch([answer, caught], ([country]) => {
  if (!country || !outcomeShown.value) return
  gameStore.map.spotlight = []
  gameStore.map.countryGroupings = undefined
  gameStore.map.countryLabels = undefined
  gameStore.map.highlighted = new Set([country])
  gameStore.map.focus = [country]
  gameStore.map.focusContext = BORDERS[country] ?? []
  if (suspect.value && suspect.value !== country) gameStore.map.tints[suspect.value] = 'stray'
  gameStore.map.tints[country] = caught.value ? 'optimal' : 'inefficient'
})

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event) || showInterstitial.value) return
  const isoCode = event.detail.isoCode
  if (isValidISOCode(isoCode)) pick(isoCode)
}
onBeforeMount(() => document.addEventListener('mapClick', onMapClick))
registerCleanup(() => document.removeEventListener('mapClick', onMapClick))
</script>
<style lang="scss" scoped>
.guess-box :deep(.suggestions) {
  top: auto;
  bottom: 100%;
  margin: 0 0 0.6rem;
}
</style>
