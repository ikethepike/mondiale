<template>
  <div class="player-configuration-wrapper">
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
                  <span class="config-label">Challenges</span>
                  <ButtonLine class="settings-button" type="button" @click="showSettings = true">
                    <span class="settings-button-content">{{ settingsSummary }}</span>
                  </ButtonLine>
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

            <ButtonFilled v-if="isPlayerHost" :disabled="!isEveryoneReady">
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

    <!-- Dedicated challenge-settings page: difficulty sets every group's AUTO
         state; explicit toggles override it. Lives out of the start card so
         the lobby stays lean. -->
    <ModalWrapper v-if="showSettings && game" class="settings-overlay">
      <form
        ref="settingsForm"
        class="pane tl decorator-bottom settings-card"
        @change="updateConfiguration"
        @submit.prevent
      >
        <header class="pane-content settings-header">
          <span class="config-label">Game Settings</span>
          <h2>Challenges</h2>
        </header>

        <div class="pane-content">
          <div class="challenge-row">
            <div class="challenge-meta">
              <span class="challenge-name">Difficulty</span>
              <span class="challenge-caption">Sets what plays by default — override below.</span>
            </div>
            <SegmentedControl
              name="game-difficulty"
              label="Difficulty"
              :options="[...gameDifficulties]"
              :model-value="game.difficulty"
              :disabled="!isPlayerHost"
              @update:model-value="value => (difficultyPreview = value as GameDifficulty)"
              @change="updateConfiguration"
            />
          </div>

          <div v-for="(group, id) in CHALLENGE_GROUPS" :key="id" class="challenge-row">
            <div class="challenge-meta">
              <span class="challenge-name">{{ group.label }}</span>
              <span class="challenge-caption">{{ groupCaption(id) }}</span>
            </div>
            <SegmentedControl
              :name="`game-challenges-${id}`"
              :label="group.label"
              :options="['auto', 'on', 'off']"
              :model-value="overrideValue(id)"
              :disabled="!isPlayerHost"
              @change="updateConfiguration"
            />
          </div>

          <div class="challenge-row">
            <div class="challenge-meta">
              <span class="challenge-name">Live guesses</span>
              <span class="challenge-caption">Show opponents' guesses as they land.</span>
            </div>
            <SegmentedControl
              name="game-liveGuesses"
              label="Live guesses"
              :options="['on', 'off']"
              :model-value="game.liveGuesses === false ? 'off' : 'on'"
              :disabled="!isPlayerHost"
              @change="updateConfiguration"
            />
          </div>

          <p class="challenge-footnote">
            Ranking and stat rounds always play, so there's a game whatever you switch off.
          </p>
        </div>

        <nav class="pane-content settings-nav">
          <ButtonFilled type="button" @click="showSettings = false">
            <span>Done</span>
          </ButtonFilled>
        </nav>
      </form>
    </ModalWrapper>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import RegionOrbs from '~/components/input/RegionOrbs.vue'
import SegmentedControl from '~/components/input/SegmentedControl.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { MOTION, prefersReducedMotion } from '~~/lib/motion'
import { wait } from '~~/lib/time'
import {
  autoEnabledKinds,
  CHALLENGE_GROUPS,
  type ChallengeGroupId,
} from '~~/types/challenges/challenge-groups.type'
import {
  gameLengths,
  gameDifficulties,
  isValidGameConfiguration,
  type GameDifficulty,
} from '~~/types/game.types'

const { player, isPlayerHost, hostPlayer, game, update, gameStore } = useClientEvents()
const playersByPhase = toRef(gameStore, 'playersByPhase')

// Captions resolve against the difficulty tab the host just tapped, not the
// server echo — the panel must show the effect of a difficulty change live.
const difficultyPreview = ref<GameDifficulty>(game.value?.difficulty ?? 'normal')
watch(
  () => game.value?.difficulty,
  difficulty => {
    if (difficulty) difficultyPreview.value = difficulty
  }
)

const showSettings = ref(false)
const settingsForm = ref<HTMLFormElement>()

/** The lobby button's one-line digest of the settings page. */
const settingsSummary = computed(() => {
  const overrides = Object.keys(game.value?.challengeOverrides ?? {}).length
  const difficulty = game.value?.difficulty ?? 'normal'
  return overrides
    ? `${difficulty} · ${overrides} ${overrides === 1 ? 'override' : 'overrides'}`
    : `${difficulty} · defaults`
})

const overrideValue = (id: ChallengeGroupId): string => {
  const override = game.value?.challengeOverrides?.[id]
  return override === undefined ? 'auto' : override ? 'on' : 'off'
}

