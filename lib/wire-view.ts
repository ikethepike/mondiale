import { VERDICT_STEPS } from '~~/lib/seat-transitions'
import { seatViewFamily } from '~~/lib/seat-view'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type {
  IndividualChallenge,
  IndividualChallengeVariant,
} from '~~/types/challenges/individual-challenge.type'
import type { Game, PlayerMove, SealedChallenge } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The answer keys a dealt question carries that its prompt never renders,
 * withheld from the wire until the seat's verdict on that question. A variant
 * missing here draws its prompt from its answer (a flag, an outline, a photo
 * filed under its country), so its key IS the question and rides as dealt.
 */
const GATE_ANSWER_KEYS: Partial<Record<IndividualChallengeVariant, (keyof IndividualChallenge)[]>> =
  {
    'odd-one-out': ['country'],
    rosetta: ['country'],
    'landmark-quiz': ['country', 'landmarkSlug'],
    rulers: ['country'],
  }
const RULERS_ANSWER_KEYS: (keyof NonNullable<IndividualChallenge['rulers']>)[] = [
  'trueLogo',
  'trueName',
  'trueRatio',
  'impostor',
  'governing',
]
const FINAL_ANSWER_KEYS: {
  [K in FinalChallengeItem['_type']]?: (keyof Extract<FinalChallengeItem, { _type: K }>)[]
} = {
  'min-challenge': ['country'],
  'max-challenge': ['country'],
  'membership-challenge': ['exception'],
  'treaty-challenge': ['holdout', 'standing'],
}

const gateAnswerKeys = (gate: IndividualChallenge): readonly PropertyKey[] =>
  GATE_ANSWER_KEYS[gate.variant ?? 'find'] ?? []
const finalAnswerKeys = (item: FinalChallengeItem): readonly PropertyKey[] =>
  FINAL_ANSWER_KEYS[item._type] ?? []

const without = <T extends object>(value: T, keys: readonly PropertyKey[]): T =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))) as T

/** False while the wire withholds this gate's answer: the view cannot grade a
 *  preview and waits for the server's verdict, which brings the answer. */
export const gateAnswerOnHand = (gate: IndividualChallenge): boolean =>
  gateAnswerKeys(gate).every(key => key in gate)

/** `gateAnswerOnHand` for a gauntlet question. */
export const finalAnswerOnHand = (item: FinalChallengeItem): boolean =>
  finalAnswerKeys(item).every(key => key in item)

export const gateQuestion = (gate: IndividualChallenge): IndividualChallenge => {
  const question = without(gate, gateAnswerKeys(gate))
  return question.rulers
    ? { ...question, rulers: without(question.rulers, RULERS_ANSWER_KEYS) }
    : question
}

export const finalQuestion = (item: FinalChallengeItem): FinalChallengeItem =>
  without(item, finalAnswerKeys(item))

const SEALED: SealedChallenge = { _type: 'sealed-challenge' }

const wireMove = (seat: Player, move: PlayerMove, index: number): PlayerMove => {
  const { challenge } = move
  if (!challenge || challenge._type === 'sealed-challenge') return move
  const family = challenge._type === 'final-challenge' ? 'final' : 'gate'
  const live = index === 0 && seatViewFamily(seat.cursor) === family
  const graded = VERDICT_STEPS.includes(seat.cursor.step)
  if (challenge._type === 'final-challenge') {
    const head = challenge.challenges[0]
    const shown = live && head ? [graded ? head : finalQuestion(head)] : []
    return { ...move, challenge: { ...challenge, challenges: shown } }
  }
  if (!live) return { ...move, challenge: SEALED }
  return graded ? move : { ...move, challenge: gateQuestion(challenge) }
}

/**
 * The game as every socket in the room receives it. Only the question a seat
 * is on reaches the wire — the gates further down its walk are sealed and the
 * gauntlet shows its head alone — and that question's answer keys follow it
 * only once the seat's verdict holds on it. Redis keeps the whole deal: the
 * grader, the bots, replays, the auditor and the debug routes read the saved
 * game, never this.
 */
export const wireGame = (game: Game): Game => ({
  ...game,
  players: Object.fromEntries(
    Object.entries(game.players).map(([id, seat]) => [
      id,
      seat.moves.length
        ? { ...seat, moves: seat.moves.map((move, index) => wireMove(seat, move, index)) }
        : seat,
    ])
  ),
})
