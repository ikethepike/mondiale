import type { Component } from 'vue'
import type { GameVariant } from '~~/types/game.types'
import MapAfrica from './MapAfrica.vue'
import MapAsia from './MapAsia.vue'
import MapEurope from './MapEurope.vue'
import MapNorthAmerica from './MapNorthAmerica.vue'
import MapSouthAmerica from './MapSouthAmerica.vue'
import MapWorld from './MapWorld.vue'

/**
 * The hand-drawn region map per variant — one table, so pickers can't drift.
 * Real imports, deliberately: Nuxt's auto-import resolves only LITERAL
 * `resolveComponent('…')` names at compile time, so building this table from
 * name strings renders inert `<mapworld>` elements instead of the SVGs.
 */
export const REGION_MAP_COMPONENTS: { [variant in GameVariant]: Component } = {
  world: MapWorld,
  europe: MapEurope,
  africa: MapAfrica,
  asia: MapAsia,
  'north-america': MapNorthAmerica,
  'south-america': MapSouthAmerica,
}
