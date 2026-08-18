<template>
  <div class="player-configuration-wrapper">
    <article v-if="player" class="player-configuration pane tl decorator-bottom">
      <!-- Pinned to the pane, not to a column: the code is a way INTO the
           room, so it stays reachable from the naming step onward rather than
           living inside the settings the host has not reached yet. -->
      <button
        v-if="game && !game.started"
        type="button"
        class="qr-trigger"
        aria-label="Show QR code to join"
        title="Show QR code to join"
        @click="showQr = true"
      ></button>
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
                  <InputText
                    required
                    inline-button="Save"
                    :maxlength="MAX_PLAYER_NAME_LENGTH"
                    @change="(value: string) => (name = value)"
                    @input="(value: string) => (name = value)"
                  />
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
                >, a game is better with company. Send an invite, or let someone sitting nearby scan
                the code in the corner.
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
                <span class="eyebrow config-label">Region</span>
                <RegionOrbs
                  :model-value="game.variant"
                  :disabled="!isPlayerHost"
                  @change="updateConfiguration"
                />
              </div>

              <div class="config-row">
                <div class="configuration-block">
                  <span class="eyebrow config-label">Length</span>
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
                  <span class="eyebrow config-label">Difficulty</span>
                  <SegmentedControl
                    name="game-difficulty"
                    label="Difficulty"
                    :options="[...gameDifficulties]"
                    :model-value="difficultyPreview"
                    :disabled="!isPlayerHost"
                    @update:model-value="value => (difficultyPreview = value as GameDifficulty)"
                    @change="updateConfiguration"
                  >
                    <template #action>
                      <button
                        type="button"
                        class="customize-button"
                        aria-label="Customize challenges"
                        @click="showSettings = true"
                      />
                    </template>
                  </SegmentedControl>
                  <span v-if="overrideCount" class="config-caption">
                    {{ overrideCount }} challenge
                    {{ overrideCount === 1 ? 'override' : 'overrides' }}
                  </span>
                </div>
              </div>
            </form>
          </div>

          <nav class="game-controls">
            <ButtonLine
              :class="['invite-button', { nudge: nudgeInvite }]"
              :aria-label="inviteLabel"
              @click="shareInviteLink"
            >
              <div class="invite-button-content">
                <!-- Two labels for one control: the full phrase when the row
                     can hold it, a single word when it cannot. A container
                     query swaps them on the NAV's width, so the pair reflows
                     off its own box rather than a guessed viewport. -->
                <span class="text long">{{ inviteLabel }}</span>
                <span class="text short">{{ shortInviteLabel }}</span>
                <div class="invite-icon" />
              </div>
            </ButtonLine>

            <ButtonFilled v-if="isPlayerHost" class="start-button" :disabled="!isEveryoneReady">
              <div class="start-button-content" @click="startGame">
                <span class="text long">Start Game</span>
                <span class="text short">Start</span>
                <div class="arrow-icon" />
              </div>
            </ButtonFilled>
          </nav>
        </template>
      </section>
      <section class="player-lobby pane-content">
        <header>
          <!-- Bots are the secondary mode — a quiet text affordance, never a
               card or panel; the roster and Start Game keep the stage. -->
          <button v-if="canAddBot" type="button" class="add-bot" @click="addBot">
            + add a bot
          </button>
          <!-- "3/8" is a fact; "5 seats open" is an invitation — and it counts
               DOWN as people arrive, so the existing pulse reads as progress. -->
          <p ref="playerCounter">{{ seatsLabel }}</p>
        </header>

        <TransitionGroup tag="ul" name="lobby-tile">
          <PlayerTile
            v-for="lobbyPlayer in playersByPhase.all"
            :key="lobbyPlayer.id"
            :player="lobbyPlayer"
          >
            <button
              v-if="isPlayerHost && lobbyPlayer.id !== player?.id"
              type="button"
              class="kick-button"
              :aria-label="`Remove ${playerDisplayName(lobbyPlayer)} from the game`"
              :title="`Remove ${playerDisplayName(lobbyPlayer)}`"
              @click="lobbyPlayer.bot ? removeBot(lobbyPlayer.id) : kickPlayer(lobbyPlayer.id)"
            ></button>
            <div :class="['player-status', { ready: lobbyPlayer.ready }]" />
          </PlayerTile>

          <!-- The empty chairs, made visible: a counter reading "1/8" states
               the table is empty, a waiting seat SHOWS it — and doubles as the
               second way to invite, right where the absence is felt. -->
          <li v-for="seat in openSeats" :key="`open-${seat}`" class="open-seat">
            <button type="button" class="open-seat-button" @click="shareInviteLink">
              <span class="open-seat-pawn" aria-hidden="true" />
              <span class="open-seat-label">Invite a friend</span>
            </button>
          </li>
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
          <div>
            <span class="eyebrow config-label">Game Settings</span>
            <h2>Challenges</h2>
          </div>
          <!-- The sheet is long on a phone; leaving only the Done button at the
               very bottom meant scrolling the whole list to get back out. -->
          <button
            type="button"
            class="kick-button settings-close"
            aria-label="Close game settings"
            title="Close"
            @click="showSettings = false"
          ></button>
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
              :model-value="difficultyPreview"
              :disabled="!isPlayerHost"
              @update:model-value="value => (difficultyPreview = value as GameDifficulty)"
              @change="updateConfiguration"
            />
          </div>

          <div v-for="(group, id) in visibleChallengeGroups" :key="id" class="challenge-row">
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
              <span class="challenge-name">Micro-nations</span>
              <span class="challenge-caption">{{ microNationsCaption }}</span>
            </div>
            <SegmentedControl
              name="game-microNations"
              label="Micro-nations"
              :options="['auto', 'on', 'off']"
              :model-value="microNationsValue"
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

          <div class="challenge-row">
            <div class="challenge-meta">
              <span class="challenge-name">Spectators</span>
              <span class="challenge-caption">Friends with the link can watch.</span>
            </div>
            <SegmentedControl
              name="game-spectators"
              label="Spectators"
              :options="['on', 'off']"
              :model-value="game.allowSpectators ? 'on' : 'off'"
              :disabled="!isPlayerHost"
              @change="setSpectatorAccess"
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

    <InviteQrModal v-if="showQr && game" :url="inviteUrl()" @close="showQr = false" />
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import InviteQrModal from '~/components/modal/InviteQrModal.vue'
import RegionOrbs from '~/components/input/RegionOrbs.vue'
import SegmentedControl from '~/components/input/SegmentedControl.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { microNationsIncluded } from '~~/lib/game-rules'
import { MOTION, prefersReducedMotion } from '~~/lib/motion'
import {
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
  normalizePlayerName,
  playerDisplayName,
} from '~~/lib/player'
import { roomInviteUrl, useInviteLink } from '~~/lib/use-invite-link'
import {
  autoEnabledKinds,
  CHALLENGE_GROUPS,
  type ChallengeGroup,
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

// Hidden groups (stat-topic gates without a lobby row yet) stay out of the
// panel until their toggle ships. The cast drops the filtered keys' optional
// slots — v-for only visits present entries.
const visibleChallengeGroups = Object.fromEntries(
  Object.entries(CHALLENGE_GROUPS).filter(([, group]) => !('hidden' in group))
) as Record<ChallengeGroupId, ChallengeGroup>

// The optimistic difficulty: both the lobby and settings controls bind to it,
// so a tap in one mirrors to the other (and to the captions) before the
// server echoes — which still wins when it lands.
const difficultyPreview = ref<GameDifficulty>(game.value?.difficulty ?? 'normal')
watch(
  () => game.value?.difficulty,
  difficulty => {
    if (difficulty) difficultyPreview.value = difficulty
  }
)

const showSettings = ref(false)
const settingsForm = ref<HTMLFormElement>()

/** Overrides badge under the lobby's difficulty control. */
const overrideCount = computed(() => Object.keys(game.value?.challengeOverrides ?? {}).length)

const overrideValue = (id: ChallengeGroupId): string => {
  const override = game.value?.challengeOverrides?.[id]
  return override === undefined ? 'auto' : override ? 'on' : 'off'
}

/** Micro-nations tri-state, resolved exactly like the group overrides. */
const microNationsValue = computed(() => {
  const override = game.value?.includeMicroNations
  return override === undefined ? 'auto' : override ? 'on' : 'off'
})

// Same terse idiom as the group captions — a long line here wraps the meta
// column wide and shoves the control out of the row.
const microNationsCaption = computed(() => {
  const override = game.value?.includeMicroNations
  if (override === true) return 'on'
  if (override === false) return 'off'
  return microNationsIncluded({ difficulty: difficultyPreview.value })
    ? 'on'
    : `off below hard — now ${difficultyPreview.value}`
})

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

// Pulse the seat counter when the lobby size changes
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

const seatsLabel = computed(() => {
  const open = MAX_PLAYERS - playersByPhase.value.all.length
  if (open <= 0) return 'Table full'
  return `${open} seat${open === 1 ? '' : 's'} open`
})

const isEveryoneReady = computed(() => {
  if (!game.value) return false
  return Object.values(game.value.players).every(player => player.ready)
})

/**
 * Waiting chairs to draw under the roster. Capped at two: enough to read as
 * "there is room for people", not so many that a solo host faces seven empty
 * rows and a full table looks broken. Gone entirely once anyone else arrives —
 * the point is the invitation, not an inventory of the seat count.
 */
const OPEN_SEATS_SHOWN = 2
const openSeats = computed(() => {
  if (!isPlayerHost.value || player.value?.phase === 'naming') return 0
  const seated = playersByPhase.value.all.length
  if (seated > 1) return 0
  return Math.min(OPEN_SEATS_SHOWN, MAX_PLAYERS - seated)
})

/** Seating a bot is a HOST decision about the table, and the host is not a
 *  seated player until they have a name — otherwise round one deals to a
 *  nameless chair sitting above a row of ready bots. */
const canAddBot = computed(
  () =>
    isPlayerHost.value &&
    player.value?.phase !== 'naming' &&
    playersByPhase.value.all.length < MAX_PLAYERS
)

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
// The input's `required` blocks empty submits natively; this guard backstops
// whitespace-only names, which pass constraint validation but aren't names.
const setName = () => {
  const validName = normalizePlayerName(name.value)
  if (!validName) return

  update({
    event: 'set-name',
    name: validName,
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
  // Difficulty lives in BOTH — the settings entry comes later and wins, and
  // both controls track the same model, so the loser is never stale.
  const entries = [breakdown.value, settingsForm.value].flatMap(form =>
    form ? [...new FormData(form).entries()] : []
  )

  const configuration: { [key: string]: FormDataEntryValue | boolean | object } = {}
  const challengeOverrides: { [group: string]: boolean } = {}
  for (const [key, value] of entries) {
    const field = key.replace('game-', '')
    // Group tri-states fold into one overrides object; 'auto' means no key.
    if (field.startsWith('challenges-')) {
      if (value !== 'auto') challengeOverrides[field.replace('challenges-', '')] = value === 'on'
      continue
    }
    // Micro-nations is a tri-state too: 'auto' = no key (difficulty decides).
    if (field === 'microNations') {
      if (value !== 'auto') configuration.includeMicroNations = value === 'on'
      continue
    }
    // The spectator door rides its own event (it must swing mid-game too) —
    // its control sits in this form only for layout.
    if (field === 'spectators') continue
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
  // Settings not mounted: carry the game's stored tri-state (absent = auto).
  if (!settingsMounted && game.value.includeMicroNations !== undefined) {
    configuration.includeMicroNations = game.value.includeMicroNations
  }
  configuration.difficulty ??= game.value.difficulty

  if (!isValidGameConfiguration(configuration)) {
    throw new TypeError(`Invalid configuration passed`)
  }

  update({
    event: `update-configuration`,
    configuration,
  })
}

const showQr = ref(false)

/**
 * A single nudge on the invite the first time the host sees it, then never
 * again — the standing rule against ambient motion exists because an INFINITE
 * loop hung the stability check and stole taps, and a one-shot has neither
 * failure mode. It also holds still under reduced-motion.
 */
const nudgeInvite = ref(false)
const NUDGE_DELAY_MS = 600
watch(
  () => player.value?.phase === 'waiting-for-game',
  waiting => {
    if (!waiting || nudgeInvite.value || prefersReducedMotion()) return
    // A beat after the step lands, so it reads as a nudge rather than part of
    // the screen arriving.
    setTimeout(() => (nudgeInvite.value = true), NUDGE_DELAY_MS)
  },
  { immediate: true }
)

/** Say what the tap will actually do: a share sheet is not a copy, and
 *  promising "Copied!" for one is a small lie the player catches. */
const canShareNatively = computed(() => import.meta.client && !!navigator.share)
const inviteLabel = computed(() => {
  if (hasCopied.value) return 'Copied!'
  return canShareNatively.value ? 'Invite Friends' : 'Copy Invite Link'
})
/** The same promise in one word, for when the row is too tight for the phrase. */
const shortInviteLabel = computed(() => (hasCopied.value ? 'Copied!' : 'Invite'))

const inviteUrl = () => roomInviteUrl(game.value?.id)

// The share sheet, the copy fallback and the "Copied!" flag all live in
// lib/use-invite-link — the QR sheet's address offers the same promise, and
// two implementations of "hand someone this room" would drift.
const { hasCopied, share: shareInviteLink } = useInviteLink(inviteUrl)

const setSpectatorAccess = (value: string) => {
  update({
    event: 'set-spectator-access',
    allowed: value === 'on',
  })
}

const kickPlayer = (targetId: string) => {
  update({ event: 'kick-player', targetId })
}

const addBot = () => {
  update({ event: 'add-bot' })
}

const removeBot = (targetId: string) => {
  update({ event: 'remove-bot', targetId })
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
@use '~/assets/scss/rules/ink' as *;
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
    // Instructions first. The desktop card reads right-to-left through
    // column-reverse, which on a phone stacked the seat roster ABOVE the
    // headline that explains what the player is looking at.
    flex-flow: column nowrap;
    // No bottom rule on phones: the card scrolls past the URL bar, so a
    // thick edge would just strand a heavy line mid-content.
    border-bottom: none;
    // The home indicator, or the keyboard while naming — whichever bites.
    padding-bottom: calc(var(--bottom-clearance) + 2.4rem);
  }

  // The roster stays a LIST on phones. It was a right-aligned strip of bare
  // pawns — no names, no ready state — and once a bot glyph and a remove
  // button joined each tile, eight seats overflowed a row that never wrapped.
  .player-configuration .player-lobby ul {
    display: flex;
    flex-flow: column nowrap;
    :deep(.player-tile) {
      width: 100%;
      gap: 1.2rem;
      padding: 0 1.2rem;
      margin-bottom: 0.8rem;
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

  // A resting wash so the arrows read as tappable on touch, where the hover
  // state below never fires and they were bare glyphs on the card.
  background: ink(0.05);

  &:hover,
  &:focus-visible {
    background: ink(0.09);
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
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.2rem;
    text-align: right;
    margin-bottom: 1rem;
    // The wash is the COUNTER's, not the row's: worn by the header it also
    // greyed the add-bot control, which then read as disabled.
    > p {
      opacity: 0.5;
      margin-left: auto;
    }
  }

  // The secondary mode's whole UI: a muted text affordance in the counter
  // line, never a card or panel. Quiet, but a real target — as a bare inline
  // link it was ~10px tall and read as disabled next to the seat counter.
  .add-bot {
    border: none;
    background: none;
    padding: 1.2rem 0;
    min-height: 4.4rem;
    display: inline-flex;
    align-items: center;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 0.3em;

    // The wash lives on the counter now, so there is no opacity left to wake
    // — the underline going solid is the whole hover tell.
    &:hover,
    &:focus-visible {
      text-decoration-style: solid;
    }
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

// The label itself is `.eyebrow` (templates/_eyebrow.scss); the block owns
// its own gap, so the only genuine difference is dropping that margin.
.config-label {
  margin-bottom: 0;
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
  background: ink(0.35);
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

  // The WRAPPER scrolls, not the card, so a sticky header inside sticks to the
  // wrapper's padding box — parking it a safe-inset below the card's own top
  // edge while the card scrolls away underneath. Owning the scroll here puts
  // the header's containing block back on the card, where `top: 0` means the
  // card's top. Capped so a long list scrolls INSIDE the card rather than
  // running past the viewport.
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

// The lobby's door to the settings page — a compact icon riding the far right
// of the difficulty control's track, inside its chrome.
.customize-button {
  border: none;
  padding: 0;
  display: grid;
  width: 3.6rem;
  cursor: pointer;
  flex-shrink: 0;
  place-items: center;
  border-radius: 0.7rem;
  background: transparent;
  transition: background-color var(--motion-quick) var(--ease-out-expressive);

  &::before {
    content: '';
    display: block;
    width: 1.8rem;
    height: 1.8rem;
    background: var(--dark-blue);
    mask: url('~/assets/icons/sliders.svg') no-repeat center / contain;
  }

  &:hover {
    background: ink(0.09);
  }
}

.config-caption {
  opacity: 0.6;
  font-size: 1.25rem;
}

.settings-header {
  // Sticky: the challenge list runs long on a phone, and the way out must
  // travel with it rather than sitting under every row.
  position: sticky;
  top: 0;
  // Above the rows travelling under it. `.segment` carries z-index 1 of its
  // own, and an equal index loses to whatever comes LATER in the document —
  // which is every row below, so segment labels printed straight through the
  // heading. This must stay clear of that, not tie it.
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.2rem;
  padding-top: 2rem;
  padding-bottom: 1.2rem;
  // The pane's own surface, so rows scrolling under the header stay hidden.
  // Opaque by necessity, not decoration: the rows pass directly beneath it.
  background: var(--background-color);
  border-bottom: 0.1rem solid $hairline;

  h2 {
    margin: 0.2rem 0 0;
    font-size: 2.4rem;
    color: var(--dark-blue);
  }
}

.settings-close {
  margin-left: 0;
}

.settings-nav {
  display: flex;
  padding-top: 1.6rem;
  padding-bottom: 2rem;
  justify-content: flex-end;
  border-top: 0.1rem solid $hairline;
}

.challenge-row {
  gap: 1rem 2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 1rem 0;
  justify-content: space-between;
  border-bottom: 0.1rem solid $hairline;

  &:first-of-type {
    border-top: 0.1rem solid $hairline;
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

// One layout for every row on phones: meta above, full-width control below.
// Flex-wrap decided per-row by label length, so neighbouring rows broke
// differently and the page read as a jumble.
@media screen and (max-width: $tablet) {
  .config-row {
    flex-flow: column nowrap;
  }

  .challenge-row {
    gap: 0.8rem;
    align-items: stretch;
    flex-flow: column nowrap;
  }

  .config-row .configuration-block :deep(.segmented),
  .challenge-row :deep(.segmented) {
    width: 100%;
  }
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
  border-top: 0.1rem solid $hairline;
  // The pair sizes off ITS OWN box, not the viewport: the same phone width
  // gives this nav a different track in the one-column phone layout than in
  // the desktop 68% information column.
  container: game-controls / inline-size;
}

// Full phrases by default; the short pair only appears when the container
// asks for it.
.game-controls .text.short {
  display: none;
}
// Pinned to the pane's corner. The pane is `position: relative` already, and
// this sits above the columns so it clears the roster's own header row.
.qr-trigger {
  top: 1.2rem;
  right: 1.2rem;
  z-index: 2;
  width: 4.4rem;
  height: 4.4rem;
  padding: 0;
  border: none;
  position: absolute;
  cursor: pointer;
  border-radius: 0.6rem;
  background: ink(0.05);
  opacity: 0.75;
  transition:
    opacity var(--motion-quick, 0.15s) ease,
    background-color var(--motion-quick, 0.15s) ease;

  &::before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background: var(--dark-blue);
    mask: url('~/assets/icons/qr.svg') no-repeat center / 2.2rem;
  }

  &:hover,
  &:focus-visible {
    opacity: 1;
    background: ink(0.09);
  }
}

// Colour moves, the button does not. Two feathered blobs — the clock ember and
// the deep blue — drift across the inside of the button and fade out, so the
// eye is caught by warmth passing under the label rather than by a control
// that jumps. Nothing here changes the button's box or its hit area, which is
// what made the old lift risky above Start Game.
//
// ONE pass, ~2.2s, then gone: the rule this bends exists because an INFINITE
// loop hung the stability check and stole taps, and a finite pass has neither
// failure mode.
.invite-button {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.invite-button.nudge::after {
  content: '';
  position: absolute;
  inset: -40%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(40% 62% at 20% 52%, #{ember(0.8)} 0%, #{ember(0)} 68%),
    radial-gradient(36% 58% at 76% 44%, hsla(215, 62%, 32%, 0.6) 0%, hsla(215, 62%, 32%, 0) 68%);
  filter: blur(0.7rem);
  opacity: 0;
  animation: invite-swirl 2.2s var(--ease-out-expressive) 1 forwards;
}

@keyframes invite-swirl {
  0% {
    opacity: 0;
    transform: translateX(-18%) rotate(0deg) scale(0.9);
  }
  22% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(18%) rotate(26deg) scale(1.15);
  }
}

// The JS guard already declines to add `.nudge` under reduced motion; this is
// the belt to that pair of braces, and it must name the PSEUDO-element — the
// swirl lives on ::after, so a rule on the button alone would leave it running.
@media (prefers-reduced-motion: reduce) {
  .invite-button.nudge::after {
    animation: none;
    opacity: 0;
  }
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

// Same visual language as the ready marker beside it: a solid masked icon,
// not a typeset glyph. Quiet at rest (removal shouldn't shout on every
// tile), full weight + the alert hue on hover/focus — it's destructive.
.kick-button {
  margin-left: auto;
  // The glyph stays small — removal shouldn't shout — but the TARGET grows to
  // a finger's worth wherever a finger is what aims it: destructive at
  // 2.4×2rem was the smallest thing to hit on the whole screen. A mouse needs
  // no such room, and the desktop lobby column is only ~16rem wide, so a
  // 4.4rem target there ate the name instead.
  width: 2.8rem;
  height: 2.8rem;
  padding: 0;

  @media (pointer: coarse) {
    width: 4.4rem;
    height: 4.4rem;
  }
  border: none;
  background: none;
  cursor: pointer;
  opacity: 0.45;
  flex-shrink: 0;
  transition: opacity var(--motion-quick, 0.15s) ease;

  &::before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background: var(--black);
    mask: url('~/assets/icons/cross.svg') no-repeat center / 1.4rem;
    transition: background-color var(--motion-quick, 0.15s) ease;
  }

  &:hover,
  &:focus-visible {
    opacity: 1;

    &::before {
      background: flame();
    }
  }
}

// A chair nobody is in yet: the roster tile's silhouette in dashes, so the
// eye reads "one of these, empty" rather than a new kind of thing.
.open-seat {
  margin-bottom: 0.8rem;
}
.open-seat-button {
  gap: 1.2rem;
  width: 100%;
  height: 5rem;
  display: flex;
  padding: 0 1.2rem;
  cursor: pointer;
  align-items: center;
  background: none;
  // A <button> does not inherit the body font — without this the row renders
  // in the browser's UI sans beside a roster set in Lusitana.
  font-family: inherit;
  color: var(--dark-blue);
  border: 0.1rem dashed ink(0.28);
  border-radius: 0.6rem;
  transition: border-color var(--motion-quick) ease;

  &:hover,
  &:focus-visible {
    border-color: ink(0.5);
  }
}
.open-seat-pawn {
  width: 2.2rem;
  height: 3.4rem;
  flex-shrink: 0;
  opacity: 0.3;
  background: var(--dark-blue);
  mask: url('~/assets/icons/pawn.svg') no-repeat center / contain;
}
.open-seat-label {
  font-size: 1.5rem;
  opacity: 0.65;
}

.player-status {
  // A 2rem glyph; the box was 4rem, and in the ~16rem desktop lobby column
  // that slack came straight off the player's name. Full width again on a
  // laptop, where the column can afford it.
  width: 2.4rem;
  height: 2rem;
  margin-left: auto;
  // Ready state is the row's whole point — it must not be the thing that
  // compresses when the desktop lobby column gets narrow.
  flex-shrink: 0;
  background: var(--black);

  @media screen and (min-width: $laptop) {
    width: 4rem;
  }

  // The kick button already claimed the auto gap when it renders before us
  .kick-button + & {
    margin-left: 0.5rem;
  }
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

      // This column is ~22rem at the narrow end of desktop, and the tile's
      // own 2rem gap + 2rem side padding spend 6rem of it before a single
      // glyph lands — enough that the pawn and the ready tick were pushed out
      // of the row and clipped by its `overflow: hidden`. Roomy again by the
      // time the column can afford it.
      :deep(.player-tile) {
        gap: 1rem;
        padding: 0 1.2rem;

        @media screen and (min-width: $laptop) {
          gap: 2rem;
          padding: 0 2rem;
        }
      }
    }
  }
  .game-controls {
    justify-content: flex-end;
  }
}

// Phone overrides land LAST on purpose: the base `.game-controls` and
// `.player-lobby` rules are declared after the earlier media blocks, and at
// equal specificity the later declaration wins.
@media screen and (max-width: $tablet) {
  .game-controls {
    gap: 0.8rem;
    flex-flow: row nowrap;
    align-items: stretch;
    justify-content: flex-start;

    // Share the track evenly rather than sizing to label length — two buttons
    // of different widths read as a primary and an afterthought.
    :deep(.button) {
      flex: 1 1 0;
      min-width: 0;
      margin-left: 0;
      justify-content: center;
    }
  }
}

// "Copy Invite Link" + "Start Game" need ~37rem side by side. Below that the
// pair trades its phrases for "Invite" / "Start" and stays on ONE row — which
// is where the two want to be, since they are one decision. Only when even
// the short pair is cramped do they stack, invite first.
@container game-controls (max-width: 37rem) {
  .game-controls .text.long {
    display: none;
  }
  .game-controls .text.short {
    display: inline;
  }
}

@container game-controls (max-width: 21rem) {
  .game-controls {
    flex-flow: column nowrap;
  }
  .game-controls :deep(.button) {
    width: 100%;
  }
}
</style>
