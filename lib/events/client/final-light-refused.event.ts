import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/** A gauntlet stage name the server refused — the stage un-lights it. */
export const finalLightRefusedEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'final-light-refused') return
  const refused = gameStore.refusedLights[payload.subject] ?? []
  if (refused.includes(payload.name)) return
  gameStore.refusedLights = {
    ...gameStore.refusedLights,
    [payload.subject]: [...refused, payload.name],
  }
}
