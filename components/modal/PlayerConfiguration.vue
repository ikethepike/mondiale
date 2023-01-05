<!-- <template>
  <ModalWrapper>
    <form @submit.prevent="completeConfiguration">
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
          <input @change="setName" id="name" v-model="name" type="text" required />
        </div>

        <div class="input-wrapper slide-block">
          <label for="color">Player color</label>
          <div class="player-colors">
            <label
              v-for="option in colors"
              :key="option"
              :style="{ backgroundColor: option }"
              :class="{ disabled: disabledColors.includes(option) }"
            >
              <input
                :checked="option === color"
                :disabled="disabledColors.includes(option)"
                type="radio"
                name="color"
                @change="setColor(option)"
              />
            </label>
          </div>
        </div>
      </div>
      <button class="line-button" @click="completeConfiguration">Save</button>
    </form>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { PLAYER_COLORS } from '~~/data/palette'
import { getRandomPlayerColor } from '~~/lib/color'
import { useClientEvents } from '~~/lib/events/client-side'
import { PlayerColor } from '~~/types/game.types'

const { update, player, game, gameStore } = useClientEvents()

const name = ref('')
const colors = ref(PLAYER_COLORS)
const color = ref(player.value?.color || getRandomPlayerColor())
const setName = () => {
  update({
    event: 'set-name',
    name: name.value,
  })
}

const setColor = (color: PlayerColor) => {
  update({
    event: 'set-color',
    color,
  })
}

const completeConfiguration = () => {
  // TODO: Add error management for empty names
  gameStore.phase = 'waiting'
}

const disabledColors = computed(() => {
  const colors: PlayerColor[] = []
  for (const player of Object.values(game.value?.players || [])) {
    colors.push(player.color)
  }

  return colors.filter(option => color.value !== option)
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
</style> -->
