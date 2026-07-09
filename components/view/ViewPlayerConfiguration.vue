<template>
  <div class="player-configuration-wrapper">
    <!-- WebGL contour draw-in: the reveal is a single GPU uniform, so it
         costs one draw call/frame instead of repainting ~40 huge SVG paths -->
    <ContourBackdropGl class="contour-backdrop" @drawn="backdropSettled = true" />
    <article v-if="player" class="player-configuration pane tl decorator-bottom">
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
              <div class="pawn-picker">
                <button
                  type="button"
                  class="color-arrow prev"
                  aria-label="Previous colour"
                  @click="changeColor('previous')"
                />
                <PlayerPawn class="pawn" :player="player" @click="changeColor()" />
                <button
                  type="button"
                  class="color-arrow next"
                  aria-label="Next colour"
                  @click="changeColor('next')"
                />
              </div>
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

            <form v-if="game" ref="breakdown" class="breakdown" @change="updateConfiguration">
              <div class="configuration-block region-block">
                <span class="config-label">Region</span>
                <RegionOrbs
                  :model-value="game.variant"
                  :disabled="!isPlayerHost"
                  @change="updateConfiguration"
                />
              </div>

              <div class="config-row">
                <div class="configuration-block">
                  <span class="config-label">Length</span>
                  <SegmentedControl
                    name="game-length"
                    label="Length"
                    :options="[...gameLengths]"
                    :model-value="game.length"
                    :disabled="!isPlayerHost"
                    @change="updateConfiguration"
                  />
                </div>

                <div class="configuration-block">
                  <span class="config-label">Difficulty</span>
                  <SegmentedControl
                    name="game-difficulty"
                    label="Difficulty"
                    :options="[...gameDifficulties]"
                    :model-value="game.difficulty"
                    :disabled="!isPlayerHost"
                    @change="updateConfiguration"
                  />
                </div>

                <div class="configuration-block">
                  <span class="config-label">Live guesses</span>
                  <SegmentedControl
                    name="game-liveGuesses"
                    label="Live guesses"
                    :options="['on', 'off']"
                    :model-value="game.liveGuesses === false ? 'off' : 'on'"
                    :disabled="!isPlayerHost"
                    @change="updateConfiguration"
                  />
                </div>
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
          <p ref="playerCounter">{{ playersByPhase.all.length }}/8</p>
        </header>

        <TransitionGroup tag="ul" name="lobby-tile">
          <PlayerTile
            v-for="lobbyPlayer in playersByPhase.all"
            :key="lobbyPlayer.id"
            :player="lobbyPlayer"
          >
            <div :class="['player-status', { ready: lobbyPlayer.ready }]" />
          </PlayerTile>
        </TransitionGroup>
      </section>
    </article>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import ContourBackdropGl from '~/components/map/ContourBackdropGl.client.vue'
import RegionOrbs from '~/components/input/RegionOrbs.vue'
import SegmentedControl from '~/components/input/SegmentedControl.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { MOTION, prefersReducedMotion } from '~~/lib/motion'
import { wait } from '~~/lib/time'
import { gameLengths, gameDifficulties, isValidGameConfiguration } from '~~/types/game.types'

const { player, isPlayerHost, hostPlayer, game, update, gameStore } = useClientEvents()
const playersByPhase = toRef(gameStore, 'playersByPhase')

// The contour backdrop sweeps in bright, then fades to a dim ambient drift
const backdropSettled = ref(false)

// Pulse the n/8 counter when the lobby size changes
const playerCounter = ref<HTMLElement>()
watch(
  () => playersByPhase.value.all.length,
  () => {
    if (!playerCounter.value || prefersReducedMotion()) return
    gsap.fromTo(
      playerCounter.value,
      { scale: 1.25 },
      { scale: 1, duration: MOTION.quick, ease: 'power2.out', transformOrigin: 'right center' }
    )
  }
)

const isEveryoneReady = computed(() => {
  if (!game.value) return false
  return Object.values(game.value.players).every(player => player.ready)
})

