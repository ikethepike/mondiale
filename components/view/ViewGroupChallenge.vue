<template>
  <div class="group-challenge-wrapper" :class="{ peeking }">
    <form id="active-round" @submit.prevent="submitRanking">
      <ButtonFilled class="peek-button" element="a" @click="peeking = !peeking">
        <span>Peek</span>
        <div class="peek-icon" />
      </ButtonFilled>

      <section id="question">
        <h1>{{ details?.phrasing || currentRound?.round.groupChallenge.id || '' }}</h1>
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
            <article class="country draggable" :key="element.isoCode" :data-iso="element.isoCode">
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
import { COUNTRIES } from '~~/data/countries.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'
import { Country, ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

const { gameStore, update, currentRound } = useClientEvents()
const countries = ref<Country[]>(
  gameStore.currentGroupChallengeForPlayer?.map(isoCode => COUNTRIES[isoCode]) || []
)
const peeking = ref(false)

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
  const id = currentRound.value?.round.groupChallenge.id
  if (id) {
    return getChallengeDetails(id)
  }

  return undefined
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
#active-round {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

#player-drawer:not(.has-animated) .country {
  animation-name: country-card;
  animation-iteration-count: 1;
}

@for $i from 1 through 10 {
  .country:nth-of-type(#{$i}) {
    animation-duration: #{($i * 0.3) + 0.8 + s};
  }
}

@keyframes country-card {
  0% {
    transform: translateY(100%);
  }
}
</style>
