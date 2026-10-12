<template>
  <div v-if="challenge" class="two-truths challenge-shell">
    <CountryBackdrop v-if="!showInterstitial" :country="challenge.country" :receded="revealed" />
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="two-truths"
      :title="`${challenge.cards.length} claims about ${countryName(challenge.country)}`"
      stakes="Some are true, some are lies — how many of each is never said. Stamp what you know: right stamps pay, wrong ones cost, blanks are free."
      @done="start"
    />

    <ChallengePrompt :attributions="sources" attribution-label="Sources" :compact="!revealed">
      <template v-if="!revealed">
        <h1 class="map-caption subject-title">
          <CountryFlag
            class="title-flag"
            :country="getCountry(challenge.country)"
            mode="background"
          />
          {{ countryName(challenge.country) }}
        </h1>
        <span class="map-caption sub">True or lie? Stamp each claim — or leave it blank</span>
      </template>
      <ChallengeResult
        v-else-if="graded"
        :status="graded.net > 0 ? 'correct' : 'incorrect'"
        :correct-message="
          graded.perfect ? 'Perfect sheet' : `${graded.right} of ${graded.cards} right`
        "
        :incorrect-message="graded.stamped ? 'They fooled you' : 'Nothing stamped'"
      >
        {{ graded.lies }} of the {{ graded.cards }}
        {{ graded.lies === 1 ? 'was a lie' : 'were lies' }}.
        <template v-if="graded.wrong">
          {{ graded.wrong }} wrong {{ graded.wrong === 1 ? 'stamp' : 'stamps' }} cost you.
        </template>
      </ChallengeResult>
      <span v-else class="map-caption sub">Checking the sheet…</span>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <section
      ref="stage"
      class="claim-stage"
      :class="{ 'fade-top': scrollableUp, 'fade-bottom': scrollableDown }"
      @scroll.passive="syncScrollEdges"
    >
      <ol class="claim-list" :class="{ revealed }">
        <li
          v-for="(card, index) in challenge.cards"
          :key="card.id"
          :data-card="index"
          :style="{ '--i': index }"
        >
          <article class="claim-card" :class="cardClass(index)">
            <header class="claim-head">
              <StatTopicIcon class="family-icon" :topic="FAMILY_GLYPHS[card.family]" />
              <span class="eyebrow">{{ FAMILY_LABELS[card.family] }}</span>
              <span v-if="revealed && receipts?.[index]?.trap" class="trap-tag">
                {{ receipts[index]!.truth ? 'Sounds false' : 'Sounds right' }}
              </span>
            </header>
            <p class="claim-text">{{ card.text }}</p>

            <div v-if="!revealed" class="stamps" role="group" :aria-label="`Claim ${index + 1}`">
              <button
                v-for="stamp in STAMPS"
                :key="stamp"
                type="button"
                class="stamp-button"
                :class="[stamp, { pressed: sheet[index] === stamp }]"
                :aria-pressed="sheet[index] === stamp"
                :disabled="checkedIndex === index"
                @click="toggleStamp(index, stamp)"
              >
                {{ STAMP_LABELS[stamp] }}
              </button>
              <span v-if="checkedIndex === index" class="checked-note">Checked</span>
            </div>

            <Transition name="caption">
              <div v-if="revealed && receipts?.[index]" class="receipt">
                <div class="verdict-row">
                  <span class="verdict-ink" :class="stampFor(receipts[index]!.truth)">
                    {{ receipts[index]!.truth ? 'True' : 'Lie' }}
                  </span>
                  <span class="your-stamp">{{ stampLine(index) }}</span>
                </div>
                <p class="receipt-note">{{ receipts[index]!.note }}</p>
                <TwoTruthsEvidence
                  :evidence="receipts[index]!.evidence"
                  :highlight="card.countries"
                />
                <ul
                  v-if="tallies[index].length"
                  class="tally"
                  aria-label="How the table stamped it"
                >
                  <li class="eyebrow tally-label">Table</li>
                  <li
                    v-for="mark in tallies[index]"
                    :key="mark.id"
                    class="tally-mark"
                    :class="mark.stamp ?? 'blank'"
                    :style="{ '--player-color': mark.color }"
                    :title="`${mark.name}: ${mark.stamp ? STAMP_LABELS[mark.stamp] : 'blank'}`"
                  >
                    <span class="dot" />
                    <span class="mark-stamp">{{
                      mark.stamp ? STAMP_LABELS[mark.stamp] : '–'
                    }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </article>
        </li>
      </ol>
    </section>

    <footer v-if="!showInterstitial && !revealed && !gameStore.watching" class="clock-footer">
      <div class="hint-row">
        <Transition name="caption">
          <button v-if="revealUnlocked" class="hint-button" type="button" @click="buyReveal">
            <StatTopicIcon class="hint-icon" topic="reveal" />
            Check one card (−{{ hintBitePoints(challenge.maximumPoints) }} pts)
          </button>
        </Transition>
      </div>
      <div class="lock-row">
        <button class="lock-button" type="button" @click="lockSheet">
          Lock sheet
          <span class="lock-count">{{ stampedCount }}/{{ challenge.cards.length }}</span>
        </button>
        <ChallengeTimerRadial
          class="footer-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryBackdrop from '~/components/challenge/CountryBackdrop.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import TwoTruthsEvidence from '~/components/challenge/TwoTruthsEvidence.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import ChallengeResult from '~/components/feedback/ChallengeResult.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { isHardMode } from '~~/lib/game-rules'
import { seatLabel } from '~~/lib/player'
import { HINT_UNLOCK_FIRST_ELAPSED, hintBitePoints } from '~~/lib/scoring'
import { roundSettled } from '~~/lib/spectate'
import {
  CLAIM_DATASETS,
  isPerfectSheet,
  sheetCounts,
  sheetNet,
  stampFor,
  toSheet,
} from '~~/lib/two-truths'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useScrollEdges } from '~~/lib/use-scroll-edges'
import { useTwoTruthsReceipts } from '~~/lib/use-two-truths-receipts'
import type { ClaimFamily, TwoTruthsSheet, TwoTruthsStamp } from '~~/types/two-truths.types'

