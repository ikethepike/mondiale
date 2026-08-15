import type { MediaCredit } from '~~/lib/attribution'
import type { LatLng } from '~~/lib/geo'
import type { Fame } from './fame.types'
import type { ISOCountryCode } from './geography.types'

/**
 * A photographed place on Earth: a name, the country it sits in, a picture, and
 * — where the source knew it — a point.
 *
 * ONE roster, `PLACES`, holds every one of them. There were two (a hand-curated
 * landmark list and a swept World Heritage register) and they stored the same
 * object twice: sixty subjects existed in both, each holding half the facts and
 * its own copy of the photo. What actually differed was never the object, only
 * how it was CHOSEN — so that is what survives, as the facets below.
 *
 * A place carries at least one facet and may carry both: Ha Long Bay is a
 * curated landmark AND a World Heritage site, and now says so in one entry
 * instead of two.
 */
export interface PlaceEntry extends MediaCredit {
  name: string
  country: ISOCountryCode
  /** Public path of the photo. One file per slug, under `/landmarks`. */
  image: string
  /** Point location (Wikidata P625), validated to fall in `country`. The
   *  pin rounds measure the distance from a map click to this. */
  coordinates?: LatLng
  description?: string
  /** Present when the place is on the hand-curated roster (landmark-seeds). */
  curated?: CuratedFacet
  /** Present when the place is on the UNESCO World Heritage register. */
  unesco?: UnescoFacet
}

/**
 * Why a facet carries its own `fame` rather than the place carrying one:
 * recognisability here is ranked WITHIN a country, because both rosters are
 * capped per country and the modes deal at most one place per country per
 * round. "France's best-known landmark" and "France's best-known World Heritage
 * site" are two different questions with two different answers, and a place
 * that is both is entitled to a different standing in each. Global
 * recognisability is the other half of the gate and is already applied to the
 * COUNTRY pool — easy only deals large, well-known countries — so the two
 * compose.
 *
 * `major` is the country's icon, `minor` its well-known second, `obscure` the
 * rest. The tiers are the ones every curated roster uses (`FAME_BY_DIFFICULTY`).
 */
export interface CuratedFacet {
  fame: Fame
  /** What sort of place it is. */
  kind: LandmarkKind
  /** City / region it is in (Wikidata P131) — a hard-mode follow-up or an
   *  educational reveal after the answer. */
  city?: string
}

export interface UnescoFacet {
  fame: Fame
  /** Year the site entered the World Heritage list (P1435's P580 qualifier). */
  inscribedYear?: number
  /** UNESCO designation, from the criteria (P2614): (i)–(vi) cultural,
   *  (vii)–(x) natural, both mixed. Deliberately NOT called `kind` — it is a
   *  different axis from `LandmarkKind`, which also has a `'natural'`, and one
   *  field name for both meanings is how the two rosters drifted. */
  designation?: HeritageDesignation
}

/** What sort of place a curated landmark is. */
export type LandmarkKind = 'natural' | 'religious' | 'ancient' | 'monument' | 'urban'

export type HeritageDesignation = 'cultural' | 'natural' | 'mixed'

export type PlaceMapping = { [slug: string]: PlaceEntry }

/** A place narrowed to one of its facets — what a roster-specific mode deals.
 *  Heritage Hunt is a pin round with no fallback prompt, so a site the sweep
 *  could not place is not a dealable site at all. */
export type CuratedPlace = PlaceEntry & { curated: CuratedFacet }
export type HeritagePlace = PlaceEntry & { unesco: UnescoFacet; coordinates: LatLng }
