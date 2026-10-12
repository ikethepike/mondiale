import { seatSubject } from '~~/lib/seat-transitions'
import {
  oddOneOut,
  type FinalChallengeAnswer,
  type FinalChallengeItem,
} from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { PlayerMove, Tile } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { drawLabel, setDrawSource } from './draws'
import type { Player } from '~~/types/player.type'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

/**
 * Test scaffolding only — never imported by runtime code. A seat posed on any
 * step with a well-formed cursor, the way the suites build tables without
 * playing them up to that point.
 */
export const testCursor = (
  step: SeatStep,
  extra: Partial<Omit<SeatCursor, 'step'>> = {}
): SeatCursor => {
  const roundIndex = 0
  const walk = extra.walk ?? 1
  const subjects: Record<SeatStep, string> = {
    lobby: seatSubject.lobby(),
    tutorial: seatSubject.tutorial(),
    round: seatSubject.round(roundIndex),
    'round-verdict': seatSubject.round(roundIndex),
    scores: seatSubject.scores(roundIndex),
    walk: seatSubject.walk(walk, 0),
    arrive: seatSubject.gate(walk, 0),
    gate: seatSubject.gate(walk, 0),
    'gate-verdict': seatSubject.gate(walk, 0),
    final: seatSubject.final(walk, 0),
    'final-verdict': seatSubject.final(walk, 0),
    settled: seatSubject.settled(roundIndex),
    victory: seatSubject.victory(),
    kicked: seatSubject.kicked(),
  }
  return {
    seq: 1,
    step,
    subject: subjects[step],
    enteredAt: Date.now(),
    cause: 'test',
    walk,
    leg: 0,
    ...extra,
  }
}

export const testSeat = (
  id: string,
  step: SeatStep = 'round',
  overrides: Partial<Player> = {}
): Player => ({
  id,
  name: id,
  ready: true,
  color: 'blue' as Player['color'],
  cursor: testCursor(step),
  moves: [],
  currentPosition: 0,
  ...overrides,
})

/**
 * Scripted draws for a suite: a seat's moveset, the next round, a gauntlet
 * replacement. A script that returns undefined lets the real dealer draw.
 */
export const scriptDraws = (script: {
  moves?: (seatId: string) => PlayerMove[] | undefined
  round?: () => RoundChallenge | undefined
  finalReplacement?: () => FinalChallengeItem | null | undefined
}) =>
  setDrawSource(label => {
    const value = label.startsWith('moves:')
      ? script.moves?.(label.slice('moves:'.length))
      : label === drawLabel.round()
        ? script.round?.()
        : label === drawLabel.finalReplacement()
          ? script.finalReplacement?.()
          : undefined
    return value === undefined ? undefined : { value }
  })

const testTile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })

const testGate = (challenge: Partial<IndividualChallenge>, at = 6): PlayerMove => ({
  endTile: testTile(at, 'isoCode'),
  challenge: { _type: 'individual-challenge', id: 'isoCode', ...challenge } as IndividualChallenge,
})

export const testGauntlet = (challenges: FinalChallengeItem[], at = 20): PlayerMove => ({
  endTile: testTile(at, 'final'),
  challenge: {
    _type: 'final-challenge',
    difficulty: 'normal',
    challenges,
    lives: 1,
    totalCount: challenges.length,
    answeredCorrect: 0,
  },
})

/** A gate whose prompt is its own answer, so the wire carries it whole. */
export const FLAG_PICK_GATE = testGate({
  id: 'flag',
  variant: 'flag-pick',
  country: 'FI',
  options: ['FI', 'SE', 'IS', 'NO'],
})

/** One gate of every variant whose answer the wire withholds until the
 *  verdict, the keys it must withhold, and the answer that passes it. */
export const WITHHELD_GATES = [
  {
    name: 'odd-one-out',
    keys: ['country'],
    answer: 'NO',
    move: testGate({
      variant: 'odd-one-out',
      country: 'NO',
      oddOneOut: {
        countries: ['SE', 'NO', 'DK', 'FI'],
        propertyLabel: 'Three of these are in the European Union',
        kind: 'organization',
        value: 'European Union',
      },
    }),
  },
  {
    name: 'rosetta',
    keys: ['country'],
    answer: 'PE',
    move: testGate({
      id: 'lexicon',
      variant: 'rosetta',
      country: 'PE',
      rosetta: {
        relation: 'capital',
        exemplar: { term: 'Stockholm', isoCode: 'SE' },
        term: 'Lima',
        relationLabel: 'its capital',
      } as IndividualChallenge['rosetta'],
    }),
  },
  {
    name: 'rulers',
    keys: ['country'],
    answer: 'DK',
    move: testGate({
      id: 'government.parties',
      variant: 'rulers',
      country: 'DK',
      rulers: {
        lineup: ['SE', 'DK', 'NO'],
        logos: { SE: '/parties/SE-1.webp', DK: '/parties/DK-2.webp', NO: '/parties/NO-3.webp' },
        names: { SE: 'Moderaterna', DK: 'Venstre', NO: 'Arbeiderpartiet' },
        trueLogo: { DK: '/parties/DK-1.webp' },
        trueName: { DK: 'Socialdemokratiet' },
        trueRatio: { DK: 1 },
        impostor: { name: 'Venstre' },
        governing: { name: 'Socialdemokratiet' },
      },
    }),
  },
] as const satisfies readonly {
  name: string
  keys: readonly (keyof IndividualChallenge)[]
  answer: ISOCountryCode
  move: PlayerMove
}[]

const MIN_QUESTION: FinalChallengeItem = {
  _type: 'min-challenge',
  accessorId: 'people.population',
  country: 'VA',
  hints: ['VA', 'TV', 'NR', 'PW', 'SM'],
}

/** `WITHHELD_GATES` for the gauntlet's questions. */
export const WITHHELD_FINALS = [
  { name: 'min', keys: ['country', 'hints'], item: MIN_QUESTION },
  {
    name: 'max',
    keys: ['country', 'hints'],
    item: { ...MIN_QUESTION, _type: 'max-challenge', country: 'CN' },
  },
  {
    name: 'membership',
    keys: ['exception'],
    item: {
      _type: 'membership-challenge',
      exception: 'NO',
      organization: 'eu',
      lineup: ['SE', 'NO', 'DK', 'FI'],
    },
  },
  {
    name: 'treaty',
    keys: ['holdout', 'standing'],
    item: {
      _type: 'treaty-challenge',
      treaty: 'rome-statute',
      holdout: 'US',
      standing: 'absent',
      lineup: ['US', 'CA', 'MX'],
    },
  },
] as const satisfies readonly { name: string; keys: readonly string[]; item: FinalChallengeItem }[]

/** What a gauntlet question's `submittedAnswer` is when it passes. */
export const passingFinalAnswer = (item: FinalChallengeItem): FinalChallengeAnswer => {
  switch (item._type) {
    case 'min-challenge':
    case 'max-challenge':
      return { _type: item._type, isoCode: item.country }
    case 'membership-challenge':
    case 'treaty-challenge':
      return { _type: item._type, isoCode: oddOneOut(item) }
    default:
      throw new TypeError(`No passing answer scripted for ${item._type}`)
  }
}