const STAMPS: TwoTruthsStamp[] = ['true', 'lie']
const STAMP_LABELS: Record<TwoTruthsStamp, string> = { true: 'True', lie: 'Lie' }

const FAMILY_LABELS: Record<ClaimFamily, string> = {
  borders: 'Borders',
  language: 'Language',
  capital: 'Capital',
  currency: 'Currency',
  club: 'Alliances',
  rank: 'Rankings',
  versus: 'Head to head',
  trade: 'Trade',
  clock: 'Time zone',
  river: 'Rivers',
}

const FAMILY_GLYPHS: Record<ClaimFamily, string> = {
  borders: 'relations.borders',
  language: 'department.communications',
  capital: 'relations.embassy',
  currency: 'department.finance',
  club: 'relations.alliance',
  rank: 'people',
  versus: 'geography',
  trade: 'relations.exports',
  clock: 'department.science',
  river: 'relations.maritime',
}

const {
  challenge,
  showInterstitial,
  begin,
  announce,
  entries,
  submitOnce,
  submitted,
  gameStore,
  secondsLeft,
  elapsedFraction,
  stopCountdown,
  buyHint,
  boothAnswer,
  registerCleanup,
} = useGroupChallenge('two-truths-challenge')
const { player: me, seatCursor } = useClientEvents()

const stage = ref<HTMLElement>()
const { scrollableUp, scrollableDown, syncScrollEdges } = useScrollEdges(() => stage.value)

const sheet = ref<TwoTruthsSheet>([])
watch(
  () => challenge.value?.cards.length,
  cards => {
    if (cards && sheet.value.length !== cards) sheet.value = toSheet(sheet.value, cards)
  },
  { immediate: true }
)

const roundIndex = computed(() => (gameStore.game ? gameStore.game.rounds.length - 1 : undefined))
const round = computed(() =>
  roundIndex.value === undefined ? undefined : gameStore.game?.rounds[roundIndex.value]
)
const viewerId = computed(() => (gameStore.watching ? gameStore.seatId : me.value?.id))
const banked = computed(() =>
  gameStore.watching
    ? boothAnswer.value
    : viewerId.value
      ? round.value?.groupAnswers[viewerId.value]
      : undefined
)
const revealed = computed(() => (gameStore.watching ? !!banked.value : submitted.value))
const settled = computed(() => roundSettled(Object.values(gameStore.game?.players ?? {})))

