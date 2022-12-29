<template>
  <form id="active-round" ref="challenge">
    <div id="question">
      <h1>{{ round.question }}</h1>
    </div>

    <draggable v-model="state.countries" group="countries" class="countries">
      <div
        v-for="country in state.countries"
        :key="country.countryCode"
        :data-country="country.name"
        class="country"
        :style="{
          backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country.flag)}')`,
        }"
      />
    </draggable>
  </form>
</template>
<script lang="ts">
import draggable from 'vuedraggable'

import { defineComponent, onMounted, PropType, reactive, ref } from '@vue/composition-api'
import { update } from '~/lib/CSE'
import { ActiveRound } from '~/store/game'
import { Game, Player } from '~/types/game'
import { useCountryStore } from '~/store/countries'
import { ExcludesUndefined } from '~/types/generics'
import { Country, CountryCode } from '~/types/geography'

export default defineComponent({
  props: {
    round: {
      type: Object as PropType<ActiveRound>,
      required: true,
    },
    player: {
      type: Object as PropType<Player>,
      required: true,
    },
    game: {
      type: Object as PropType<Game>,
      required: true,
    },
  },
  components: {
    draggable,
  },
  setup(props) {
    const countryStore = useCountryStore()
    const drawer = ref<HTMLDivElement>()
    const countries: Country[] = countryStore.countries
    const codes = props.round.challenges[props.player.id].countries
    const state = reactive<{ countries: Country[]; hasAnimated: boolean }>({
      countries: countries.filter(({ countryCode }) => codes.includes(countryCode as CountryCode)),
      hasAnimated: false,
    })

    const submitOrder = () => {
      update({
        event: 'submit-country-order',
        gameId: props.game.id,
        playerId: props.player.id,
        order: state.countries
          .map(({ countryCode }) => countryCode as CountryCode)
          .filter(Boolean as any as ExcludesUndefined),
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
<style lang="scss" scoped>
#active-round {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  position: absolute;
  pointer-events: none;
  flex-direction: column;
}
#question {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(tomato, 0.5);
}

.countries {
  width: 100%;
  height: 14vw;
  display: flex;
  pointer-events: all;
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
