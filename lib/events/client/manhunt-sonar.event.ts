import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/** Manhunt: one detective's own sonar readings, over a single-socket emit —
 *  a reading never rides a snapshot, or the whole table would share it. */
export const manhuntSonarEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'manhunt-sonar') return
  gameStore.manhuntReadings = { readings: payload.readings, turn: payload.turn }
}