const hintBought = computed(() => (seatCursor.value?.hints ?? []).includes('reveal'))
const held = useTwoTruthsReceipts(
  roundIndex,
  () =>
    banked.value
      ? 'all'
      : hintBought.value && !revealed.value && !gameStore.watching
        ? 'reveal'
        : 'none',
  () => `${Object.keys(round.value?.groupAnswers ?? {}).length}:${settled.value}`
)
const receipts = computed(() => held.value?.receipts)

/** Every banked sheet this socket may see: the receipts carry them while the
 *  snapshot withholds them, the snapshot once the round has settled. */
const tableSheets = computed<Record<string, TwoTruthsSheet>>(() => ({
  ...Object.fromEntries(
    Object.entries(round.value?.groupAnswers ?? {}).flatMap(([id, answer]) =>
      answer.sheet ? [[id, answer.sheet]] : []
    )
  ),
  ...held.value?.sheets,
}))

/** The sheet on screen: the banked one once it is known (a remount mid-verdict
 *  has no local stamps), this seat's live stamps before that. */
const shownSheet = computed<TwoTruthsSheet>(() => {
  const cards = challenge.value?.cards.length ?? 0
  const bankedSheet = viewerId.value ? tableSheets.value[viewerId.value] : undefined
  if (bankedSheet) return toSheet(bankedSheet, cards)
  return gameStore.watching ? toSheet(undefined, cards) : sheet.value
})

/** The card a bought reveal checked, once its receipt is in. */
const checkedIndex = computed(() => {
  if (!hintBought.value || revealed.value) return undefined
  const landed = Object.values(receipts.value ?? {})
  return landed.length === 1 ? landed[0].index : undefined
})
watch(checkedIndex, index => {
  const receipt = index === undefined ? undefined : receipts.value?.[index]
  if (!receipt) return
  sheet.value = sheet.value.map((stamp, at) =>
    at === receipt.index ? stampFor(receipt.truth) : stamp
  )
})

const stampedCount = computed(() => sheet.value.filter(Boolean).length)

const toggleStamp = (index: number, stamp: TwoTruthsStamp) => {
  if (revealed.value || showInterstitial.value || index === checkedIndex.value) return
  sheet.value = sheet.value.map((current, at) =>
    at === index ? (current === stamp ? null : stamp) : current
  )
}

const lockSheet = () => {
  if (!challenge.value || revealed.value || showInterstitial.value) return
  stopCountdown()
  announce({ kind: 'presence' })
  submitOnce([], { sheet: [...sheet.value] })
}

const start = () =>
  begin({
    onTimeout: () => submitOnce([], { sheet: [...sheet.value] }),
  })

const revealUnlocked = computed(
  () =>
    !isHardMode(gameStore.game) &&
    !hintBought.value &&
    elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED
)
const buyReveal = () => {
  if (revealed.value || hintBought.value) return
  buyHint('reveal')
}

const verdicts = computed(() => {
  const cards = challenge.value?.cards.length ?? 0
  const landed = receipts.value
  if (!landed || Object.keys(landed).length < cards) return undefined
  return Array.from({ length: cards }, (_, index) => landed[index].truth)
})

const graded = computed(() => {
  const truths = verdicts.value
  if (!truths || !revealed.value) return undefined
  const stamps = shownSheet.value
  const { right, wrong, blank } = sheetCounts(stamps, truths)
  return {
    cards: truths.length,
    lies: truths.filter(truth => !truth).length,
    right,
    wrong,
    stamped: truths.length - blank,
    net: sheetNet(stamps, truths),
    perfect: isPerfectSheet(stamps, truths),
  }
})

const sources = computed(() =>
  dedupeAttributions(
    [
      ...new Set((challenge.value?.cards ?? []).flatMap(card => CLAIM_DATASETS[card.family])),
    ].flatMap(datasetAttribution)
  )
)

const stampLine = (index: number) => {
  const stamp = shownSheet.value[index]
  const receipt = receipts.value?.[index]
  const owner = gameStore.watching ? 'They' : 'You'
  if (!stamp) return `${owner} left it blank`
  return receipt && stamp === stampFor(receipt.truth)
    ? `${owner} called it`
    : `${owner} stamped ${STAMP_LABELS[stamp]}`
}

