import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { twoTruthsReceiptKey } from '~~/lib/two-truths'

/** Two Truths: card receipts for this socket alone, merged by card — a bought
 *  reveal lands one, the graded sheet the rest. */
export const twoTruthsReceiptsEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'two-truths-receipts' || !gameStore.game) return
  const key = twoTruthsReceiptKey(gameStore.game.id, payload.round)
  const merged = { ...gameStore.twoTruthsReceipts[key] }
  for (const receipt of payload.receipts) merged[receipt.index] = receipt
  gameStore.twoTruthsReceipts = { ...gameStore.twoTruthsReceipts, [key]: merged }
}
