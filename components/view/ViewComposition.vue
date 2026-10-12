<template>
  <div v-if="challenge" class="composition challenge-shell passthrough">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      kind="composition"
      title="Who's in the crowd?"
      :stakes="stakes"
      @done="start"
    />

    <ChallengePrompt :hint="hint" :hint-tone="hintTone">
      <h1 class="map-caption">{{ countryName(challenge.country) }}'s residents born abroad</h1>
      <span class="map-caption sub">Put each country on the group born there</span>
      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </ChallengePrompt>

    <section class="stage" />

    <footer ref="footer">
      <div class="crowd-panel" :class="{ revealed }">
        <header class="panel-head">
          <span class="eyebrow">{{ formatCompact(challenge.total) }} born abroad</span>
          <span class="strikes" :aria-label="`${strikesLeft} of ${challenge.strikes} strikes left`">
            <span
              v-for="index in challenge.strikes"
              :key="index"
              class="strike"
              :class="{ spent: index > strikesLeft }"
            />
          </span>
        </header>

        <div class="crowd">
          <div
            v-for="tier in tiers"
            :key="tier.slots[0]"
            class="tier"
            :class="{ tied: tier.slots.length > 1 }"
          >
            <div class="tier-groups">
              <button
                v-for="slot in tier.slots"
                :key="slot"
                type="button"
                class="group"
                :class="{
                  filled: !!shownOn[slot],
                  missed: revealed && !placedOn[slot],
                  ready: !!selected && !shownOn[slot] && !locked,
                  refused: refusal?.slot === slot,
                }"
                :style="{ '--size': sizes[slot], '--i': slot }"
                :disabled="locked || !!placedOn[slot]"
                :aria-label="groupLabel(slot)"
                @click="onGroupTap(slot)"
              >
                <span class="blob">
                  <span class="dots" />
                  <CountryFlag
                    v-if="shownOn[slot]"
                    class="dots flag"
                    :country="getCountry(shownOn[slot]!)"
                    mode="background"
                  />
                  <Sortable
                    v-if="!locked && !placedOn[slot]"
                    :key="`drop-${slot}-${revision}`"
                    :list="[]"
                    item-key="isoCode"
                    :options="dropOptions"
                    class="drop-zone"
                    @add="(event: DropCarryEvent) => onDrop(event, slot)"
                  >
                    <template #item />
                  </Sortable>
                </span>
                <span class="group-label">
                  <span v-if="shownOn[slot]" class="group-name">
                    {{ countryName(shownOn[slot]!) }}
                  </span>
                  <span v-if="challenge.showShares || revealed" class="group-share">
                    {{ formatShare(challenge.shares[slot]!) }}
                  </span>
                  <span v-else-if="!shownOn[slot]" class="group-share">?</span>
                </span>
              </button>
            </div>
            <span v-if="tier.slots.length > 1" class="tie-mark">≈ any order</span>
          </div>
        </div>

        <p class="tail-line">
          + {{ formatShare(tailShare) }} born in other countries ·
          <SourceInfo class="sources" label="Source" :attributions="sources" />
        </p>
      </div>

      <div class="console">
        <Sortable
          :key="`tray-${revision}`"
          :list="challenge.options"
          :item-key="(isoCode: ISOCountryCode) => isoCode"
          :options="sourceOptions"
          class="cards card-options"
          @start="onDragStart"
          @end="stampDrag"
        >
          <template #item="{ element }">
            <button
              type="button"
              class="card-option card draggable"
              :class="{
                chosen: selected === element,
                standing: standing.has(element),
                pending: pending?.isoCode === element,
                'held-back': standing.has(element) || pending?.isoCode === element,
                refused: refusal?.isoCode === element,
              }"
              :disabled="locked || standing.has(element)"
              @click="onCardTap(element)"
            >
              <CountryTileFlag class="card-flag" :country="getCountry(element)" />
              <span class="card-name">{{ countryName(element) }}</span>
            </button>
          </template>
        </Sortable>
        <ChallengeTimerRadial
          class="console-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
      </div>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import { Sortable } from 'sortablejs-vue3'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { compositionTiers, revealedSlots } from '~~/lib/composition'
