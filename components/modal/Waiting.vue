<template>
  <div class="modal-wrapper">
    <article class="modal theme-highlight-background theme-color slide-block">
      <div class="form-content">
        <header>
          <h1>Ready to go?</h1>
          <div class="player-count">
            <span>Players Ready: {{ playersByPhase.ready.length }}/{{ playersByPhase.all.length }}</span>
          </div>
        </header>
        <ul class="player-listing">
          <li
            v-for="p in playersByPhase.all"
            :key="p.id"
            :class="{
              ready: p.name,
              self: p.id === player?.id,
            }"
          >{{ p.name }}</li>
        </ul>
      </div>

      <template v-if="isPlayerHost">
        <button v-if="playersByPhase.all.length === 1" class="line-button" @click="copyInviteLink">
          <span id="invite-player-text"
            >{{ showInviteButton ? 'Invite Players' : 'Link Copied' }}
          </span>
        </button>

        <button
          v-else
          class="line-button slide-block"
          :disabled="playersByPhase.ready.length !== playersByPhase.all.length"
          @click="startGame"
        >
          Start Game
        </button>
      </template>
      <template v-else>
        <div class="status form-content">
          <span v-if="playersByPhase.ready.length !== playersByPhase.all.length"
            >Waiting for other players...</span
          >
          <span v-else>Waiting for host...</span>
        </div>
      </template>
    </article>
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { wait } from '~~/lib/time'

const { gameStore, game, player, isPlayerHost, update } = useClientEvents()
const playersByPhase = toRef(gameStore, 'playersByPhase')
const showInviteButton = ref(false)

const copyInviteLink = async () => {
  if (!navigator?.clipboard) return

  showInviteButton.value = false

  const { protocol, host } = window.location
  const url = `${protocol}//${host}/room/${game.value?.id}`
  navigator.clipboard.writeText(url)

  await wait(2000)
  showInviteButton.value = true
}

const startGame = () => {
  if(!isPlayerHost) {
    return  // For those real dumb hackers
  }

  update({
    event: "start-game"
  })
}

</script>
<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
ul {
  margin: 1rem 0;
}
li {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}
li .gutter {
  width: 1rem;
  cursor: pointer;
  margin-right: 1rem;
}
li.self .name {
  text-decoration: underline;
}
li.waving::after {
  margin-left: 0.5em;
  content: 'Waving!';
}
</style>
