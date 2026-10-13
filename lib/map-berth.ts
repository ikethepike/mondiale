import type { useGameStore } from '~~/store/game.store'

type GameStore = ReturnType<typeof useGameStore>

/** Gap left above a reserved element so the subject never touches its edge. */
export const BERTH_GAP_PX = 12

/**
 * Share of the layout height (or width) a reservation may claim. The camera ignores any
 * berth leaving a band under 35% (berthMetrics in GameMap.vue) — capping at
 * 60% keeps a 40% band, so the reservation can never be silently dropped
 * exactly when the subject most needs lifting. Move one, check the other.
 */
export const BERTH_CAP_FRACTION = 0.6

export type Berth = { top?: number; bottom?: number; left?: number; right?: number }

const reserves = (berth?: Berth) => !!(berth?.top || berth?.bottom || berth?.left || berth?.right)

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

  const edges = { top: 0, bottom: 0, left: 0, right: 0 }
  for (const claim of claims.values()) {
    for (const edge of Object.keys(edges) as (keyof Berth)[]) {
      edges[edge] = Math.max(edges[edge], claim[edge] ?? 0)
    }
  }

  // Cap the combined reservation, not each claim: two modest claims can
  // still add up past the camera's band guard.
  const fit = (a: number, b: number, extent: number) => {
    const cap = Math.round(extent * BERTH_CAP_FRACTION)
    const scale = a + b > cap ? cap / (a + b) : 1
    return [Math.round(a * scale), Math.round(b * scale)] as const
  }
  const root = document.documentElement
  const [top, bottom] = fit(edges.top, edges.bottom, root.clientHeight)
  const [left, right] = fit(edges.left, edges.right, root.clientWidth)
  const scaled = { top, bottom, left, right }

  gameStore.map.berth = reserves(scaled) ? scaled : undefined
}

/** Register or update a claim. Passing `undefined` releases it. */
export const claimMapBerth = (gameStore: GameStore, key: string, berth: Berth | undefined) => {
  if (reserves(berth)) claims.set(key, berth!)
  else claims.delete(key)
  applyClaims(gameStore)
}

/** Drop every claim — for clearBoard's hard reset, which owns the slot directly. */
export const releaseAllMapBerths = () => claims.clear()