/** Every banked sheet's stamp on each card — the table's verdict beside the truth. */
const tallies = computed(() => {
  const players = gameStore.game?.players ?? {}
  return (challenge.value?.cards ?? []).map((_, index) =>
    Object.entries(tableSheets.value).flatMap(([id, banked]) =>
      players[id]
        ? [
            {
              id,
              stamp: banked[index] ?? null,
              color: players[id].color,
              name: seatLabel(players, id, me.value?.id),
            },
          ]
        : []
    )
  )
})

const cardClass = (index: number) => {
  const stamp = shownSheet.value[index]
  if (!revealed.value) return { stamped: !!stamp, checked: index === checkedIndex.value }
  const receipt = receipts.value?.[index]
  if (!receipt) return { pending: true }
  const right = stamp === stampFor(receipt.truth)
  return {
    'is-true': receipt.truth,
    'is-lie': !receipt.truth,
    'was-right': !!stamp && right,
    'was-wrong': !!stamp && !right,
  }
}

const onKey = (event: KeyboardEvent) => {
  if (revealed.value || showInterstitial.value || event.metaKey || event.ctrlKey) return
  const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-card]')
  if (!card) return
  const index = Number(card.dataset.card)
  const key = event.key.toLowerCase()
  if (key === 't') toggleStamp(index, 'true')
  else if (key === 'l') toggleStamp(index, 'lie')
  else return
  event.preventDefault()
}
window.addEventListener('keydown', onKey)
registerCleanup(() => window.removeEventListener('keydown', onKey))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/scroll-fade' as *;

.two-truths {
  isolation: isolate;
  --truth-ink: hsl(170.5, 34.7%, 34%);
  --truth-wash: hsla(170.5, 34.7%, 55.1%, 0.16);
  --lie-ink: var(--hior-ange);
  --lie-wash: #{flame(0.16)};
}

.subject-title {
  gap: 0.8rem;
  display: inline-flex;
  align-items: center;

  .title-flag {
    width: 3.4rem;
    height: 2.3rem;
    flex-shrink: 0;
    border-radius: 0.3rem;
    border: 0.1rem solid ink(0.25);
  }
}

.claim-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  align-items: center;
  pointer-events: auto;
  padding-block: 1.2rem;
  flex-flow: column nowrap;
  justify-content: safe center;
  overscroll-behavior: contain;
}

.claim-list {
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  pointer-events: auto;
  width: min(76rem, 94vw);
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  &.revealed {
    align-items: stretch;
    width: min(110rem, 94vw);
  }

  li {
    display: flex;
    opacity: 0;
    animation: row-land 0.35s var(--ease-smooth) forwards;
    animation-delay: calc(var(--i) * 90ms);
  }
}

.claim-card {
  gap: 1rem;
  width: 100%;
  display: flex;
  position: relative;
  padding: 1.4rem 1.6rem;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  background: milk(0.97);
  border: 0.15rem solid ink(0.18);
  box-shadow: 0 0.4rem 1.6rem ink(0.08);
  transition:
    border-color var(--motion-quick) var(--ease-out-expressive),
    background-color var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);

  &.stamped {
    border-color: ink(0.4);
  }
  &.is-true {
    border-color: var(--truth-ink);
    background: linear-gradient(var(--truth-wash), var(--truth-wash)), milk(0.97);
  }
  &.is-lie {
    border-color: var(--lie-ink);
    background: linear-gradient(var(--lie-wash), var(--lie-wash)), milk(0.97);
  }
  &.pending {
    opacity: 0.7;
  }
}

.claim-head {
  gap: 0.6rem;
  display: flex;
  align-items: center;

  .family-icon {
    opacity: 0.7;
  }
  .eyebrow {
    flex: 1;
  }
}

.trap-tag {
  font-size: 1.1rem;
  font-weight: bold;
  padding: 0.2rem 0.7rem;
  border-radius: 99rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: milk();
  background: var(--dark-blue);
}

.claim-text {
  margin: 0;
  font-size: 1.8rem;
  line-height: 1.35;
  text-wrap: pretty;
}

.stamps {
  gap: 0.8rem;
  display: flex;
  align-items: center;
}

