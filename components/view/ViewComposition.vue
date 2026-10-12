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
          <span class="eyebrow">{{ formatCompact(total) }} born abroad</span>
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
                :data-slot="slot"
                :class="{
                  filled: !!shownOn[slot],
                  missed: revealed && !placedOn[slot],
                  over: dragOver === slot,
                  ready: !!selected && !shownOn[slot] && !locked,
                  refused: refusal?.slot === slot,
                }"
                :style="{ '--size': sizes[slot], '--i': slot }"
                :disabled="locked || !!placedOn[slot]"
                :aria-label="groupLabel(slot)"
                @click="placeSelected(slot)"
              >
                <span class="blob">
                  <span class="dots" />
                  <CountryFlag
                    v-if="shownOn[slot]"
                    class="dots flag"
                    :country="getCountry(shownOn[slot]!)"
                    mode="background"
                  />
                </span>
                <span class="group-label">
                  <span v-if="shownOn[slot]" class="group-name">
                    {{ countryName(shownOn[slot]!) }}
                  </span>
                  <span v-if="challenge.showShares || revealed" class="group-share">
                    {{ formatShare(challenge.slices[slot]!.share) }}
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
        <div class="cards card-options">
          <button
            v-for="option in challenge.options"
            :key="option"
            type="button"
            class="card-option card"
            :class="{
              chosen: selected === option,
              standing: standing.has(option),
              refused: refusal?.isoCode === option,
            }"
            :disabled="locked || standing.has(option)"
            @pointerdown="onCardDown($event, option)"
            @click="onCardClick($event, option)"
          >
            <CountryTileFlag class="card-flag" :country="getCountry(option)" />
            <span class="card-name">{{ countryName(option) }}</span>
          </button>
        </div>
        <ChallengeTimerRadial
          class="console-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
      </div>
    </footer>

    <Teleport to="body">
      <div
        v-if="drag?.moved"
        class="composition-ghost"
        :style="{ left: `${drag.x}px`, top: `${drag.y}px` }"
      >
        <CountryTileFlag class="ghost-flag" :country="getCountry(drag.isoCode)" />
      </div>
    </Teleport>
  </div>
</template>
<script lang="ts" setup>
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { compositionTiers, forcedPlacement, replayPlacements } from '~~/lib/composition'
import { countryName, getCountry } from '~~/lib/country'
import { corridorsToDestination } from '~~/lib/migration'
import { formatCompact } from '~~/lib/number'
import { useFooterBerth } from '~~/lib/use-footer-berth'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { CompositionPlacement } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Composition: a country's foreign-born population as a crowd, one group per
 * origin, largest first — each card goes onto the group born there.
 *
 * The figures count residents born abroad, never ancestry; copy stays on "born
 * abroad"/"born in" (see lib/migration.ts).
 */
const {
  challenge,
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
  createViewTimer,
  registerCleanup,
  boothAnswer,
  gameStore,
} = useGroupChallenge('composition-challenge')

const footer = ref<HTMLElement>()
useFooterBerth(footer)

const sources = datasetAttribution('migration')

const corridors = computed(() =>
  challenge.value ? corridorsToDestination(challenge.value.country) : []
)
const total = computed(() => corridors.value.reduce((sum, origin) => sum + origin.value.amount, 0))
const tailShare = computed(() =>
  Math.max(1 - (challenge.value?.slices ?? []).reduce((sum, slice) => sum + slice.share, 0), 0)
)

