<template>
  <div class="individual-challenge" v-if="challenge">
    <header>
      <h1>{{ processReplacements(details?.phrasing || '', challenge.country) }}</h1>
      <div
        class="flag"
        :style="{
          backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country?.flag || '')}')`,
        }"
        v-if="challenge.id === 'flag'"
      ></div>
    </header>
    <!-- <div class="map-wrapper">
      <GameMap @country-click="submitAnswer" :highlighted="reveal" :status="status" />
    </div> -->
  </div>
</template>
<script lang="ts" setup>
import { COUNTRIES } from '~~/data/countries.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { useClientEvents } from '~~/lib/events/client-side'
import { baseEncode } from '~~/lib/strings'
import { processReplacements } from '~~/lib/values'
import { isMapClickEvent } from '~~/types/events.types'
import { ISOCountryCode } from '~~/types/geography.types'

const { currentMove, update } = useClientEvents()

const challenge = ref(currentMove.value?.challenge)

const status = ref<'unanswered' | 'correct' | 'incorrect'>('unanswered')
const reveal = computed<ISOCountryCode[]>(() => {
  if (status.value === 'unanswered') return []
  if (!challenge.value) return []
  return [challenge.value.country]
})

const submitAnswer = (isoCode: ISOCountryCode) => {
  if (status.value !== 'unanswered') return
  update({ event: 'submit-individual-challenge-answer', isoCode })
  const challenge = currentMove.value?.challenge
  if (challenge) {
    const correct = isoCode === challenge.country
    status.value = correct ? 'correct' : 'incorrect'
  }
}

const details = computed(() => {
  if (!challenge.value) return undefined
  return getChallengeDetails(challenge.value.id)
})

const country = computed(() => {
  if (!challenge.value) return undefined
  return COUNTRIES[challenge.value.country]
})

const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return

  const { isoCode } = event.detail
  console.log('click', isoCode)
}

onBeforeMount(() => {
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('mapClick', onMapClick)
})
</script>
<style lang="scss" scoped>
.individual-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  position: absolute;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;
  position: absolute;
  justify-content: center;
  h1 {
    color: var(---text-color);
    display: block;
  }
  .flag {
    width: 6rem;
    height: 4rem;
    transition: 0.6s;
    display: inline-block;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: top center;
  }
  .flag:hover {
    transform: scale(2);
  }
}
</style>
