import type { MediaCredit } from '~~/lib/attribution'
import type { LatLng } from '~~/lib/geo'
import type { Fame } from './fame.types'
import type { ISOCountryCode } from './geography.types'

/**
 * A photographed place on Earth: a name, the country it sits in, a picture, and
 * — where the source knew it — a point.
 *
 * ONE shape for every roster of them, however the roster was assembled. The
 * curated landmarks (`LANDMARKS`) and the swept World Heritage register
 * (`HERITAGE`) are the same object; they differ in how they were CHOSEN, not in
 * what they are, and both feed the same pin-drop taper (`scorePinDistance`) and
 * the same photo chrome (`ZoomableImage`). Two declarations of this drifted
 * once — the field named `kind` meant "what sort of place" on one and "which
 * UNESCO criteria" on the other, and both spelled one of their values
 * `'natural'`.
 */
export interface PlaceEntry extends MediaCredit {
  name: string
  country: ISOCountryCode
  /** Public path of the photo. */
  image: string
  /**
   * How recognisable the place is, gating which difficulties may deal it.
   *
   * Calibrated WITHIN its country, because every roster here is capped per
   * country and the modes deal at most one place per country per round: `major`
   * is the country's icon (the Eiffel Tower, Machu Picchu), `minor` its
   * well-known second, `obscure` the rest. Global recognisability is the other
   * half of the gate and is already applied to the COUNTRY pool — easy only
   * deals large, well-known countries — so the two compose.
   */
  fame: Fame
  /** Point location (Wikidata P625), validated to fall in `country`. The
   *  pin rounds measure the distance from a map click to this. */
  coordinates?: LatLng
  description?: string
}

export type PlaceMapping<Entry extends PlaceEntry = PlaceEntry> = { [slug: string]: Entry }

/** What sort of place a curated landmark is. */
export type LandmarkKind = 'natural' | 'religious' | 'ancient' | 'monument' | 'urban'

export interface LandmarkEntry extends PlaceEntry {
  kind: LandmarkKind
  /** City / region it is in (Wikidata P131) — a hard-mode follow-up or an
   *  educational reveal after the answer. */
  city?: string
}

export type LandmarkMapping = PlaceMapping<LandmarkEntry>

/** UNESCO designation, from the criteria (P2614): (i)–(vi) cultural,
 *  (vii)–(x) natural, both mixed. Deliberately NOT called `kind` — it is a
 *  different axis from `LandmarkKind`, which also has a `'natural'`. */
export type HeritageDesignation = 'cultural' | 'natural' | 'mixed'

export interface HeritageEntry extends PlaceEntry {
  /** The pin round measures distance to this, so a site without one is never
   *  emitted — unlike a landmark, which can still serve the photo quiz. */
  coordinates: LatLng
  /** Year the site entered the World Heritage list (P1435's P580 qualifier). */
  inscribedYear?: number
  designation?: HeritageDesignation
}

export type HeritageMapping = PlaceMapping<HeritageEntry>
