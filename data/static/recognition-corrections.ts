/**
 * Hand-corrections to Natural Earth's point-of-view recognition matrix.
 *
 * NE's `ADM0_A3_<POV>` / `FCLASS_<POV>` columns encode how 33 governments
 * classify each contested territory. They are one vendor's reading, they lag
 * real-world recognitions, and they contain outright errors. This overlay is
 * the single documented place to fix them — never edit the vendor cache.
 *
 * Mirrors the shape of data/static/membership-corrections.ts.
 *
 * `setPov` patches individual POV cells. `drop` removes POVs entirely.
 * Re-run `bun run generate:recognition` after editing.
 */

/** Who a point of view says a territory belongs to. */
export type RecognitionAssignment =
  /** An ISO-2 country code: this POV says the territory is part of that country. */
  | string
  /** This POV recognizes the territory as its own sovereign state. */
  | 'SELF'
  /** This POV assigns it to nobody (NE `-99`, or a private refusal code). */
  | 'NONE'

export const RECOGNITION_CORRECTIONS: {
  [territoryId: string]: {
    setPov?: Record<string, RecognitionAssignment>
    drop?: string[]
  }
} = {
  // NE encodes ADM0_A3_GB = SRB, i.e. that the United Kingdom considers Kosovo
  // part of Serbia. The UK recognized Kosovo on 18 February 2008.
  KOS: { setPov: { GB: 'SELF' } },
}

/**
 * NE bugs outside the POV matrix, recorded for the reader. These are handled
 * structurally in the generator rather than by this overlay:
 *
 *   - `ADM0_A3_AR = URY` for Barbados — one POV thinks Barbados is Uruguay.
 *     Barbados is not a contested territory, so it never enters this pipeline.
 *   - "Ilemi Triangle" and "Ilemi Triange" are two features (NE typo). The
 *     typo'd one carries no NOTE_BRK and is dropped as a data gap.
 *   - "Vukovar Island" / "Šarengrad Island" names carry a leading BOM.
 *   - POP_EST = -99 is a sentinel for "unknown", not a population.
 */
