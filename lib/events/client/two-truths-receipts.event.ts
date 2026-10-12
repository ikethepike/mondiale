import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { twoTruthsReceiptKey } from '~~/lib/two-truths'

/** Two Truths: card receipts and the table's sheets for this socket alone,
 *  merged — a bought reveal lands one card, the graded sheet the rest. */
export const twoTruthsReceiptsEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'two-truths-receipts' || !gameStore.game) return
  const key = twoTruthsReceiptKey(gameStore.game.id, payload.round)
  const held = gameStore.twoTruthsReceipts[key]
  const receipts = { ...held?.receipts }
  for (const receipt of payload.receipts) receipts[receipt.index] = receipt
  gameStore.twoTruthsReceipts = {
    ...gameStore.twoTruthsReceipts,
    [key]: { receipts, sheets: { ...held?.sheets, ...payload.sheets } },
  }
}
