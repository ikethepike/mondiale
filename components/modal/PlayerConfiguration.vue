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
                v-for="color in colors"
                :key="color"
                :style="{ backgroundColor: color }"
                :class="{ disabled: disabledColors.includes(color) }"
              >
                <input
                  :checked="color === state.color"
                  :disabled="disabledColors.includes(color)"
                  type="radio"
                  name="color"
                  @change="setColor(color)"
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
import { computed, defineComponent, PropType, reactive } from '@vue/composition-api'
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

    const disabledColors = computed<GameColor[]>(() => {
      const colors = Object.values(props.game.players).map(player => player.color)
      return colors.filter(color => state.color !== color)
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

    const setColor = async (color: GameColor) => {
      if (disabledColors.value.includes(color)) return

      state.color = color

      const { game, player } = props

      await update({
        color: state.color,
        event: 'set-color',
        gameId: String(game?.id),
        playerId: String(player?.id),
      })
    }

    return {
      state,
      setName,
      setColor,
      disabledColors,
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
.player-colors {
  display: flex;
  flex-flow: row wrap;
}
.player-colors label {
  width: 3rem;
  height: 3rem;
  overflow: hidden;
  position: relative;
  display: inline-block;
}
/* .player-colors .disabled::before {
  content: '';
  display: block;
  position: absolute;
  cursor: not-allowed;
  width: calc(100% - 4px);
  height: calc(100% - 4px);
  border: 2px solid #fff;
}
.player-colors .disabled::after {
  width: 20px;
  height: 10px;
  top: 0;
  right: 0;
  content: '';
  transform: rotate(45deg) translate(20%, -25%);
  background: #fff;
  position: absolute;
} */

.player-colors .disabled::before {
  width: 100%;
  height: 100%;
  display: block;
  content: '';
  background-color: #fff;
  opacity: 0.8;
  background-size: 10px 10px;
  background-image: repeating-linear-gradient(
    45deg,
    #444cf7 0,
    #444cf7 1px,
    transparent 0,
    transparent 50%
  );
  position: absolute;
}
</style>