const formatShare = (share: number) => (share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`)

/** Diameter relative to the head group: area is the share, so the crowd's
 *  dot density is the same everywhere and dot counts compare honestly. */
const sizes = computed(() => {
  const slices = challenge.value?.slices ?? []
  const head = slices[0]?.share || 1
  return slices.map(slice => Math.sqrt(slice.share / head).toFixed(3))
})

const tiers = computed(() => {
  const slices = challenge.value?.slices ?? []
  const byTier: { slots: number[] }[] = []
  compositionTiers(slices).forEach((tier, slot) => {
    ;(byTier[tier] ??= { slots: [] }).slots.push(slot)
  })
  return byTier
})

const attempts = ref<CompositionPlacement[]>([])
const replay = computed(() =>
  challenge.value ? replayPlacements(challenge.value, attempts.value) : undefined
)
const strikesLeft = computed(
  () => (challenge.value?.strikes ?? 0) - (replay.value?.misses.length ?? 0)
)

/** What this seat has standing: its own placements, or — on a remount or in
 *  the booth — the groups the server banked for it. */
const banked = computed(() => {
  if (attempts.value.length || !challenge.value) return undefined
  const answer = boothAnswer.value ?? gameStore.currentRound?.round.groupAnswers[gameStore.seatId]
  return answer ? new Set(answer.submitted) : undefined
})
const placedOn = computed<Partial<Record<number, ISOCountryCode>>>(() => {
  const slices = challenge.value?.slices ?? []
  if (banked.value) {
    return Object.fromEntries(
      slices.flatMap((slice, slot) =>
        banked.value!.has(slice.isoCode) ? [[slot, slice.isoCode]] : []
      )
    )
  }
  return replay.value?.placed ?? {}
})
const standing = computed(() => new Set(Object.values(placedOn.value)))

const revealed = computed(() => submitted.value || !!boothAnswer.value)
/** Every group names itself at the reveal; before it, only the ones placed. */
const shownOn = computed<Partial<Record<number, ISOCountryCode>>>(() =>
  revealed.value
    ? Object.fromEntries(
        (challenge.value?.slices ?? []).map((slice, slot) => [slot, slice.isoCode])
      )
    : placedOn.value
)

const locked = computed(() => !started.value || revealed.value || gameStore.watching)

const groupLabel = (slot: number) => {
  const slice = challenge.value?.slices[slot]
  if (!slice) return ''
  const share = challenge.value?.showShares ? `, ${formatShare(slice.share)}` : ''
  const name = shownOn.value[slot] ? countryName(shownOn.value[slot]!) : 'unnamed'
  return `Group ${slot + 1}${share}: ${name}`
}

const selected = ref<ISOCountryCode>()
const refusal = ref<{ isoCode: ISOCountryCode; slot: number }>()
const clearRefusal = createViewTimer()

const finish = () => {
  if (!challenge.value) return
  const slices = challenge.value.slices
  submitOnce(
    slices.flatMap((_, slot) => replay.value?.placed[slot] ?? []),
    { composition: { placements: attempts.value } }
  )
}

const place = (isoCode: ISOCountryCode, slot: number) => {
  const active = challenge.value
  const before = replay.value
  if (!active || !before || locked.value || before.over) return
  if (before.placed[slot] || standing.value.has(isoCode)) return
  attempts.value = [...attempts.value, { isoCode, slot }]
  selected.value = undefined

  const after = replay.value!
  if (after.placed[slot] === isoCode) {
    const people = corridors.value.find(origin => origin.isoCode === isoCode)?.value.amount
    const seated = Object.keys(after.placed).length
    announce({
      hint: people ? `${formatCompact(people)} people born in ${countryName(isoCode)}` : undefined,
      kind: 'presence',
      placed: { seated, total: active.slices.length },
    })
    const forced = forcedPlacement(active, after)
    if (forced) attempts.value = [...attempts.value, forced]
  } else {
    refusal.value = { isoCode, slot }
    clearRefusal(() => (refusal.value = undefined), 600)
    const left = active.strikes - after.misses.length
    announce({
      hint: left
        ? `Not ${countryName(isoCode)} — ${left} ${left === 1 ? 'strike' : 'strikes'} left`
        : 'Out of strikes',
      tone: 'alert',
    })
  }
  if (replay.value?.over) finish()
}

const placeSelected = (slot: number) => {
  if (!selected.value) {
    announce({ hint: 'Pick a country first' })
    return
  }
  place(selected.value, slot)
}

const toggleSelected = (isoCode: ISOCountryCode) => {
  if (!locked.value) selected.value = selected.value === isoCode ? undefined : isoCode
}

/** Pointer taps select on release (`endDrag`); a click only reaches here from
 *  the keyboard, where `detail` is 0. */
const onCardClick = (event: MouseEvent, isoCode: ISOCountryCode) => {
  if (event.detail === 0) toggleSelected(isoCode)
}

const DRAG_SLOP_PX = 6
const drag = ref<{
  isoCode: ISOCountryCode
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}>()
const dragOver = ref<number>()

const slotUnder = (x: number, y: number) => {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')
  return target && !target.hasAttribute('disabled') ? Number(target.dataset.slot) : undefined
}

const onPointerMove = (event: PointerEvent) => {
  const active = drag.value
  if (!active) return
  active.x = event.clientX
  active.y = event.clientY
  if (
    !active.moved &&
    Math.hypot(active.x - active.startX, active.y - active.startY) > DRAG_SLOP_PX
  ) {
    active.moved = true
    selected.value = active.isoCode
  }
  if (active.moved) dragOver.value = slotUnder(active.x, active.y)
}

const endDrag = (event: PointerEvent) => {
  const active = drag.value
  drag.value = undefined
  dragOver.value = undefined
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (!active) return
  if (!active.moved) {
    if (event.type === 'pointerup') toggleSelected(active.isoCode)
    return
  }
  const slot = event.type === 'pointerup' ? slotUnder(event.clientX, event.clientY) : undefined
  if (slot === undefined) selected.value = undefined
  else place(active.isoCode, slot)
}

const onCardDown = (event: PointerEvent, isoCode: ISOCountryCode) => {
  if (locked.value || standing.value.has(isoCode) || event.button !== 0) return
  drag.value = {
    isoCode,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

registerCleanup(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
})

// The map is the arrivals board: each origin flies in as it lands, and the
// reveal flies in the rest.
watchEffect(() => {
  const active = challenge.value
  if (!active) return
  const arrived = active.slices
    .map(slice => slice.isoCode)
    .filter(isoCode => revealed.value || standing.value.has(isoCode))
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

const start = () => begin({ onTimeout: finish })
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

// Diameters are relative to the head group; the unit is whatever lets the row
// fit the panel, capped so a lone blowout doesn't fill the screen.
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
  .over & {
    transform: scale(1.06);
  }

  .over &,
  .ready:hover & {
    box-shadow: 0 0 0 0.2rem ink(0.35);
  }

  .refused & {
    animation: refuse 0.45s var(--ease-out-expressive);
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
    animation: flag-fill 0.7s var(--ease-out-expressive) forwards;
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
  touch-action: none;
  user-select: none;

  &.chosen {
    transform: translateY(-0.35rem);
    border-color: var(--dark-blue);
    box-shadow: 0 0.4rem 1rem ink(0.18);
  }

  &.standing {
    opacity: 0.25;
  }

  &.refused {
    animation: refuse 0.45s var(--ease-out-expressive);
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

<style lang="scss">
@use '~/assets/scss/rules/ink' as *;

.composition-ghost {
  z-index: 1000;
  position: fixed;
  width: 6rem;
  pointer-events: none;
  transform: translate(-50%, -60%) rotate(-4deg);

  .ghost-flag {
    width: 100%;
    aspect-ratio: 3 / 1.6;
    border-radius: 0.4rem;
    box-shadow: 0 0.6rem 1.4rem ink(0.3);
  }
}
</style>