/** What this group's current tab means in modes, at the previewed difficulty. */
const groupCaption = (id: ChallengeGroupId): string => {
  const override = game.value?.challengeOverrides?.[id]
  const { enabled, total } = autoEnabledKinds(id, difficultyPreview.value)
  if (override === true) return `all ${total.length} ${total.length === 1 ? 'mode' : 'modes'} on`
  if (override === false) return 'off'
  if (enabled.length === total.length) return 'on'
  if (enabled.length === 0) return `off below hard — now ${difficultyPreview.value}`
  return `${enabled.length} of ${total.length} modes at ${difficultyPreview.value}`
}

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
  if (!breakdown.value || !game.value) return

  // The lobby form and the settings page are separate forms; whichever isn't
  // mounted contributes nothing, so its fields fall back to the game's state.
  const entries = [breakdown.value, settingsForm.value]
    .flatMap(form => (form ? [...new FormData(form).entries()] : []))

  const configuration: { [key: string]: FormDataEntryValue | boolean | object } = {}
  const challengeOverrides: { [group: string]: boolean } = {}
  for (const [key, value] of entries) {
    const field = key.replace('game-', '')
    // Group tri-states fold into one overrides object; 'auto' means no key.
    if (field.startsWith('challenges-')) {
      if (value !== 'auto') challengeOverrides[field.replace('challenges-', '')] = value === 'on'
      continue
    }
    configuration[field] = value
  }

  const settingsMounted = !!settingsForm.value
  configuration.challengeOverrides = settingsMounted
    ? challengeOverrides
    : (game.value.challengeOverrides ?? {})
  // Every FormData value arrives as a string; the toggle wants a boolean.
  configuration.liveGuesses = settingsMounted
    ? configuration.liveGuesses === 'on'
    : game.value.liveGuesses !== false
  configuration.difficulty ??= game.value.difficulty

  if (!isValidGameConfiguration(configuration)) {
    throw new TypeError(`Invalid configuration passed`)
  }

  update({
    event: `update-configuration`,
    configuration,
  })
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
  height: var(--viewport-height);
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

.player-configuration {
  z-index: 1;
}

@media screen and (max-width: $tablet) {
  // The wrapper scrolls and the card grows — same contract as desktop.
  // Pinning the card to the viewport height clipped the region orbs and
  // settings off the bottom with no way to reach them.
  .player-configuration-wrapper {
    // dvh, deliberately: an lvh scroller cannot scroll when its content fits,
    // stranding short steps' controls (the naming card) behind the URL bar.
    height: var(--viewport-height);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    // The room shell is pointer-events: none (map taps pass through) and only
    // the card re-enables itself — but WebKit won't drive a scroll container
    // that isn't hit-testable ITSELF, so the scroller must opt in too.
    pointer-events: auto;
    touch-action: pan-y;
  }
  .player-configuration {
    height: auto;
    min-height: 100%;
    // No bottom rule on phones: the card scrolls past the URL bar, so a
    // thick edge would just strand a heavy line mid-content.
    border-bottom: none;
    padding-bottom: calc(var(--safe-bottom) + 2.4rem);
  }

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

// The settings page: difficulty leads, group tri-states follow, live guesses
// closes. Rows share one hairline rhythm with the scorecards.
// Doubled class outranks ModalWrapper's own scoped rules. Fixed, not absolute:
// the bare wrapper carries no `top`, so inside the lobby's scroll container it
// would land in static flow BELOW the card instead of over it. The wrapper is
// dvh + overflow-y: auto, so a page taller than a phone screen scrolls.
.modal-wrapper.settings-overlay {
  inset: 0;
  z-index: 3;
  position: fixed;
  background: hsla(215.7, 76.4%, 21.6%, 0.35);
  backdrop-filter: blur(0.3rem);
  padding: calc(var(--safe-top) + 1.6rem) calc(var(--safe-right) + 1.2rem)
    calc(var(--safe-bottom) + 1.6rem) calc(var(--safe-left) + 1.2rem);
}

.settings-card {
  width: 100%;
  margin: auto;
  max-width: 64rem;
  display: flex;
  flex-flow: column nowrap;
}

// The lobby's door to the settings page — sized to sit flush beside the
// segmented controls (same track height and radius) instead of the taller
// default button chrome.
.settings-button.button.line {
  height: 4.4rem;
  font-size: 1.5rem;
  font-weight: 600;
  border-radius: 1rem;
  padding: 0 1.6rem;
  width: max-content;
  color: var(--dark-blue);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

.settings-header {
  padding-top: 2rem;
  padding-bottom: 1.2rem;
  border-bottom: 0.1rem solid hsla(0, 0%, 7.5%, 0.12);

  h2 {
    margin: 0.2rem 0 0;
    font-size: 2.4rem;
    color: var(--dark-blue);
  }
}

.settings-nav {
  display: flex;
  padding-top: 1.6rem;
  padding-bottom: 2rem;
  justify-content: flex-end;
  border-top: 0.1rem solid hsla(0, 0%, 7.5%, 0.12);
}

.settings-button-content {
  padding: 0 0.4rem;
  text-transform: capitalize;
}

.challenge-row {
  gap: 1rem 2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 1rem 0;
  justify-content: space-between;
  border-bottom: 0.1rem solid hsla(0, 0%, 7.5%, 0.12);

  &:first-of-type {
    border-top: 0.1rem solid hsla(0, 0%, 7.5%, 0.12);
  }

  :deep(.segment) {
    font-size: 1.3rem;
    padding: 0.5rem 1.3rem;
  }
}

.challenge-meta {
  gap: 0.2rem;
  display: flex;
  min-width: 0;
  flex-flow: column nowrap;
}

.challenge-name {
  font-weight: 600;
  font-size: 1.5rem;
  color: var(--dark-blue);
}

.challenge-caption {
  opacity: 0.6;
  font-size: 1.25rem;
}

.challenge-footnote {
  opacity: 0.6;
  margin: 0.8rem 0 0;
  font-size: 1.25rem;
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
    height: var(--viewport-height);
    display: flex;
    overflow-y: auto;
    pointer-events: auto;
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