import { countryName, getCountry } from '~~/lib/country'
import {
  DRAG_HOLD_OPTIONS,
  DRAG_SOURCE_OPTIONS,
  DROP_TARGET_OPTIONS,
  NO_CARRY_LAG,
} from '~~/lib/drag-list'
import { MOTION } from '~~/lib/motion'
import { formatCompact } from '~~/lib/number'
import { useCompositionBoard } from '~~/lib/use-composition-board'
import { useDropCarry, type DropCarryEvent } from '~~/lib/use-drop-carry'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { CompositionPlacement } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Composition: a country's foreign-born population as a crowd, one group per
 * origin, largest first — each card goes onto the group born there. The
 * server grades every drop; this view never holds the answer until its seat
 * can no longer use it.
 *
 * The figures count residents born abroad, never ancestry; copy stays on "born
 * abroad"/"born in" (see lib/migration.ts).
 */
const {
  challenge,
  subject,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  seatEcho,
  createViewTimer,
  boothAnswer,
  gameStore,
} = useGroupChallenge('composition-challenge')

const footer = ref<HTMLElement>()
useFooterBerth(footer)

const sources = datasetAttribution('migration')

const roundIndex = computed(() => (gameStore.game?.rounds.length ?? 0) - 1)
const { board, fetchBoard, sendDrop } = useCompositionBoard(roundIndex)

const shares = computed(() => challenge.value?.shares ?? [])
const tailShare = computed(() =>
  Math.max(1 - shares.value.reduce((sum, share) => sum + share, 0), 0)
)

