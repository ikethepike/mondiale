import { PLACES } from '~~/data/places.gen'
import type { GameDifficulty } from '~~/types/game.types'
import { isFameDealable, type Fame } from '~~/types/fame.types'
import type { CuratedPlace, HeritagePlace, PlaceEntry } from '~~/types/places.types'

/**
 * Reading the one place roster.
 *
 * `PLACES` is a flat slug map holding both facets (see `PlaceEntry`); a mode
 * that means "a curated landmark" or "a World Heritage site" says so through
 * one of the selectors here rather than filtering the map itself, so the two
 * rosters can never drift back apart into private definitions.
 */

export const isCurated = (place: PlaceEntry): place is CuratedPlace => !!place.curated
export const isHeritage = (place: PlaceEntry): place is HeritagePlace =>
  !!place.unesco && !!place.coordinates

/** Pools under this many candidates widen back to the whole pool — a
 *  difficulty gate must never leave a mode with nothing to deal. */
const MINIMUM_POOL = 8

/**
 * The difficulty's slice of a pool, by the recognisability tier the generator
 * stamped on each entry's facet.
 *
 * This used to count position within the country at deal time, which made the
 * gate an implicit property of array order that the generator's resurrection
 * merge could scramble. The tiers are the ones every curated roster uses
 * (`FAME_BY_DIFFICULTY`), so a difficulty means one thing across the game.
 */
export const famousPlaces = <T>(
  pool: [string, T][],
  difficulty: GameDifficulty,
  fameOf: (place: T) => Fame
): [string, T][] => {
  const famous = pool.filter(([, place]) => isFameDealable(fameOf(place), difficulty))
  return famous.length >= MINIMUM_POOL ? famous : pool
}

/** Every hand-curated landmark, in roster order. */
export const curatedPlaces = (): [string, CuratedPlace][] =>
  Object.entries(PLACES).filter((entry): entry is [string, CuratedPlace] => isCurated(entry[1]))

/** Every World Heritage site, in roster order. */
export const heritagePlaces = (): [string, HeritagePlace][] =>
  Object.entries(PLACES).filter((entry): entry is [string, HeritagePlace] => isHeritage(entry[1]))

/** Curated landmarks this difficulty may deal. */
export const dealableLandmarks = (difficulty: GameDifficulty): [string, CuratedPlace][] =>
  famousPlaces(curatedPlaces(), difficulty, place => place.curated.fame)

/** World Heritage sites this difficulty may deal. */
export const dealableHeritage = (difficulty: GameDifficulty): [string, HeritagePlace][] =>
  famousPlaces(heritagePlaces(), difficulty, place => place.unesco.fame)
