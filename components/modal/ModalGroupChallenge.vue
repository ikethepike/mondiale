<template>
  <div>
    <form id="active-round">
      <div id="question">
        <h1>{{ details?.phrasing || currentRound?.round.groupChallenge.id || '' }}</h1>
      </div>

      <footer>
        <div class="indicators">
          <span>{{ details?.markers?.most }}</span>
          <button class="submit" @click.prevent="submitRanking">Submit</button>
          <span>{{ details?.markers?.least }}</span>
        </div>
        <Sortable
          :list="countries"
          :options="options"
          item-key="isoCode"
          class="countries"
          @sort="updateRanking"
        >
          <template #item="{ element }">
            <article class="country-tile draggable" :key="element.isoCode">
              <header>
                <h3>{{ element.name.english }}</h3>
                <span class="local-name">{{ element.name.local }}</span>
              </header>

              <div
                class="flag"
                :data-iso="element.isoCode"
                :style="{
                  backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(element.flag)}')`,
                }"
              />

              <span class="rank" />
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
import { baseEncode } from '~~/lib/strings'
import { ExcludesUndefined } from '~~/types/generics.type'
import { Country, ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

const { gameStore, update, currentRound } = useClientEvents()
const countries = ref<Country[]>(
  gameStore.currentGroupChallengeForPlayer?.map(isoCode => COUNTRIES[isoCode]) || []
)

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

  // update({
  //   event: 'submit-individual-challenge-answer',
  //   isoCode: 'SE',
  // })
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
  // pointer-events: none;
  flex-direction: column;
  > * {
    position: relative;
  }
}
#active-round::before {
  content: '';
  opacity: 0.5;
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  background-color: var(--soft-blue);
}

footer {
  transition: 1s;
}

.indicators {
  display: flex;
  padding: 0 2rem;
  justify-content: space-between;
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
  gap: 2rem;
  width: 100%;
  height: 16vw;
  display: flex;
  padding: 2rem;
  pointer-events: all;
  align-items: stretch;
}

.country {
  width: 20vw;
  height: 100%;
  cursor: move;
  overflow: hidden;
  position: relative;
  background-size: cover;
  transition: opacity 0.2s;
  background-position: center;
  background-repeat: no-repeat;
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
