import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/** Bounds the list between prune ticks, so a burst can't grow the scene. */
const MAX_ENTRIES = 6
const TTL_MS = 8000

/**
 * A table announcement arrived (the autopilot taking or returning a seat) —
 * append it to the ephemeral notice list the always-mounted NoticeToast
 * renders. Same self-expiring posture as cheers.
 */
export const tableNoticeEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'table-notice') return
  const next = [
    ...gameStore.board.notices.filter(notice => notice.at > Date.now() - TTL_MS),
    { entryId: payload.entryId, kind: payload.kind, playerId: payload.playerId, at: payload.at },
  ]
  gameStore.board.notices = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
}
