<template>
  <div v-if="challenge" class="two-truths">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Two Truths and a Lie`"
      :title="`Three claims about ${countryName(challenge.country)}`"
      stakes="One of these values secretly belongs to another country. Spot the lie — you get one shot."
      @done="begin"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Two truths and a lie about {{ countryName(challenge.country) }}</h1>
        <span v-if="picked === undefined" class="map-caption sub">
          Tap the claim that doesn't belong
        </span>
        <span v-else-if="foundLie" class="map-caption sub verdict correct">
          Caught it — that's {{ countryName(challenge.lieSource) }}'s number. The truth:
          {{ truthDisplay }}
        </span>
        <span v-else class="map-caption sub verdict incorrect">
          That one was true — the lie was {{ lieLabel }}, which belongs to
          {{ countryName(challenge.lieSource) }}
        </span>
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
      </div>
    </header>

    <section class="claim-stage">
      <div class="flag-frame">
        <CountryFlag
          class="flag"
          :country="getCountry(challenge.country)"
          mode="background"
          fit="contain"
        />
      </div>
      <ul class="claim-list">
        <li v-for="(statement, index) in challenge.statements" :key="statement.accessorId">
          <button
            type="button"
            class="claim-card"
            :class="claimClass(index)"
            :disabled="picked !== undefined"
            @click="pick(index)"
          >
            <span class="claim-label">{{ statementLabel(statement.accessorId) }}</span>
            <strong class="claim-value">
              {{ formatNumber(statement.amount) }}{{ statement.unit ? ` ${statement.unit}` : '' }}
            </strong>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { accessorTopicLabel } from '~~/lib/challenges'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

const {
  challenge,
  currentRound,
  showInterstitial,
  begin,
  announce,
  entries,
  submitOnce,
  registerCleanup,
  gameStore,
} = useGroupChallenge('two-truths-challenge')

const picked = ref<number>()
let submitTimer: ReturnType<typeof setTimeout> | undefined
registerCleanup(() => submitTimer && clearTimeout(submitTimer))

const statementLabel = (accessorId: GroupChallengeAccessorId) => accessorTopicLabel(accessorId)

const foundLie = computed(
  () => picked.value !== undefined && picked.value === challenge.value?.lieIndex
)

const lieLabel = computed(() => {
  const active = challenge.value
  if (!active) return ''
  return statementLabel(active.statements[active.lieIndex].accessorId)
})

const truthDisplay = computed(() => {
  const active = challenge.value
  if (!active) return ''
  const real = getValueByAccessorID(active.country, active.statements[active.lieIndex].accessorId)
  return real ? `${formatNumber(real.amount)}${real.unit ? ` ${real.unit}` : ''}` : '—'
})

const claimClass = (index: number) => {
  if (picked.value === undefined) return undefined
  const active = challenge.value
  if (!active) return undefined
  if (index === active.lieIndex) return 'is-lie'
  if (index === picked.value) return 'was-picked'
  return 'is-truth'
}

const REVEAL_HOLD_MS = 4500
const pick = (index: number) => {
  const active = challenge.value
  if (!active || picked.value !== undefined || showInterstitial.value) return
  picked.value = index
  // Only three statements, all on screen — naming the pick would name the lie.
  announce({ kind: 'presence' })

  const correct = index === active.lieIndex
  submitTimer = setTimeout(() => {
    submitOnce(correct ? [active.country] : [], correct ? active.maximumPoints : 0)
  }, REVEAL_HOLD_MS)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.two-truths {
  top: 0;
  left: 0;
  width: 100%;
  height: var(--viewport-height);
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
  }
  .sub {
    padding: 0.4rem 1.4rem;
  }
  .verdict.correct {
    color: var(--dark-blue);
  }
  .verdict.incorrect {
    color: var(--hior-ange);
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.claim-stage {
  flex: 1;
  gap: 2.4rem;
  display: flex;
  min-height: 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

.flag-frame {
  padding: 1rem;
  border-radius: 1.2rem;
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.85);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);

  .flag {
    width: 16rem;
    height: 9rem;
    display: block;
  }
}

.claim-list {
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
  pointer-events: auto;
  grid-template-columns: repeat(3, minmax(20rem, 26rem));
}

.claim-card {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  cursor: pointer;
  padding: 1.8rem;
  font-size: 1.8rem;
  text-align: center;
  align-items: center;
  font-family: inherit;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive),
    background-color var(--motion-base) var(--ease-out-expressive);

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
  }

  .claim-label {
    opacity: 0.65;
    font-size: 1.3rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .claim-value {
    font-size: 2.4rem;
  }

  // Reveal: the lie glows coral, truths settle to mint
  &.is-lie {
    border-color: var(--hior-ange);
    background: hsla(9.8, 81.3%, 60.2%, 0.18);
  }
  &.is-truth {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }
  &.was-picked:not(.is-lie) {
    outline: 0.25rem solid var(--hior-ange);
    outline-offset: 0.2rem;
  }
}

// Compact phone chrome: tighter prompt padding, footer clear of the home
// indicator.
@media screen and (max-width: $tablet) {
  header {
    padding: 1.2rem 1.6rem;
  }

  // Three 20rem columns overflow any phone: stack the claims full-width and
  // compact them so flag + all three cards share one screen.
  .claim-stage {
    gap: 1.2rem;
    width: 100%;
    padding: 0 1.6rem calc(1.2rem + var(--safe-bottom));
  }

  .flag-frame .flag {
    width: 12rem;
    height: 6.75rem;
  }

  .claim-list {
    gap: 1rem;
    width: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  .claim-card {
    padding: 1rem 1.2rem;

    .claim-value {
      font-size: 2rem;
    }
  }
}
</style>
