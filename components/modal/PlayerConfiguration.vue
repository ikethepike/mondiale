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
            Drückeberger und Trinkhalle stagnieren verhärmt Zeche. Die dufte Schenkelbürste
            katzbuckeln. Das einfältig Schindluder abkupfern. Fressalien und Kerbholz katzbuckeln
            bräsig Weltschmerz. Das blindwütig Lausbub meucheln!
          </p>

          <div class="input-wrapper slide-block">
            <label for="name">Name</label>
            <input id="name" v-model="state.name" type="text" />
          </div>

          <div class="input-wrapper slide-block">
            <label for="color">Player color</label>
            <div class="player-colors">
              <label
                v-for="backgroundColor in state.colors"
                :key="backgroundColor"
                :style="{ backgroundColor }"
              >
                <input :checked="backgroundColor === state.color" type="radio" name="color" />
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
import { Game, GameColor, gameColors, Player } from '~/types/game'

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
  setup(props) {
    const state = reactive<{ name: string; color: GameColor }>({
      name: '',
      color: props.player.color,
    })

    const setName = async () => {
      const { game, player } = props

      await update({
        event: 'set-player',
        name: state.name,
        gameId: String(game?.id),
        playerId: String(player?.id),
      })
    }

    const setColor = async () => {
      const { game, player } = props
      const { color } = state

      await update({
        color,
        event: 'set-color',
        gameId: String(game?.id),
        playerId: String(player?.id),
      })
    }

    return {
      state,
      setName,
      setColor,
      colors: gameColors,
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
