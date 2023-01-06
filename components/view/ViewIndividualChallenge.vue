<template>
  <div class="individual-challenge" v-if="challenge">
    <header>
      <template v-if="!status">
        <h1>{{ processReplacements(details?.phrasing || '', challenge.country) }}</h1>
        <span class="hint" v-if="showDoubleTapHint">Press again to confirm</span>
        <div
          class="flag"
          :style="{
            backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country?.flag || '')}')`,
          }"
          v-if="challenge.id === 'flag'"
        />
      </template>
      <template v-else-if="submittedCountry">
        <h1 v-if="status === 'incorrect'">
          Sorry, you pressed: {{ submittedCountry.name.english }}
        </h1>
        <h1 v-else>Correct!</h1>
      </template>
    </header>
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

const { currentMove, update, gameStore } = useClientEvents()

const challenge = ref(currentMove.value?.challenge)

const status = toRef(gameStore.map, 'status')
// const reveal = computed<ISOCountryCode[]>(() => {
//   if (status.value === 'unanswered') return []
//   if (!challenge.value) return []
//   return [challenge.value.country]
// })
const submittedISOCode = ref<ISOCountryCode>()
const submittedCountry = computed(() => {
  if (!submittedISOCode.value) return undefined
  return COUNTRIES[submittedISOCode.value]
})
const submitAnswer = (isoCode: ISOCountryCode) => {
  if (status.value) return
  submittedISOCode.value = isoCode
  gameStore.map.highlighted.clear()
  update({ event: 'submit-individual-challenge-answer', isoCode })

  const challenge = currentMove.value?.challenge
  if (challenge) {
    const correct = isoCode === challenge.country
    gameStore.map.reveal = challenge.country
    gameStore.map.status = correct ? 'correct' : 'incorrect'
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

const showDoubleTapHint = ref(false)
const onMapClick = (event: Event) => {
  if (!isMapClickEvent(event)) return

  const isoCode = event.detail.isoCode as ISOCountryCode
  if (gameStore.map.highlighted.has(isoCode)) {
    // Double click, submit
    // Show hint
    submitAnswer(isoCode)
  } else {
    showDoubleTapHint.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.highlighted.add(isoCode)
  }
}

const clearBoard = () => {
  gameStore.map.highlighted.clear()
  gameStore.map.reveal = undefined
  gameStore.map.status = undefined
}

onBeforeMount(() => {
  // Clear out our global state
  clearBoard()
  document.addEventListener('mapClick', onMapClick)
})
onBeforeUnmount(() => {
  clearBoard()
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
