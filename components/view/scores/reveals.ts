import type { Component } from 'vue'
import AnthemReveal from '~/components/challenge/AnthemReveal.vue'
import CapitalReveal from '~/components/challenge/CapitalReveal.vue'
import ConflictProfileCard from '~/components/challenge/ConflictProfileCard.vue'
import FlagMeaningReveal from '~/components/challenge/FlagMeaningReveal.vue'
import PyramidReveal from '~/components/challenge/PyramidReveal.vue'
import RankingReveal from '~/components/challenge/RankingReveal.vue'
import StarChartReveal from '~/components/challenge/StarChartReveal.vue'
import StatDetectiveReveal from '~/components/challenge/StatDetectiveReveal.vue'
import SweepRevealCard from '~/components/challenge/SweepRevealCard.vue'
import TerraRevealCard from '~/components/challenge/TerraRevealCard.vue'
import SketchOverlay from '~/components/country/SketchOverlay.vue'
import type { FlagMeaning } from '~~/data/flag-meanings.gen'
import { isChallengeOfType } from '~~/lib/rounds'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'
import type {
  RoundChallenge,
  RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { GroupChallengeAnswer, Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * Everything a scorecard reveal can be built from, once the round has settled.
 *
 * The group side's answer to `GateRevealContext` — see
 * `components/challenge/individual/dispatch.ts`, which solved this same problem
 * for the individual gates and is the shape this file follows.
 */
export interface ScorecardRevealContext {
  challenge: RoundChallenge
  /** The seat this card is about — the scorecard flips between players. */
  playerId: string
  /** Who is READING it. Only this seat is ever called "You". */
  viewerId: string
  /** That seat's banked answer. */
  answers: GroupChallengeAnswer
  /** Every seat's, for the reveals that show the whole table. */
  roundAnswers: Record<string, GroupChallengeAnswer>
  players: Record<string, Player>
  round: Round | undefined
  /** Lazily-loaded subjects the view resolves and hands down. Undefined until
   *  (or unless) their table answers, which is what keeps a half-built card
   *  off the screen. */
  flagMeaning?: FlagMeaning
  audio?: {
    subject: string
    countryCode?: string
    subtitle: string
    credit?: string
    clip?: { webm: string; m4a: string }
    lyrics?: AnthemLyrics
  }
}

export interface ScorecardReveal {
  component: Component
  /**
   * The reveal's props, or undefined when this round has nothing to show.
   *
   * `gateRevealFor`'s contract: a card whose subject never resolved must fall
   * through silently rather than mount with a hole in it. It is also what
   * keeps the lazily-loaded sections (flag meaning, water and tongue facts)
   * hidden until their table lands.
   */
  props: (context: ScorecardRevealContext) => Record<string, unknown> | undefined
  /** The small-caps label above the card. */
  eyebrow?: string
  /** `.ranking right` — restores the pane padding a ledger column needs so it
   *  does not kiss the rule. */
  padded?: boolean
  /**
   * 'replace' — this card IS the reveal, and the generic ledger/rails stand
   *   down for it. At most one per kind.
   * 'append'  — an extra section BELOW the generic ledger. Several may stack,
   *   which is why the value is a list.
   *
   * Today the distinction lives only in the ORDER of a v-if/v-else-if chain;
   * naming it is what stops a new entry from silently displacing the ledger.
   */
  mode: 'replace' | 'append'
}

/**
 * Which cards a round's scorecard shows, keyed by kind.
 *
 * Partial on purpose: most kinds reveal through the shared AnswerLedger and
 * own no bespoke card. REAL imports, like every other registry here —
 * `resolveComponent` only resolves literal names, and a dynamic name renders
 * inert elements (see REGION_MAP_COMPONENTS).
 */
export const SCORECARD_REVEALS: Partial<Record<RoundChallengeKind, ScorecardReveal[]>> = {
  sketch: [
    {
      component: SketchOverlay,
      eyebrow: 'The Reveal',
      mode: 'replace',
      props: ({ challenge, answers }) =>
        isChallengeOfType(challenge, 'sketch-challenge')
          ? { country: challenge.country, sketch: answers.sketch }
          : undefined,
    },
  ],

  // The audio pair share one card: they differ only in what the subject is,
  // and the view resolves that (a country carries a flag, a language is bare
  // text) before it reaches here.
  'anthem-buzz': [
    {
      component: AnthemReveal,
      eyebrow: 'The Reveal',
      mode: 'replace',
      props: audioRevealProps,
    },
  ],
  'tongue-buzz': [
    {
      component: AnthemReveal,
      eyebrow: 'The Reveal',
      mode: 'replace',
      props: audioRevealProps,
    },
  ],

  // The star chart's own ledger replaces the generic one: its answers are
  // CITIES scored as countries, and a row of bare flags would drop the very
  // names the round was about.
  'star-chart': [
    {
      component: StarChartReveal,
      mode: 'replace',
      props: ({ challenge, roundAnswers, players, playerId, viewerId, round }) =>
        round && isChallengeOfType(challenge, 'star-chart-challenge')
          ? { challenge, answers: roundAnswers, players, playerId, viewerId }
          : undefined,
    },
  ],

  // Terra Incognita's own ledger replaces the generic one for two reasons the
  // generic one cannot serve: its rows must stay in the order the atlas lost
  // them (an alphabetical sort throws away which loss stood open longest), and
  // each row owes the player the placement they just proved they did not have.
  'terra-incognita': [
    {
      component: TerraRevealCard,
      mode: 'replace',
      props: ({ challenge, roundAnswers, players, playerId, viewerId, round }) =>
        round && isChallengeOfType(challenge, 'terra-incognita-challenge')
          ? { challenge, answers: roundAnswers, players, playerId, viewerId }
          : undefined,
    },
  ],

  ranking: [
    {
      component: RankingReveal,
      eyebrow: 'The True Order',
      padded: true,
      mode: 'replace',
      props: ({ answers }) => ({ submitted: answers.submitted, correct: answers.correct }),
    },
  ],

  flashpoint: [
    {
      component: ConflictProfileCard,
      eyebrow: 'The Conflict Behind the Dots',
      mode: 'append',
      props: ({ challenge }) =>
        isChallengeOfType(challenge, 'flashpoint-challenge')
          ? { country: challenge.country }
          : undefined,
    },
  ],

  // Clean Sweep's table-level summary, reprised here: the ledger above is this
  // seat's story, this is the room's.
  'clean-sweep': [
    {
      component: SweepRevealCard,
      eyebrow: 'How the Board Fell',
      mode: 'append',
      props: ({ challenge, players, playerId }) =>
        isChallengeOfType(challenge, 'clean-sweep-challenge')
          ? { challenge, players, playerId }
          : undefined,
    },
  ],

  'stat-detective': [
    {
      component: StatDetectiveReveal,
      eyebrow: 'The Numbers Behind It',
      padded: true,
      mode: 'append',
      props: ({ challenge }) =>
        isChallengeOfType(challenge, 'stat-detective-challenge') ? { challenge } : undefined,
    },
  ],

  'pyramid-scheme': [
    {
      component: PyramidReveal,
      eyebrow: 'What the Shapes Were Telling You',
      mode: 'append',
      props: ({ challenge, answers }) =>
        isChallengeOfType(challenge, 'pyramid-scheme-challenge')
          ? { challenge, submitted: answers.submitted ?? [] }
          : undefined,
    },
  ],

  // Absent when the Factbook has only a visual description, and the section
  // hides with it — the props gate does that work.
  'flag-palette': [
    {
      component: FlagMeaningReveal,
      eyebrow: 'What the Flag Means',
      mode: 'append',
      props: ({ flagMeaning }) => (flagMeaning ? { entry: flagMeaning } : undefined),
    },
  ],

  'capital-guess': [
    {
      component: CapitalReveal,
      eyebrow: 'The City in the Picture',
      mode: 'append',
      props: ({ challenge }) =>
        isChallengeOfType(challenge, 'capital-guess-challenge')
          ? { country: challenge.country }
          : undefined,
    },
  ],
}

/** Both audio kinds hand AnthemReveal the same shape; the view resolves which
 *  subject it is, because only it holds the lyric fetch. */
function audioRevealProps(context: ScorecardRevealContext): Record<string, unknown> | undefined {
  const { audio, round, players, viewerId } = context
  if (!audio || !round) return undefined
  return {
    subject: audio.subject,
    countryCode: audio.countryCode,
    subtitle: audio.subtitle,
    credit: audio.credit,
    replayClip: audio.clip,
    lyrics: audio.lyrics,
    round,
    players,
    myPlayerId: viewerId,
  }
}

export interface ResolvedScorecardReveal {
  component: Component
  props: Record<string, unknown>
  eyebrow?: string
  padded: boolean
}

/**
 * The round's reveals, already filtered to the ones whose subject resolved.
 *
 * `replace` entries answer "does the generic ledger stand down?", so the two
 * lists come back separately rather than as one ordered blob the caller would
 * have to re-classify.
 */
export const scorecardRevealsFor = (
  kind: RoundChallengeKind,
  context: ScorecardRevealContext
): { replace?: ResolvedScorecardReveal; append: ResolvedScorecardReveal[] } => {
  const resolved = (SCORECARD_REVEALS[kind] ?? []).flatMap(entry => {
    const props = entry.props(context)
    if (!props) return []
    return [{ entry, resolved: { ...entry, props, padded: !!entry.padded } }]
  })

  return {
    replace: resolved.find(({ entry }) => entry.mode === 'replace')?.resolved,
    append: resolved.filter(({ entry }) => entry.mode === 'append').map(({ resolved }) => resolved),
  }
}
