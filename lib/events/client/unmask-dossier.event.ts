import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { unmaskDossierKey } from '~~/lib/unmask-pace'

/** Unmask: this seat's dossier, delivered to this socket alone (no `game`
 *  payload — the subject and the unreached rungs never ride a snapshot). A
 *  reply that lost a race to a fuller one never shrinks the file. */
export const unmaskDossierEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'unmask-dossier' || !gameStore.game) return
  const { event: _event, ...dossier } = payload
  const key = unmaskDossierKey(gameStore.game.id, dossier.round)
  const held = gameStore.unmaskDossiers[key]
  if (held && (held.reveal || held.clues.length > dossier.clues.length) && !dossier.reveal) return
  gameStore.unmaskDossiers = { ...gameStore.unmaskDossiers, [key]: dossier }
}
