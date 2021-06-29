<template>
  <div class="modal-wrapper">
    <a role="button" class="modal-background"></a>

    <article class="modal theme-highlight-background theme-color slide-block">
      <form @submit.prevent="setName">
        <div class="form-content">
          <header>
            <h1>Welcome!</h1>
          </header>
          <p>
            Drückeberger und Trinkhalle stagnieren verhärmt Zeche. Die dufte
            Schenkelbürste katzbuckeln. Das einfältig Schindluder abkupfern.
            Fressalien und Kerbholz katzbuckeln bräsig Weltschmerz. Das
            blindwütig Lausbub meucheln!
          </p>

          <div class="input-wrapper slide-block">
            <label for="name">Name</label>
            <input id="name" v-model="name" type="text" />
          </div>

          <div class="input-wrapper slide-block">
            <label for="color">Player color</label>
            <div class="player-colors">
              <label
                v-for="backgroundColor in colors"
                :key="backgroundColor"
                :style="{ backgroundColor }"
              >
                <input
                  v-model="color"
                  type="radio"
                  name="color"
                  :checked="backgroundColor === color"
                />
              </label>
            </div>
          </div>
        </div>

        <button class="line-button">Save</button>
      </form>
    </article>
  </div>
</template>
<script lang="ts">
import { defineComponent, PropType, reactive } from '@vue/composition-api'
import { update } from '~/lib/CSE'
import { Game, Player } from '~/types/game'

export default defineComponent({
  props: {
    player: {
      type: Object as PropType<Player>,
      required: true,
    },
    game: {
      type: Object as PropType<Game>,
      required: true,
    },
  },
  methods: {
    async setName() {
      const { game, player, name } = this

      await update({
        event: 'set-player',
        name,
        color: '',
        gameId: String(game?.id),
        playerId: String(player?.id),
      })
    },
  },
  setup() {
    const colors = [
      '#1C3144',
      '#D00000',
      '#FFBA08',
      '#A2AEBB',
      '#3F88C5',
      '#6FD08C',
      '#7B9EA8',
      '#E09891',
      '#CB769E',
      '#EFBDEB',
      '#2A9D8F',
      '#06D6A0',
      '#FCFCFC',
      '#98D2EB',
      '#75B9BE',
      '#87BCDE',
      '#63A088',
      '#FFC4D1',
    ]

    const state = reactive({
      name: '',
      color: colors[Math.floor(Math.random() * colors.length)],
    })

    return {
      colors,
      ...state,
    }
  },
})
</script>
<style scoped>
.input-wrapper {
  display: flex;
  padding: 1.125rem 0;
  align-items: center;
}
.input-wrapper label {
  padding-right: 1rem;
}
.player-colors label {
  width: 3rem;
  height: 3rem;
  display: inline-block;
}
</style>