const formatShare = (share: number) => (share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`)

/** Diameter relative to the head group: area is the share, so the crowd's
 *  dot density is the same everywhere and dot counts compare honestly. */
const sizes = computed(() => {
  const head = shares.value[0] || 1
  return shares.value.map(share => Math.sqrt(share / head).toFixed(3))
})

const tiers = computed(() => {
  const byTier: { slots: number[] }[] = []
  compositionTiers(shares.value).forEach((tier, slot) => {
    ;(byTier[tier] ??= { slots: [] }).slots.push(slot)
  })
  return byTier
})

const revealed = computed(() => submitted.value || !!boothAnswer.value)
const revealKey = computed(() => board.value?.reveal?.map(origin => origin.isoCode))

/** What stands on each group: this seat's board as the server holds it, or —
 *  in the booth — the followed seat's banked origins on their own groups. */
const placedOn = computed<Partial<Record<number, ISOCountryCode>>>(() => {
  if (!gameStore.watching) return board.value?.placed ?? {}
  const banked = new Set(boothAnswer.value?.submitted ?? [])
  return Object.fromEntries(
    (revealKey.value ?? []).flatMap((isoCode, slot) =>
      banked.has(isoCode) ? [[slot, isoCode]] : []
    )
  )
})
const standing = computed(
  () =>
    new Set(Object.values(placedOn.value).filter((isoCode): isoCode is ISOCountryCode => !!isoCode))
)
const strikesLeft = computed(
  () => (challenge.value?.strikes ?? 0) - (gameStore.watching ? 0 : (board.value?.misses ?? 0))
)

const shownOn = computed<Partial<Record<number, ISOCountryCode>>>(() =>
  revealed.value && revealKey.value
    ? revealedSlots({ key: revealKey.value, shares: shares.value }, placedOn.value)
    : placedOn.value
)

const locked = computed(
  () => !started.value || revealed.value || gameStore.watching || !!board.value?.over
)

const groupLabel = (slot: number) => {
  const share = challenge.value?.showShares ? `, ${formatShare(shares.value[slot] ?? 0)}` : ''
  const name = shownOn.value[slot] ? countryName(shownOn.value[slot]!) : 'unnamed'
  return `Group ${slot + 1}${share}: ${name}`
}

const selected = ref<ISOCountryCode>()
const pending = ref<CompositionPlacement & { attempt: number }>()
const refusal = ref<CompositionPlacement>()
const clearRefusal = createViewTimer()

const finish = () => submitOnce([])

const place = async (isoCode: ISOCountryCode, slot: number) => {
  if (locked.value || pending.value) return
  if (placedOn.value[slot] || standing.value.has(isoCode)) return
  selected.value = undefined
  pending.value = { isoCode, slot, attempt: board.value?.attempts ?? 0 }
  const sent = await sendDrop({ isoCode, slot }, seatEcho(subject))
  if (!sent) {
    pending.value = undefined
    announce({ hint: 'That drop never reached the table — try again' })
  }
}

// Every reply carries the seat's whole board: a drop the server took shows up
// as attempts it did not have before, whether or not this reply names it.
watch(board, next => {
  const waiting = pending.value
  if (next && waiting) {
    pending.value = undefined
    if (next.attempts > waiting.attempt) {
      if (next.placed[waiting.slot] === waiting.isoCode) {
        const people = next.drop?.isoCode === waiting.isoCode ? next.drop.people : undefined
        announce({
          hint: people
            ? `${formatCompact(people)} people born in ${countryName(waiting.isoCode)}`
            : undefined,
          kind: 'presence',
          placed: { seated: Object.keys(next.placed).length, total: shares.value.length },
        })
      } else {
        refusal.value = waiting
        clearRefusal(() => (refusal.value = undefined), MOTION.base * 1000)
        const left = (challenge.value?.strikes ?? 0) - next.misses
        announce({
          hint: left
            ? `Not ${countryName(waiting.isoCode)} — ${left} ${left === 1 ? 'strike' : 'strikes'} left`
            : 'Out of strikes',
          tone: 'alert',
        })
      }
    }
  }
  if (next?.over && started.value) finish()
})

// The reload path, and the reveal once this seat is graded.
watch(revealed, () => void fetchBoard(), { immediate: true })

const carry = useDropCarry()
const { stampDrag, revision, undoDomMove } = carry
const onDragStart = () => {
  stampDrag()
  selected.value = undefined
}

const onCardTap = (isoCode: ISOCountryCode) => {
  if (locked.value || !carry.tapAllowed()) return
  selected.value = selected.value === isoCode ? undefined : isoCode
}

const onGroupTap = (slot: number) => {
  if (!carry.tapAllowed()) return
  if (!selected.value) return announce({ hint: 'Pick a country first' })
  void place(selected.value, slot)
}

/** The tray always lists every card (placed ones stay, held back), so the
 *  index Sortable reports is an index into the dealt options. */
const onDrop = (event: DropCarryEvent, slot: number) => {
  stampDrag()
  const isoCode = challenge.value?.options[event.oldIndex ?? -1]
  undoDomMove(event)
  revision.value++
  if (isoCode) void place(isoCode, slot)
}

const dropOptions = computed(() => ({
  ...DROP_TARGET_OPTIONS,
  ...DRAG_HOLD_OPTIONS,
  ...NO_CARRY_LAG,
  disabled: locked.value,
}))
const sourceOptions = computed(() => ({
  ...DRAG_SOURCE_OPTIONS,
  ...DRAG_HOLD_OPTIONS,
  ...NO_CARRY_LAG,
  filter: '.held-back',
  disabled: locked.value,
}))

watchEffect(() => {
  const active = challenge.value
  if (!active) return
  const arrived = revealed.value && revealKey.value ? revealKey.value : [...standing.value]
  gameStore.map.landmass = true
  gameStore.map.highlighted = new Set([active.country])
  gameStore.map.tints = {
    [active.country]: 'endpoint',
    ...Object.fromEntries(
      arrived.map(isoCode => [isoCode, standing.value.has(isoCode) ? 'optimal' : 'inefficient'])
    ),
  }
  gameStore.map.landRoutes = arrived.map(isoCode => `${isoCode}>${active.country}`)
  gameStore.map.focus = [active.country, ...arrived]
})

const stakes = computed(() => {
  const strikes = challenge.value?.strikes ?? 0
  return `Each group is the people born in one country. Drag every flag onto its group — the biggest group pays most, and ${strikes} wrong drops end your run.`
})

const start = () => {
  begin({ onTimeout: finish })
  if (board.value?.over) finish()
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/dot-crowd' as *;
@use '~/assets/scss/rules/ink' as *;

footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  pointer-events: auto;
}

.crowd-panel {
  @include caption-surface($cardRadius);
  container-type: inline-size;
  width: min(100%, 52rem);
  padding: 1rem 1.4rem 0.8rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.strikes {
  display: flex;
  gap: 0.35rem;
}

.strike {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--dark-blue);
  transition:
    background var(--motion-quick) var(--ease-out-expressive),
    transform var(--motion-quick) var(--ease-out-expressive);

  &.spent {
    background: transparent;
    box-shadow: inset 0 0 0 0.12rem flame(0.8);
    transform: scale(0.85);
  }
}

.crowd {
  --gap: 0.9rem;
  --unit: min(9.5rem, 32cqi);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: var(--gap);
  padding: 0.8rem 0 0.4rem;
}

.tier {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
}

.tier-groups {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.tie-mark {
  width: 100%;
  padding-top: 0.25rem;
  border-top: 0.12rem solid ink(0.25);
  color: ink(0.6);
  font-size: 0.72rem;
  text-align: center;
  white-space: nowrap;
}

.group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dark-blue);
  font-family: inherit;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  &.refused {
    animation: refuse var(--motion-base) var(--ease-out-expressive);
  }
}

.blob {
  --diameter: max(2.6rem, calc(var(--size) * var(--unit)));
  position: relative;
  width: var(--diameter);
  height: var(--diameter);
  border-radius: 50%;
  transition: transform var(--motion-quick) var(--ease-out-expressive);
  animation: crowd-gather var(--motion-slow) var(--ease-out-expressive) backwards;
  animation-delay: calc(var(--i) * 70ms);

  .ready &,
  &:has(.ghost) {
    transform: scale(1.06);
  }

  &:has(.ghost),
  .ready:hover & {
    box-shadow: 0 0 0 0.2rem ink(0.35);
  }
}

.drop-zone {
  position: absolute;
  inset: 0;
  border-radius: 50%;

  > * {
    display: none;
  }
}

.dots {
  @include dot-crowd;
  position: absolute;
  inset: 0;
  background: ink(0.55, 41%);

  &.flag {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    clip-path: circle(0% at 50% 50%);
    animation: flag-fill var(--motion-slow) var(--ease-out-expressive) forwards;
  }

  .missed &.flag {
    filter: grayscale(0.7);
    opacity: 0.55;
  }
}

.group-label {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  min-height: 1.9rem;
  max-width: max(5.5rem, calc(var(--size) * var(--unit)));
  line-height: 1.15;
}

.group-name {
  overflow: hidden;
  max-width: 100%;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;

  .missed & {
    color: flame(0.95);
  }
}

.group-share {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.tail-line {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.4rem;
  margin: 0.3rem 0 0;
  color: ink(0.6);
  font-size: 0.75rem;
}

.console {
  display: flex;
  align-items: center;
  gap: 1.2rem;
}

.cards {
  grid-template-columns: repeat(6, minmax(0, 8.5rem));
  gap: 0.8rem;
}

.card {
  gap: 0.45rem;
  padding: 0.55rem;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;

  &.chosen {
    transform: translateY(-0.35rem);
    border-color: var(--dark-blue);
    box-shadow: 0 0.4rem 1rem ink(0.18);
  }

  &.standing {
    opacity: 0.25;
  }

  &.pending,
  &.ghost {
    opacity: 0.45;
  }

  &.drag {
    rotate: -3deg;
    box-shadow: 0 0.6rem 1.4rem ink(0.3);
  }

  &.refused {
    animation: refuse var(--motion-base) var(--ease-out-expressive);
    border-color: var(--hior-ange);
  }
}

.card-flag {
  width: 100%;
  aspect-ratio: 3 / 1.4;
  border-radius: 0.4rem;
}

.card-name {
  overflow: hidden;
  max-width: 100%;
  font-size: 0.8rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.console-clock {
  flex: none;
}

@keyframes crowd-gather {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}

@keyframes flag-fill {
  to {
    clip-path: circle(75% at 50% 50%);
  }
}

@keyframes refuse {
  20%,
  60% {
    transform: translateX(-0.35rem);
  }

  40%,
  80% {
    transform: translateX(0.35rem);
  }
}

@media (max-width: $tablet) {
  .crowd-panel {
    padding: 0.8rem 0.9rem 0.6rem;
  }

  .crowd {
    --gap: 0.6rem;
    --unit: min(7rem, 30cqi);
  }

  .console {
    flex-direction: column-reverse;
    gap: 0.6rem;
    width: 100%;
  }

  .cards {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
}
</style>
