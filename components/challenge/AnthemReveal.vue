<template>
  <span class="ranked-bars anthem-reveal">
    <!-- One dossier: who it was, what the anthem is, its words, and the clip.
         These four were separate stacked blocks and read as a list of
         unrelated facts; together they are a single record of the answer. -->
    <span class="dossier">
      <span class="dossier-head">
        <span class="identity">
          <strong class="subject">{{ subject }}</strong>
          <span class="subtitle">{{ subtitle }}</span>
        </span>

        <!-- Play belongs to the anthem, so it sits on the title row. -->
        <button
          v-if="replayClip"
          type="button"
          class="replay"
          :class="{ playing: replaying }"
          :aria-label="replaying ? 'Playing the anthem' : 'Hear the anthem again'"
          @click="replay"
        >
          <span v-if="buffering" class="replay-spinner" />
          <svg v-else class="replay-icon" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="replaying">
              <rect x="7" y="5" width="3.4" height="14" rx="1.1" />
              <rect x="13.6" y="5" width="3.4" height="14" rx="1.1" />
            </template>
            <path v-else d="M8 5.5v13l11-6.5z" />
          </svg>
        </button>

        <!-- The language switch belongs to the WORDS, so it spans its own row
             directly above them — at every width, rather than only on phones. -->
        <span v-if="couplet.length" class="column-switch" role="group" aria-label="Lyric language">
          <button
            type="button"
            class="column-card"
            :class="{ active: !showEnglish }"
            :aria-pressed="!showEnglish"
            :title="`Show the ${lyricsLanguage} words`"
            @click="showEnglish = false"
          >
            <CountryFlag v-if="flagCountry" class="column-flag" :country="flagCountry" />
            <span class="column-label">{{ lyricsLanguage }}</span>
          </button>

          <button
            type="button"
            class="column-card"
            :class="{ active: showEnglish }"
            :aria-pressed="showEnglish"
            title="Show the English translation"
            @click="showEnglish = true"
          >
            <svg class="column-globe" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <ellipse cx="12" cy="12" rx="4" ry="9" />
              <path d="M3.2 9h17.6M3.2 15h17.6" />
            </svg>
            <span class="column-label">English</span>
          </button>
        </span>
      </span>

      <audio v-if="replayClip" ref="element" preload="none" @ended="replaying = false">
        <source :src="replayClip.webm" type="audio/webm" />
        <source :src="replayClip.m4a" type="audio/mp4" />
      </audio>

      <!-- The opening couplet, with a toggle between the anthem's own words and
           their translation. Keeps the wall's payoff on a surface people linger
           on, rather than losing it when the round hands over. -->
      <span v-if="couplet.length" class="couplet-block">
        <span class="couplet" :lang="showEnglish ? 'en' : lyrics?.language.code">
          <span v-for="(line, index) in couplet" :key="index" class="couplet-line">{{ line }}</span>
        </span>

        <!-- Only the original expands. Its words are an old state text, free to
             print in full; the translation stays a short quotation. -->
        <button
          v-if="expandable"
          type="button"
          class="couplet-more"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Show less' : 'Show more' }}
        </button>
      </span>

      <!-- Provenance behind an ⓘ rather than a caption: the recording, the
           lyric text and its translation each come from somewhere different,
           which is more than a single line can carry honestly. -->
      <span v-if="sources.length" class="credit-row">
        <SourceInfo :attributions="sources" :item-credit="credit" label="Sources" />
        <span class="credit">{{ sources[0].credit }}</span>
      </span>
    </span>

    <span class="eyebrow race-caption">Buzz race</span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.playerId"
        class="row player-accent"
        :class="{ missed: !row.buzzed, mine: row.playerId === myPlayerId }"
        :style="{ '--i': index, '--player-color': row.colour }"
      >
        <span class="name">{{ row.name }}</span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.share}%` }" />
        </span>
        <span class="tail">{{ row.tail }}</span>
      </span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { getCountry } from '~~/lib/country'
import { buzzFraction } from '~~/lib/scoring'
import { formatCompact } from '~~/lib/number'
import { seatLabel } from '~~/lib/player'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'
import type { Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The audio rounds' scorecard: what the clip was, plus the race that decided
 * the points. The bar length IS `buzzFraction` at each player's buzz — the
 * same curve that paid them — so the decay is visible rather than asserted.
 *
 * Renders inside ChallengeResult's <p class="lesson">, so every element here
 * is a span. Geometry and the row stagger come from templates/_ranked-bars.scss.
 */
const props = defineProps<{
  /** The answer: a country name, or the language. */
  subject: string
  subtitle: string
  credit?: string
  replayClip?: { webm: string; m4a: string }
  /** The curated wall, when this anthem has one — the scorecard shows an
   *  opening couplet with a toggle between the two columns. */
  lyrics?: AnthemLyrics
  round: Round
  players: { [playerId: string]: Player }
  myPlayerId?: string
}>()

/** Which column the couplet is showing. Starts local: the round has just
 *  finished translating, so the original is the fresher half to land on. */
const showEnglish = ref(false)

/**
 * Everything behind this card, resolved through the shared registry rather than
 * assembled here: the recording and the lyric text come from different places,
 * so the panel lists both instead of one line pretending to cover them.
 */
const sources = computed(() => [
  ...datasetAttribution('anthems'),
  ...(props.lyrics ? datasetAttribution('anthem-lyrics') : []),
])

/** The language's own name, labelling the original column. */
const lyricsLanguage = computed(() => props.lyrics?.language.name ?? 'Original')

/** The flag beside the original column. Keyed off the lyric file's own country
 *  rather than the round's, so the two can never disagree. */
const flagCountry = computed(() =>
  props.lyrics?.isoCode ? getCountry(props.lyrics.isoCode) : undefined
)

/** An opening couplet rather than the whole verse — the scorecard is a summary,
 *  and the full wall already had its moment during the round. */
const COUPLET_LINES = 2

const expanded = ref(false)

/** Collapse again whenever the column switches, so the card never opens on one
 *  language and silently stays open on the other. */
watch(showEnglish, () => (expanded.value = false))

/**
 * Expanding shows the anthem's own words in full — those are old state texts,
 * free to reproduce. The English column stays a short quotation: translations
 * are separately authored works, and printing them whole is a different act
 * from quoting a couplet.
 */
const expandable = computed(
  () => !showEnglish.value && (props.lyrics?.verses.flatMap(v => v.local).length ?? 0) > COUPLET_LINES
)

const couplet = computed(() => {
  const verses = props.lyrics?.verses ?? []
  if (!verses.length) return []

  const column = showEnglish.value
    ? verses[0].english
    : expanded.value
      ? verses.flatMap(verse => verse.local)
      : verses[0].local

  // Masks are a round-time device; by the scorecard the answer is known, so the
  // markup is simply unwrapped.
  return (expanded.value && !showEnglish.value ? column : column.slice(0, COUPLET_LINES))
    .map(line => line.replace(/\[\[(.+?)\]\]/g, '$1'))
    .filter(line => line.trim())
})

const element = ref<HTMLAudioElement>()
const replaying = ref(false)

/** Waiting on bytes. The clip is `preload="none"` — the scorecard should not
 *  pull audio nobody asked for — so the first press may have to fetch it. */
const buffering = ref(false)

/**
 * Toggle the clip. Genuinely pauses rather than restarting, and loads on demand
 * when the media has not been fetched yet: the round's own copy is usually warm
 * in cache, but a spectator opening a scorecard cold has never touched it.
 */
const replay = async () => {
  const audio = element.value
  if (!audio) return

  if (replaying.value) {
    audio.pause()
    replaying.value = false
    return
  }

  // readyState 0 means nothing is buffered — kick off the fetch and show it.
  if (audio.readyState === 0) {
    buffering.value = true
    audio.load()
  }
  // A finished clip starts over; a paused one resumes where it stopped.
  if (audio.ended) audio.currentTime = 0

  await audio.play().then(
    () => {
      replaying.value = true
      buffering.value = false
    },
    () => {
      replaying.value = false
      buffering.value = false
    }
  )
}

const rows = computed(() => {
  const entries = Object.entries(props.players).map(([playerId, player]: [string, Player]) => {
    const answer = props.round.groupAnswers[playerId]
    const points = props.round.playerTurns[playerId]?.points
    const buzzed = typeof answer?.buzzAt === 'number'
    const scored = points?.scored ?? 0

    return {
      playerId,
      name: seatLabel(props.players, playerId, props.myPlayerId),
      colour: player.color,
      buzzed,
      buzzAt: answer?.buzzAt ?? 0,
      scored,
      // A buzz's bar is the fraction of the pot its timing earned; a miss is
      // an empty track, not a zero-width bar with no story.
      share: buzzed ? Math.round(buzzFraction(answer?.buzzAt ?? 0) * 100) : 0,
      tail: buzzed ? `${formatCompact(scored)} pts` : 'missed',
    }
  })

  // Earliest buzz first (most clock left), non-buzzers last.
  return entries.sort((a, b) => {
    if (a.buzzed !== b.buzzed) return a.buzzed ? -1 : 1
    return b.buzzAt - a.buzzAt
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
// One card holding the whole answer: country, anthem, its words and the clip.
.dossier {
  gap: 0.9rem;
  display: flex;
  padding: 1rem 1.2rem;
  border-radius: 0.9rem;
  flex-flow: column nowrap;
  background: #{ink(0.04)};
}

// The play button belongs to the ANTHEM, so it sits on the title row where the
// anthem is named. The language switch belongs to the words, so it sits with
// them. A three-area grid keeps both true at every width.
.dossier-head {
  gap: 0.5rem 1rem;
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'identity play'
    'switch   switch';
}

// Phone: the switch collapses to bare symbols and rides up onto the title row
// beside play, so the words below get the full width instead of sharing it
// with two labelled pills.
@media screen and (max-width: 480px) {
  .dossier-head {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas: 'identity switch play';
  }
}

// Sits under the flags rather than beside them, so a long language name never
// squeezes the pair.
.column-switch {
  gap: 0.5rem;
  display: flex;
  flex-flow: row wrap;
  grid-area: switch;
}

.identity {
  gap: 0.2rem;
  display: flex;
  min-width: 0;
  grid-area: identity;
  flex-flow: column nowrap;
}

.subject {
  font-size: 1.8rem;
  line-height: 1.2;
}

.subtitle,
// A genuine footnote: the provenance matters but must not read at the same
// weight as the anthem's own title. The ⓘ carries the detail; the line beside
// it names the primary source so the card still credits at a glance.
.credit-row {
  gap: 0.3rem;
  display: flex;
  margin-left: -0.4rem;
  align-items: center;
}

.credit {
  min-width: 0;
  font-size: 1.05rem;
  line-height: 1.4;
  color: #{ink(0.45)};
}

// The couplet is a quotation inside the dossier — a left rule sets it apart
// from the identity above without becoming a second card.
// Expanded verses scroll inside the card rather than pushing the buzz race off
// the bottom — anthems run from five lines to ninety-five.
.couplet {
  max-height: 24rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.couplet-more {
  border: 0;
  padding: 0;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 600;
  font-family: inherit;
  align-self: flex-start;
  background: transparent;
  color: var(--soft-blue);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.couplet-block {
  gap: 0.6rem;
  display: flex;
  padding-left: 1rem;
  flex-flow: column nowrap;
  border-left: 0.2rem solid #{ink(0.16)};
}

// Two small cards under the lines, left-aligned with them, so the eye reads
// the quotation first and the control second.
.column-card {
  gap: 0.45rem;
  display: flex;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 1.15rem;
  font-weight: 600;
  align-items: center;
  font-family: inherit;
  border-radius: 0.5rem;
  color: var(--soft-blue);
  background: transparent;
  border: 0.1rem solid #{ink(0.16)};
  transition:
    border-color var(--motion-quick) var(--ease-smooth),
    background var(--motion-quick) var(--ease-smooth);

  &.active {
    color: #{milk()};
    background: #{ink()};
    border-color: #{ink()};
  }

  @media (hover: hover) {
    &:hover:not(.active) {
      border-color: #{ink(0.4)};
    }
  }
}

// The flag keeps its own aspect; the globe is drawn to match its weight.
.column-flag {
  width: 1.5rem;
  height: 1.1rem;
  flex-shrink: 0;
  border-radius: 0.15rem;
}

.column-globe {
  width: 1.2rem;
  height: 1.2rem;
  fill: none;
  flex-shrink: 0;
  stroke: currentcolor;
  stroke-width: 1.6;
}

.column-label {
  white-space: nowrap;
}

// Phone: symbols only. The flag and the globe already say which is which, and
// each button keeps its title/aria-pressed, so the meaning survives for screen
// readers and long-press alike.
@media screen and (max-width: 480px) {
  .column-label {
    position: absolute;
    width: 0.1rem;
    height: 0.1rem;
    overflow: hidden;
    white-space: nowrap;
    clip-path: inset(50%);
  }

  // Icon-only still has to be tappable. The reset sets 62.5%, so 1rem is 10px
  // here — 4.4rem is the 44px minimum a thumb needs, not 2.6.
  .column-card {
    width: 4.4rem;
    height: 4.4rem;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .column-flag,
  .column-globe {
    width: 1.6rem;
    height: 1.2rem;
  }

  .column-globe {
    width: 1.4rem;
    height: 1.4rem;
  }
}

.couplet-toggle {
  border: 0;
  padding: 0;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 600;
  font-family: inherit;
  background: transparent;
  color: var(--soft-blue);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.couplet {
  gap: 0.2rem;
  display: flex;
  font-size: 1.4rem;
  line-height: 1.45;
  font-style: italic;
  flex-flow: column nowrap;
  color: #{ink(0.72)};
}

.couplet-line {
  display: block;
}

// A round icon button rather than a labelled pill: the card already says what
// it is, so the control only has to say "play".
.replay {
  border: 0;
  width: 3.4rem;
  height: 3.4rem;
  padding: 0;
  display: grid;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 50%;
  place-items: center;
  background: #{ink()};
  transition: transform var(--motion-quick) var(--ease-out-expressive);

  &:active {
    transform: scale(0.94);
  }

  &.playing {
    background: #{flame()};
  }
}

.replay-icon {
  width: 1.5rem;
  height: 1.5rem;
  fill: #{milk()};
}

// Shown while the clip fetches: preload is "none", so a cold scorecard has no
// bytes until the first press.
.replay-spinner {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  border: 0.2rem solid #{milk(0.35)};
  border-top-color: #{milk()};
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.race-caption {
  margin-top: 0.4rem;
}

// The row wears .player-accent, whose colour edge is a border with no padding
// of its own — without this the name sits flush against the player's colour.
// The right inset is ours too: _ranked-bars.scss drops the shell's horizontal
// padding under 480px, which would otherwise run the points to the card edge.
.row {
  padding-left: 0.8rem;
  padding-right: 0.6rem;
}

.name {
  min-width: 6rem;
  font-weight: 600;
  // Long names shrink rather than shove the bar and points off the row.
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tail {
  // "missed" is wider than "28 pts"; reserve for the longest so the right edge
  // stays flush and nothing clips off the card.
  min-width: 4.5rem;
  text-align: right;
}

// The skin owns the fill colour; the template owns its geometry. Each bar is
// the share of the pot that player's timing earned, so the buzz curve is
// legible at a glance rather than implied by the numbers.
.bar .fill {
  background: var(--soft-blue);
}

.mine .bar .fill {
  background: #{flame()};
}

.missed .bar {
  opacity: 0.5;
}

.tail {
  font-variant-numeric: tabular-nums;
}

.missed {
  opacity: 0.55;
}

.mine .name {
  color: #{flame()};
}
</style>
