<template>
  <div class="player-configuration-wrapper">
    <article class="player-configuration pane tl decorator-bottom" v-if="player">
      <section class="information pane-content">
        <template v-if="player.phase === 'naming'">
          <div class="content">
            <!-- Host player -->
            <header v-if="isPlayerHost">
              <h1>Created game!</h1>
              <p>Your room has been created, let's set up your player and invite some friends.</p>
            </header>

            <!-- Invited player -->
            <header v-else>
              <h1>
                {{
                  hostPlayer?.name ? `You joined ${hostPlayer.name}'s game!` : `You joined a game!`
                }}
              </h1>
              <p>
                You joined a game of Mondiale - a game of world geography! Before we start, let's
                get your player set up.
              </p>
            </header>

            <form class="player-details" @submit.prevent="setName">
              <PlayerPawn class="pawn" :player="player" @click="changeColor" />
              <div class="name-wrapper">
                <label>
                  <strong>What's your name?</strong>
                  <InputText inline-button="Save" @change="(value: string) => (name = value)" />
                </label>
              </div>
            </form>
          </div>
        </template>
        <template v-if="player.phase === 'waiting-for-game'">
          <div class="content">
            <header v-if="playersByPhase.all.length === 1">
              <h1>It's a bit lonely here...</h1>
              <p>
                Hey <strong>{{ player.name }}</strong
                >, let's invite some friends and get the game started. Just copy the link and send
                it over to invite them to join.
              </p>
            </header>
            <header v-else-if="isEveryoneReady">
              <h1>Ready to start!</h1>
              <p>
                Everyone is ready to start, we'll get going as soon as the host starts the game.
              </p>
            </header>
            <header v-else>
              <h1>Waiting for players</h1>
              <p>
                The rest of the players are still setting up their players. Sit tight while they
                finish up.
              </p>
            </header>

            <p>
              Mondiale is a geography game where you compete with others and prove your knowledge of
              the world.
            </p>
            <p>This time, you'll be competing in:</p>

            <form class="breakdown" v-if="game" ref="breakdown" @change="updateConfiguration">
              <!-- Region -->
              <div class="configuration-block">
                <label for="game-variant">Region:</label>
                <select name="game-variant" id="game-variant" :disabled="!isPlayerHost">
                  <option
                    v-for="region of gameVariants"
                    :key="region"
                    :value="region"
                    :selected="game.variant === region"
                  >
                    {{ region.replace('-', ' ') }}
                  </option>
                </select>
              </div>

              <div class="configuration-block">
                <label for="game-length">Length</label>
                <select name="game-length" id="game-length" :disabled="!isPlayerHost">
                  <option
                    v-for="length in gameLengths"
                    :selected="game.length === length"
                    :key="length"
                  >
                    {{ length }}
                  </option>
                </select>
              </div>

              <div class="configuration-block">
                <label for="game-difficulty">Difficulty</label
                ><select name="game-difficulty" id="game-difficulty" :disabled="!isPlayerHost">
                  <option
                    v-for="difficulty in gameDifficulties"
                    :selected="game.difficulty === difficulty"
                    :key="difficulty"
                  >
                    {{ difficulty }}
                  </option>
                </select>
              </div>
            </form>
          </div>

          <nav class="game-controls">
            <ButtonLine @click="copyInviteLink">
              <div class="invite-button-content">
                <span class="text">{{ hasCopied ? 'Copied!' : 'Copy Invite Link' }}</span>
                <div class="invite-icon" />
              </div>
            </ButtonLine>

            <ButtonFilled
              v-if="isPlayerHost"
              :disabled="!isEveryoneReady || playersByPhase.all.length === 1"
            >
              <div class="start-button-content" @click="startGame">
                <span>Start Game</span>
                <div class="arrow-icon" />
              </div>
            </ButtonFilled>
          </nav>
        </template>
      </section>
      <section class="player-lobby pane-content">
        <header>
          <p>{{ playersByPhase.all.length }}/8</p>
        </header>

        <ul>
          <PlayerTile v-for="player in playersByPhase.all" :player="player" :key="player.id">
            <div :class="['player-status', { ready: player.ready }]" />
          </PlayerTile>
        </ul>
      </section>
    </article>
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { wait } from '~~/lib/time'
import {
  gameVariants,
  gameLengths,
  gameDifficulties,
  isValidGameConfiguration,
} from '~~/types/game.types'

const { player, isPlayerHost, hostPlayer, game, update, gameStore } = useClientEvents()
const playersByPhase = toRef(gameStore, 'playersByPhase')

