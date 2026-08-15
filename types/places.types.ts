import type { MediaCredit } from '~~/lib/attribution'
import type { LatLng } from '~~/lib/geo'
import type { Fame } from './fame.types'
import type { ISOCountryCode } from './geography.types'

/**
 * A photographed place on Earth, holding everything BOTH selections knew about
 * it.
 *
 * ONE roster, `PLACES`. There were two (a hand-curated landmark list and a
 * swept World Heritage register) and they stored the same object twice: sixty
 * subjects existed in both, each row holding half the facts. What actually
 * differed was never the object, only how it was CHOSEN — so that is what
 * survives, as the facets at the bottom.
 *
 * Everything above the facets is a property of the PLACE, contributed by
 * whichever selection knew it, and neither one's version is thrown away for
 * being second: the curated roster brings hand-written prose and a city, the
 * register brings a one-line summary, an inscription and its criteria, and
 * both bring names. Where they genuinely conflict the more precise source
 * wins, which is how Copán's pin answer stopped being 40km from the ruins.
 */
export interface PlaceEntry extends MediaCredit {
  name: string
  /** Every other name the sources knew it by — the register's label when it
   *  differs from the curated one, plus Wikidata aliases. Free answers for
   *  anything that ever matches a place by typed name. */
  alsoKnownAs?: string[]
  country: ISOCountryCode
  /** City / region it sits in (Wikidata P131). */
  city?: string
  /** Public path of the photo. One file per slug, under `/landmarks`. */
  image: string
  /** Point location (Wikidata P625), validated to fall in `country`. The pin
   *  rounds measure the distance from a map click to this. */
  coordinates?: LatLng
  /** Hand-written prose (generators/data/landmark-facts) — the richest
   *  description we hold, and the one a reveal prefers. */
  description?: string
  /** Wikidata's one-line English description. Kept even where prose exists:
   *  it is a different register of fact, and it is all we have for a place the
   *  curated roster never wrote up. */
  summary?: string
  /** Year the place was built, founded or completed (Wikidata P571). */
  inception?: number
  /** Wikipedia sitelink count — GLOBAL renown, orthogonal to the per-country
   *  `fame` tier on the facets. The register already ranked on this and then
   *  discarded it; kept now so any mode can reach for "how famous, really". */
  sitelinks?: number
  /** Present when the place is on the hand-curated roster (landmark-seeds). */
  curated?: CuratedFacet
  /** Present when the place is on the UNESCO World Heritage register. */
  unesco?: UnescoFacet
}

/**
 * Why a facet carries its own `fame` rather than the place carrying one:
 * recognisability here is ranked WITHIN a country, because both selections are
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
}

export interface UnescoFacet {
  fame: Fame
  /** Year the site entered the World Heritage list (P1435's P580 qualifier). */
  inscribedYear?: number
  /** The criteria it was inscribed under, as roman numerals — `['i', 'iv']`.
   *  The raw UNESCO judgement, which `designation` only summarises. */
  criteria?: string[]
  /** Derived from `criteria`: (i)–(vi) cultural, (vii)–(x) natural, both mixed.
   *  Deliberately NOT called `kind` — it is a different axis from
   *  `LandmarkKind`, which also has a `'natural'`, and one field name for both
   *  meanings is how the two rosters drifted. */
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
