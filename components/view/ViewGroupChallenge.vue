<template>
  <div class="group-challenge-wrapper" :class="{ peeking }">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1}`"
      :title="details?.phrasing || 'Group Challenge'"
      stakes="The better your ranking, the more steps you take."
      @done="showInterstitial = false"
    />
    <form id="active-round" @submit.prevent="submitRanking">
      <header>
        <ButtonFilled class="peek-button" element="a" @click="peeking = !peeking">
          <span>Peek</span>
          <div class="peek-icon" />
        </ButtonFilled>
      </header>

      <section id="question">
        <h1 class="map-caption">
          {{ details?.phrasing || 'Group Challenge' }}
        </h1>
      </section>

      <footer>
        <div class="indicators">
          <span>{{ details?.markers?.most }}</span>
          <ButtonFilled>Submit Ranking</ButtonFilled>
          <span>{{ details?.markers?.least }}</span>
        </div>
        <Sortable
          :list="countries"
          :options="options"
          item-key="isoCode"
          class="countries"
          :style="{ gridTemplateColumns: `repeat(${countries.length}, 1fr)` }"
          @sort="updateRanking"
        >
          <template #item="{ element }">
            <article :key="element.isoCode" class="country draggable" :data-iso="element.isoCode">
              <CountryTile :country="element" />
            </article>
          </template>
        </Sortable>
      </footer>
    </form>
  </div>
</template>
<script lang="ts" setup>
import { Sortable } from 'sortablejs-vue3'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import { type Country, type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

const { gameStore, update, currentRound } = useClientEvents()
const countries = ref<Country[]>(
  gameStore.currentGroupChallengeForPlayer?.map(isoCode => COUNTRIES[isoCode]) || []
)
const peeking = ref(false)
const showInterstitial = ref(true)

const ranking = ref<ISOCountryCode[]>(gameStore.currentGroupChallengeForPlayer || [])
watch(
  () => gameStore.currentGroupChallengeForPlayer,
  current => {
    if (!current) return

    const parsed: Country[] = []
    for (const isoCode of current) {
      parsed.push(COUNTRIES[isoCode])
    }

    countries.value = parsed
  }
)

const details = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  // This view only mounts for ranking rounds — traversal rounds render
  // ViewTraversalChallenge — but the round data itself is a union.
  if (!challenge || isTraversalChallenge(challenge)) return undefined

  return getChallengeDetails(challenge.id)
})

const updateRanking = (event: Event) => {
  ranking.value = []
  const parent = event.target as HTMLDivElement
  const divs = parent.querySelectorAll('.country')
  for (const div of divs) {
    if (!(div instanceof HTMLElement)) continue

    const { iso } = div.dataset
    if (!isValidISOCode(iso)) continue

    ranking.value.push(iso)
  }
}

const submitRanking = () => {
  update({
    event: 'submit-group-challenge-answers',
    ranking: ranking.value,
  })
}

const options = ref({
  draggable: '.draggable',
  animation: 150,
  ghostClass: 'ghost',
  dragClass: 'drag',
  forceFallback: true,
  bubbleScroll: true,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

// Full-size and positioned: the phase transition animates a transform on this
// wrapper, which makes it the containing block for the absolutely-positioned
// form below. Without explicit dimensions the form's height:100% would
// collapse to zero mid-animation and jump back after — a hard layout shift.
.group-challenge-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

#active-round {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 3rem;
  display: flex;
  position: absolute;
  pointer-events: auto;
  flex-flow: column nowrap;
  backdrop-filter: blur(0.3rem);
  transition: backdrop-filter 0.3s;
  > * {
    position: relative;
  }
}

.peeking {
  #active-round {
    pointer-events: none;
    backdrop-filter: blur(0);
  }
  footer {
    transform: translateY(calc(100% - 9rem));
  }

  #question {
    opacity: 0;
  }
}

h1 {
  font-size: 3.5rem;
}

.peek-button {
  top: 5vh;
  z-index: 10;
  flex-shrink: 0;
  position: absolute;
  width: max-content;
  pointer-events: auto;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  .peek-icon {
    width: 4rem;
    height: 2rem;
    background: #fff;
    mask: url('~/assets/icons/eye.svg') no-repeat center/contain;
  }
}

footer {
  gap: 2rem;
  display: grid;
  padding: 0 2rem;
  transition: 0.6s;
  grid-template-rows: max-content 1fr;
  // transition: 1s;
}

.indicators {
  width: 100%;
  display: grid;
  align-items: flex-end;
  justify-content: space-between;
  grid-template-columns: repeat(3, max-content);
  span:nth-of-type(1)::before {
    content: '⟵';
    padding: 0 1rem;
  }
  span:nth-of-type(2)::after {
    content: '⟶';
    padding: 0 1rem;
  }
}

#question {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.countries {
  gap: 1rem;
  width: 100%;
  display: grid;
  pointer-events: all;
  justify-content: center;
  grid-template-columns: repeat(5, 18vw);
}

.ghost {
  opacity: 0.5;
}

// Card entrance staggering is handled by the 'challenge' phase-transition
// recipe in lib/phase-transitions.ts, which targets these .country elements.

@media screen and (min-width: $tablet) {
  #active-round {
    padding: 0;
  }
}
</style>
