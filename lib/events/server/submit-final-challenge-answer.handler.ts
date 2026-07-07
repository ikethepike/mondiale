import { COUNTRIES } from '~~/data/countries.gen'
import { wait } from '~~/lib/time'
import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
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

    const currentChallenge = currentMove.challenge.challenges.shift()
    if (!currentChallenge) {
      return // Handle me!
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

    await wait(5000)

    // Unset player turns if incorrect
    if (!correct) {
      player.moves = []
      await server.updateGameState(game)
      return enterMovementPhaseHandler({
        io,
        redis,
        socket,
        eventTarget,
        eventKey: 'enter-movement-phase',
        eventData: { event: 'enter-movement-phase' },
      })
    }

    // Let the player bask in glory
    if (currentMove.challenge.challenges.length === 0) {
      player.phase = 'victory'
      player.completedAtRound = game.rounds.length
    }

    await server.updateGameState(game)
    server.emit({ event: 'final-challenge-checked', game }, eventTarget)
  },
  { player: 'warn' }
)
