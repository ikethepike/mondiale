import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/** Bounds the list between prune ticks, so a burst can't grow the scene. */
const MAX_ENTRIES = 6
/** ONE lifetime for a notice — the handler's prune and NoticeToast's
 *  visibility filter both read it, so a notice always dies by fading,
 *  never by silently outliving its own display. */
export const TABLE_NOTICE_TTL_MS = 8000

/**
 * A table announcement arrived (the autopilot taking or returning a seat) —
 * append it to the ephemeral notice list the always-mounted NoticeToast
 * renders. Same self-expiring posture as cheers.
 */
export const tableNoticeEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'table-notice') return
  // The TTL compares against THIS clock, but `at` was stamped by the
  // server's — on a device running fast the notice would expire on arrival.
  // Clamping to local now keeps the full display window on every clock.
  const at = Math.min(payload.at, Date.now())
  const next = [
    ...gameStore.board.notices.filter(notice => notice.at > Date.now() - TABLE_NOTICE_TTL_MS),
    { entryId: payload.entryId, kind: payload.kind, playerId: payload.playerId, at },
  ]
  gameStore.board.notices = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
}