.stamp-button {
  flex: 1;
  cursor: pointer;
  font: inherit;
  font-size: 1.4rem;
  font-weight: bold;
  padding: 0.7rem 1rem;
  border-radius: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: transparent;
  border: 0.2rem dashed currentColor;
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    background-color var(--motion-quick) var(--ease-out-expressive),
    color var(--motion-quick) var(--ease-out-expressive);

  &.true {
    color: var(--truth-ink);
  }
  &.lie {
    color: var(--lie-ink);
  }

  @media (hover: hover) {
    &:hover:not(:disabled) {
      transform: translateY(-0.15rem);
    }
  }

  &.pressed {
    color: milk();
    border-style: solid;
    animation: stamp-thump 0.22s var(--ease-out-expressive);

    &.true {
      background: var(--truth-ink);
      border-color: var(--truth-ink);
      transform: rotate(-2deg);
    }
    &.lie {
      background: var(--lie-ink);
      border-color: var(--lie-ink);
      transform: rotate(2deg);
    }
  }

  &:disabled {
    cursor: default;
  }
}

.checked-note {
  font-size: 1.2rem;
  font-weight: bold;
  white-space: nowrap;
}

.receipt {
  flex: 1;
  gap: 0.8rem;
  display: flex;
  flex-flow: column nowrap;

  .tally {
    margin-top: auto;
  }
}

.verdict-row {
  gap: 1rem;
  display: flex;
  align-items: center;
}

.verdict-ink {
  font-size: 1.5rem;
  font-weight: 800;
  padding: 0.2rem 1rem;
  border-radius: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 0.25rem solid currentColor;
  animation: stamp-thump 0.3s var(--ease-out-expressive) both;
  animation-delay: calc(var(--i) * 140ms);

  &.true {
    color: var(--truth-ink);
    transform: rotate(-3deg);
  }
  &.lie {
    color: var(--lie-ink);
    transform: rotate(3deg);
  }
}

.your-stamp {
  font-size: 1.3rem;
  opacity: 0.8;

  .was-wrong & {
    color: var(--lie-ink);
    font-weight: bold;
    opacity: 1;
  }
}

.receipt-note {
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.4;
}

.tally {
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0 0;
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  border-top: $hairline;
}

.tally-label {
  align-self: center;
  margin-right: 0.2rem;
}

.tally-mark {
  gap: 0.35rem;
  display: flex;
  font-size: 1.1rem;
  font-weight: bold;
  align-items: center;
  padding: 0.15rem 0.6rem 0.15rem 0.3rem;
  border-radius: 99rem;
  background: ink(0.06);

  .dot {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--player-color);
  }
  &.true .mark-stamp {
    color: var(--truth-ink);
  }
  &.lie .mark-stamp {
    color: var(--lie-ink);
  }
  &.blank {
    opacity: 0.6;
  }
}

.clock-footer {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.lock-row {
  gap: 1.4rem;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.lock-button {
  gap: 0.8rem;
  display: flex;
  cursor: pointer;
  font: inherit;
  font-size: 1.6rem;
  font-weight: bold;
  align-items: center;
  padding: 1rem 2rem;
  border-radius: 99rem;
  color: milk();
  background: var(--dark-blue);
  border: none;

  .lock-count {
    font-size: 1.3rem;
    opacity: 0.75;
  }
}

@keyframes stamp-thump {
  0% {
    opacity: 0;
    scale: 1.25;
  }
  100% {
    opacity: 1;
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .claim-list li,
  .stamp-button.pressed,
  .verdict-ink {
    animation: none;
    opacity: 1;
  }
}

@media screen and (max-width: $tablet) {
  .claim-stage {
    width: 100%;
    overflow-y: auto;
    justify-content: flex-start;
    pointer-events: auto;
    overscroll-behavior: contain;
    padding-inline: 1.6rem;
    @include scroll-mask;
    @include scroll-bleed(
      $top: 2.8rem,
      $pad-top: 0.4rem,
      $pad-bottom: calc(1.2rem + var(--safe-bottom))
    );
  }

  .claim-list,
  .claim-list.revealed {
    gap: 1rem;
    width: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  .claim-card {
    gap: 0.8rem;
    padding: 1.1rem 1.2rem;
  }

  .claim-text {
    font-size: 1.6rem;
  }
}

@media screen and (max-height: $short) {
  .claim-list {
    gap: 0.8rem;
  }

  .claim-card {
    gap: 0.5rem;
    padding: 0.8rem 1.1rem;
  }

  .claim-head .eyebrow,
  .claim-head .family-icon {
    display: none;
  }

  .claim-text {
    font-size: 1.5rem;
  }

  .stamp-button {
    padding: 0.45rem 0.8rem;
  }
}
</style>
