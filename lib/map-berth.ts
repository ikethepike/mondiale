import type { useGameStore } from '~~/store/game.store'

type GameStore = ReturnType<typeof useGameStore>

/** Gap left above a reserved element so the subject never touches its edge. */
export const BERTH_GAP_PX = 12

/**
 * Share of the layout height a reservation may claim. The camera ignores any
 * berth leaving a band under 35% (berthMetrics in GameMap.vue) — capping at
 * 60% keeps a 40% band, so the reservation can never be silently dropped
 * exactly when the subject most needs lifting. Move one, check the other.
 */
export const BERTH_CAP_FRACTION = 0.6

export type Berth = { top?: number; bottom?: number }

/**
 * Claims keyed by owner. `gameStore.map.berth` is a single slot, so two
 * owners writing it directly used to fight (a reveal card landing over a
 * mounted view's footer wiped whichever unmounted last). Every claim lands
 * here instead and the store gets their combined maximum.
 *
 * Lives apart from use-footer-berth.ts so clearBoard can drop claims without
 * client-side.ts and the composable importing each other in a cycle.
 */
const claims = new Map<string, Berth>()

const applyClaims = (gameStore: GameStore) => {
  if (!claims.size) {
    gameStore.map.berth = undefined
    return
  }

  let top = 0
  let bottom = 0
  for (const claim of claims.values()) {
    top = Math.max(top, claim.top ?? 0)
    bottom = Math.max(bottom, claim.bottom ?? 0)
  }

  // Cap the combined reservation, not each claim: two modest claims can
  // still add up past the camera's band guard.
  const cap = Math.round(document.documentElement.clientHeight * BERTH_CAP_FRACTION)
  const scale = top + bottom > cap ? cap / (top + bottom) : 1
  const scaled = { top: Math.round(top * scale), bottom: Math.round(bottom * scale) }

  gameStore.map.berth = scaled.top || scaled.bottom ? scaled : undefined
}

/** Register or update a claim. Passing `undefined` releases it. */
export const claimMapBerth = (gameStore: GameStore, key: string, berth: Berth | undefined) => {
  if (berth?.top || berth?.bottom) claims.set(key, berth)
  else claims.delete(key)
  applyClaims(gameStore)
}

/** Drop every claim — for clearBoard's hard reset, which owns the slot directly. */
export const releaseAllMapBerths = () => claims.clear()
