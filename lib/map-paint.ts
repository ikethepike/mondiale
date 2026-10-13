import type { useGameStore } from '~~/store/game.store'
import type { CountryColorGrouping } from '~~/types/map.type'

type MapState = ReturnType<typeof useGameStore>['map']

/** The map's list channels a painter may rewrite every snapshot. */
export type MapListKey =
  'focus' | 'ringed' | 'seaGlow' | 'pulsing' | 'landRoutes' | 'seaLinks' | 'hopLinks'

/** Replace a map list only when its contents changed — same-content writes
 *  retarget the camera tween and churn every watcher downstream. */
export const writeMapList = (map: MapState, key: MapListKey, next: readonly string[]): void => {
  if (map[key].join('|') !== next.join('|')) map[key] = [...next] as never
}

/** A groupings writer that skips same-content repaints. One per painter: it
 *  remembers what that painter last wrote. */
export const createGroupingsWriter = (map: MapState) => {
  let painted = ''
  return (groupings: CountryColorGrouping[] | undefined): void => {
    const key =
      groupings?.map(group => `${group.color}:${group.countries.join(',')}`).join('|') ?? ''
    if (key === painted && (groupings === undefined) === (map.countryGroupings === undefined))
      return
    painted = key
    map.countryGroupings = groupings
  }
}
