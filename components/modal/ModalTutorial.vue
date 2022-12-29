<template>
  <ModalWrapper>
    <div>
      <div class="form-content">
        <h1>Tutorial</h1>
        <p>
          Glück Auf! Das Bagage foppen die frivol Schmock. Das hochgestochen Ohrenschmaus. Das
          Herrengedeck betören der fidel Stelldichein. Der gemach Freikörperkultur erquicken. Die
          hurtig Wuchtbrumme stagnieren. Autobahn und Herrengedeck flanieren rosig Flickschusterei.
          Das adrett Zeche lobpreisen. Das Jubelperser berappen die schnieke Kastrat.
          Fleischwarenfachverkäuferin und Presssack verhaspeln adrett Stelldichein. Der Hanswurst
          schlampampen das ausgemergelt Kerbholz. Der hochgestochen Trinkhalle frohlocken. Habe die
          Ehre!
        </p>
      </div>
      <button class="line-button" @click="closeTutorial">Close tutorial</button>
    </div>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const { gameStore, update, playerId } = useClientEvents()
const closeTutorial = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'group-challenge'
  }

  update({ event: 'close-tutorial' })
}
</script>
