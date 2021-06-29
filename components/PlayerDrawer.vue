<template>
  <footer
    id="player-drawer"
    ref="drawer"
    :data-statistic="statistic"
    :class="{ 'has-animated': state.hasAnimated }"
  >
    <button @click="submitOrder">Submit</button>
    <draggable v-model="state.countries" group="people" class="list">
      <div
        v-for="country in state.countries"
        :key="country.countryCode"
        :data-country="country.name"
        class="country"
        :style="{
          backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country.flag)}')`,
        }"
      ></div>
    </draggable>
  </footer>
</template>
<script lang="ts">
import draggable from 'vuedraggable'
import { defineComponent, onMounted, reactive, ref } from '@vue/composition-api'
import { Country, CountryCode } from '~/types/geography'
import { update } from '~/lib/CSE'
import { ExcludesUndefined } from '~/types/generics'

export default defineComponent({
  props: {
    codes: {
      type: Array,
      required: true,
    },
    playerId: {
      type: String,
      required: true,
    },
    gameId: {
      type: String,
      required: true,
    },
    statistic: {
      type: String,
      required: true,
    },
  },
  components: {
    draggable,
  },
  setup({ codes, playerId, gameId }, { root }) {
    const drawer = ref<HTMLDivElement>()
    const countries: Country[] = root.$store.state.countries
    const state = reactive<{ countries: Country[]; hasAnimated: boolean }>({
      countries: countries.filter(({ countryCode }) => codes.includes(countryCode)),
      hasAnimated: false,
    })

    const submitOrder = () => {
      update({
        event: 'submit-country-order',
        gameId,
        playerId,
        order: state.countries
          .map(({ countryCode }) => countryCode as CountryCode)
          .filter((Boolean as any) as ExcludesUndefined),
      })
    }

    onMounted(() => {
      if (!drawer.value) return

      const flags = drawer.value.querySelectorAll('.country')
      const flag = flags[flags.length - 1]

      if (!flag) return

      flag.addEventListener('animationend', () => {
        state.hasAnimated = true
      })
    })

    const baseEncode = (data: string) => {
      try {
        return btoa(data)
      } catch (err) {
        return Buffer.from(data).toString('base64')
      }
    }

    return {
      state,
      drawer,
      baseEncode,
      submitOrder,
    }
  },
})
</script>
<style scoped lang="scss">
#player-drawer {
  left: 0;
  bottom: 0;
  width: 100%;
  position: fixed;
  max-height: 20rem;
}
.list {
  width: 100%;
  height: 14vw;
  display: flex;
  align-items: stretch;
}
.country {
  width: 20vw;
  height: 100%;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
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