const isEveryoneReady = computed(() => {
  if (!game.value) return false
  return Object.values(game.value.players).every(player => player.ready)
})

const name = ref('')
const breakdown = ref<HTMLFormElement>()
const changeColor = () => {
  update({
    event: 'set-color',
  })
}
const setName = () => {
  update({
    event: 'set-name',
    name: name.value,
  })
}

const updateConfiguration = () => {
  if (!breakdown.value) return

  const data = new FormData(breakdown.value)
  const configuration: { [key: string]: FormDataEntryValue } = {}
  for (const [key, value] of data.entries()) {
    // Bind up to object
    configuration[key.replace('game-', '')] = value
  }

  if (!isValidGameConfiguration(configuration)) {
    throw new TypeError(`Invalid configuration passed`)
  }

  update({
    event: `update-configuration`,
    configuration,
  })

  console.log(configuration)
}

const hasCopied = ref(false)
const copyInviteLink = async () => {
  if (!navigator?.clipboard) return

  hasCopied.value = true

  const { protocol, host } = window.location
  const url = `${protocol}//${host}/room/${game.value?.id}`
  navigator.clipboard.writeText(url)

  await wait(2000)
  hasCopied.value = false
}

const startGame = () => {
  if (!isPlayerHost) {
    return // For those real dumb hackers
  }

  update({
    event: 'start-game',
  })
}
</script>
<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';

.player-configuration {
  width: 100%;
  margin: auto;
  height: 100vh;
  display: flex;
  border-radius: 0;
  max-width: 110rem;
  animation: slide-in 0.5s 1;
  justify-content: flex-end;
  flex-flow: column-reverse nowrap;
}

@media screen and (max-width: $tablet) {
  .player-configuration .player-lobby ul {
    display: flex;
    justify-content: flex-end;
    :deep(.player-tile) {
      width: auto;
      margin: none;
      height: 5rem;
      border: none;
      gap: none;
      padding: 0;

      .player-name,
      .player-status {
        display: none;
      }
      &::before {
        content: none;
      }
    }
  }
}
.information {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: space-between;
  .content > p,
  .content > header p {
    margin-bottom: 1rem;
  }
}

.player-details {
  width: 100%;
  text-align: center;
  .pawn {
    width: 5rem;
  }
  strong {
    display: block;
    margin: 1rem 0;
  }
}

.player-lobby {
  > header {
    opacity: 0.5;
    text-align: right;
    margin-bottom: 1rem;
  }
}

// Configuration
.configuration-block {
  margin-bottom: 0.5rem;
  label {
    display: block;
    font-weight: 700;
    margin-bottom: 0.25rem;
  }
  select,
  option {
    text-transform: capitalize;
  }
  select {
    cursor: pointer;
    background: none;
    border-radius: 0.25rem;
    padding: 0.5rem 1.5rem;
    border: 0.1rem solid var(--black);
  }
}

// Navigation
.game-controls {
  gap: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.invite-button-content,
.start-button-content {
  display: flex;
  align-items: center;
  .invite-icon {
    width: 4rem;
    height: 4rem;
    background: var(--black);
    mask: url('~/assets/icons/copy.svg') no-repeat center/50%;
  }
  .arrow-icon {
    width: 4rem;
    height: 4rem;
    background: #fff;
    margin-left: 2rem;
    mask: url('~/assets/icons/arrow-right.svg') no-repeat center/contain;
  }
}

.player-status {
  width: 4rem;
  height: 2rem;
  margin-left: auto;
  background: var(--black);
  &:not(.ready) {
    mask: url('~/assets/icons/dots.svg') no-repeat center/2rem;
  }
  &.ready {
    mask: url('~/assets/icons/tick.svg') no-repeat center/contain;
  }
}

@keyframes slide-in {
  0% {
    opacity: 0.3;
    transform: translateY(5rem);
  }
}

@media screen and (min-width: $tablet) {
  .player-configuration-wrapper {
    height: 100vh;
    display: flex;
    overflow-y: auto;
  }
  .player-configuration {
    height: auto;
    display: flex;
    min-height: 60vh;
    align-items: stretch;
    flex-flow: row nowrap;
    justify-content: flex-start;

    .information {
      height: auto;
      width: 68%;
    }
    .player-details {
      width: 50%;
      margin: 10vh auto;
    }
    .player-lobby {
      width: 32%;
      min-width: 20rem;
      border-left: 0.1rem solid var(--black);
    }
  }
  .game-controls {
    justify-content: flex-end;
  }
}
</style>
