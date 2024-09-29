import { COUNTRIES } from '~~/data/countries.gen'
import { wait } from '~~/lib/time'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { isValidISOCode } from '~~/types/geography.types'
import { useServerSideEvents } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitFinalChallengeAnswerHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'submit-final-challenge-answer') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  const player = game.players[playerId]
  if (!player) {
    return console.warn(`Unable to find player position: ${playerId}`)
  }

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
      if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
      if (!isValidISOCode(submittedAnswer.isoCode)) {
        correct = false
        break
      }

      const { isoCode } = submittedAnswer
      correct = currentChallenge.country === isoCode
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
    game.players[playerId].moves = []
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
    game.players[playerId].phase = 'victory'
    game.players[playerId].comletedAtRound = game.rounds.length
  }

  await server.updateGameState(game)
  server.emit({ event: 'final-challenge-checked', game }, eventTarget)
}
