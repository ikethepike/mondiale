import { COUNTRIES } from '~~/data/countries.gen'
import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler, enqueueGameTask } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitFinalChallengeAnswerHandler = defineGameHandler(
  'submit-final-challenge-answer',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    const currentMove = player.moves[0]
    if (!currentMove) {
      return console.warn(`Unable to retrieve current challenge`)
    }

    if (currentMove.challenge?._type !== 'final-challenge') {
      throw new TypeError(`Individual challenge found in final challenge handler`)
    }

    // Verify against the head question without consuming it — a thrown type
    // mismatch must not eat a question the player never really answered
    const currentChallenge = currentMove.challenge.challenges[0]
    if (!currentChallenge) {
      return console.warn(`Final challenge submitted with no questions left`)
    }

    const { submittedAnswer } = eventData

    const throwTypeMismatch = () => {
      throw new TypeError(
        `Challenge type mismatch: ${submittedAnswer._type || currentChallenge._type}`
      )
    }

    let correct = false
    switch (currentChallenge._type) {
      case 'region-challenge':
        {
          if (submittedAnswer._type !== 'region-challenge') {
            return throwTypeMismatch()
          }

          const correctRegion = COUNTRIES[currentChallenge.country].region
          correct = correctRegion === submittedAnswer.region
        }
        break
      case 'max-challenge':
      case 'min-challenge':
      case 'leadership-challenge':
        {
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          const { isoCode } = submittedAnswer
          correct = currentChallenge.country === isoCode
        }
        break
      case 'language-challenge':
        {
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          const submittedCountry = COUNTRIES[submittedAnswer.isoCode]
          correct = submittedCountry.languages.some(language => {
            return language === currentChallenge.language
          })
        }
        break
      case 'membership-challenge':
        {
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          correct = submittedAnswer.isoCode === currentChallenge.exception
        }
        break
    }

    console.log({ currentChallenge, correct })

    // Wrong answer knocks the player out of the gauntlet. The result pause
    // runs OUTSIDE the per-game queue — holding the lock for five seconds
    // would stall every other player — and the follow-up re-enters through
    // the queue with a fresh game fetch.
    if (!correct) {
      player.moves = []
      await server.updateGameState(game)
      setTimeout(() => {
        enqueueGameTask(eventTarget.gameId, () =>
          enterMovementPhaseHandler({
            io,
            redis,
            socket,
            eventTarget,
            eventKey: 'enter-movement-phase',
            eventData: { event: 'enter-movement-phase' },
          })
        )
      }, 5000)
      return
    }

    // Correct: the question is now consumed
    currentMove.challenge.challenges.shift()

    // Let the player bask in glory
    if (currentMove.challenge.challenges.length === 0) {
      player.phase = 'victory'
      player.completedAtRound = game.rounds.length
    }

    await server.updateGameState(game)

    // Pace the reveal: the client shows its own result beat first; the next
    // question (or victory) lands after it, again without holding the queue
    setTimeout(() => {
      server.emit({ event: 'final-challenge-checked', game }, eventTarget)
    }, 5000)
  },
  { player: 'warn' }
)