const name = ref('')
const breakdown = ref<HTMLFormElement>()
// Arrows step deterministically through free colours; a pawn tap (no
// direction) jumps to a random one — the server enforces uniqueness either way
const changeColor = (direction?: 'next' | 'previous') => {
  update({
    event: 'set-color',
    direction,
  })
}
const setName = () => {
  update({
    event: 'set-name',
    name: name.value,
  })
}

const updateConfiguration = async () => {
  if (!breakdown.value) return

  // The custom controls drive their hidden inputs through Vue's :value
  // binding, which flushes on the next tick — read FormData AFTER it lands,
  // or we'd send the value from before the click.
  await nextTick()
  if (!breakdown.value) return

  const data = new FormData(breakdown.value)
  const configuration: { [key: string]: FormDataEntryValue | boolean } = {}
  for (const [key, value] of data.entries()) {
    // Bind up to object
    configuration[key.replace('game-', '')] = value
  }
  // Every FormData value arrives as a string; the toggle wants a boolean.
  configuration.liveGuesses = configuration.liveGuesses === 'on'

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
@use '~/assets/scss/rules/breakpoints' as *;

.player-configuration {
  width: 100%;
  margin: auto;
  height: 100vh;
  display: flex;
  border-radius: 0;
  max-width: 110rem;
  justify-content: flex-end;
  flex-flow: column-reverse nowrap;
  position: relative;
}

.player-configuration-wrapper {
  position: relative;
}

// The WebGL contour canvas is a full-cover backdrop behind the card. Its
// draw-in sweep and dim-to-ambient fade are driven inside the component
// (a shader uniform), so there's no per-frame DOM cost here.
.contour-backdrop {
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  pointer-events: none;
}

.player-configuration {
  z-index: 1;
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
    cursor: pointer;
  }
  strong {
    display: block;
    margin: 1rem 0;
  }
}

// Pawn flanked by prev/next colour arrows
.pawn-picker {
  gap: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

// The original arrow icons — larger so the fine lines read clearly (the
// masked SVG can't be stroke-thickened, so size carries the weight). A round
// touch-area fades in on hover to signal the tap target.
.color-arrow {
  width: 4.4rem;
  height: 4.4rem;
  border: none;
  padding: 0;
  display: grid;
  flex-shrink: 0;
  cursor: pointer;
  place-items: center;
  border-radius: 50%;
  background: transparent;
  transition: background-color var(--motion-quick) var(--ease-out-expressive);

  &::before {
    content: '';
    display: block;
    width: 2.6rem;
    height: 2.6rem;
    background: var(--dark-blue);
    mask: url('~/assets/icons/arrow-left.svg') no-repeat center / contain;
    transition: transform var(--motion-quick) var(--ease-out-expressive);
  }
  &.next::before {
    transform: scaleX(-1);
  }

  &:hover {
    background: hsla(215.7, 76.4%, 21.6%, 0.09);
  }
  &:hover::before {
    transform: scale(1.12);
  }
  &.next:hover::before {
    transform: scaleX(-1) scale(1.12);
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
.breakdown {
  gap: 2.4rem;
  display: flex;
  margin-top: 1.6rem;
  flex-flow: column nowrap;
}

.configuration-block {
  gap: 0.9rem;
  display: flex;
  flex-flow: column nowrap;
}

// Small-caps section labels carry the hierarchy, matching the scorecards
.config-label {
  display: block;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

// Length + difficulty sit side by side on wide screens, stack on narrow
.config-row {
  gap: 2.4rem 3.2rem;
  display: flex;
  flex-flow: row wrap;
}

// Navigation
.game-controls {
  gap: 1rem;
  display: flex;
  flex-wrap: wrap;
  margin-top: 2.4rem;
  padding-top: 2rem;
  align-items: center;
  justify-content: space-between;
  border-top: 0.1rem solid hsla(0, 0%, 7.5%, 0.12);
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
    animation: tick-pop var(--motion-quick) var(--ease-out-expressive) 1;
  }
}

@keyframes tick-pop {
  0% {
    transform: scale(0.5);
  }
}

// Players joining/leaving the lobby list
.lobby-tile-enter-from {
  opacity: 0;
  transform: translateX(1.8rem);
}
.lobby-tile-leave-to {
  opacity: 0;
}
.lobby-tile-enter-active,
.lobby-tile-leave-active,
.lobby-tile-move {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
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
