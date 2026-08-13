/**
 * What a media licence permits — the rule that decides whether a harvested file
 * may be published on our own domain.
 *
 * Pure and in `generators/lib` so it is covered by the test runner: the vendor
 * modules beside the network calls are not. `commons.ts` fetches the metadata
 * and hands it here; nothing in this file touches the network.
 */

/** The `extmetadata` block a MediaWiki file page carries, as far as we read it. */
export interface ExtMetadata {
  Artist?: { value?: string }
  LicenseShortName?: { value?: string }
  /** "true" when the host serves the file under fair use rather than a licence. */
  NonFree?: { value?: string }
  /** Commons' own note — "trademarked" for most party marks. */
  Restrictions?: { value?: string }
}

/** What a file's licence permits, decided from its own metadata. */
export interface ImageLicence {
  license?: string
  credit?: string
  /** The host says the file is non-free (fair use). */
  nonFree: boolean
  /** Commons' `Restrictions` note, carried for a view to act on. */
  restrictions?: string
  /** Freely licensed: a recognised free licence, and not flagged non-free. A
   *  fact about the file, independent of what we choose to do with it. */
  free: boolean
  /** Whether the harvest may ship it — `free`, plus fair-use marks when
   *  `PUBLISH_FAIR_USE` is on. This is the field the generator acts on. */
  publishable: boolean
}

/**
 * Licences that permit RE-HOSTING a file on our own domain. Public-domain
 * dedications and the free CC family qualify; CC BY and CC BY-SA add an
 * attribution duty, which is a reason to carry a credit rather than to refuse
 * the file.
 *
 * Deliberately a list of what is ALLOWED. An unrecognised licence reads as "not
 * established as free", so a new or misspelt one costs a logo rather than
 * publishing a mark we have no right to.
 */
// Bare "Attribution" is Commons' own name for the CC Attribution licence —
// Brazil's PSOL mark carries it — and reads as free for the same reason CC BY
// does. `ENCUMBERED` still rejects "Attribution-NonCommercial".
const FREE_LICENCE =
  /^(?:cc0|public[ -]domain|pd(?:[ -]|$)|cc[ -]by(?:[ -]sa)?(?:[ -][\d.]+)?(?:\s|$)|attribution(?:[ -]share[ -]?alike)?(?:\s|$)|gfdl|fal(?:\s|$))/i

/**
 * NonCommercial and NoDerivatives are NOT free for this use however the rest of
 * the string reads. "Attribution-NonCommercial 3.0" starts like a CC BY licence
 * and forbids exactly what a published app does with it, so the allow-list is
 * checked against these before it is trusted.
 */
const ENCUMBERED = /\b(?:non[ -]?commercial|no[ -]?deriv|nc|nd)\b/i

/**
 * Whether we publish a party emblem the host serves under fair use rather than
 * a licence.
 *
 * 499 of the 502 marks the harvest finds are flagged `NonFree` — Wikipedia
 * asserting a fair-use rationale for ITS article, which is not a licence grant
 * to anyone else. Publishing them is a claim that OUR use is fair too, and for
 * this app the argument is a real one: a free educational atlas showing a
 * political party's emblem to identify that party, at thumbnail size, is
 * squarely the nominative use fair-use doctrine protects, and parties are
 * public bodies rather than commercial rights-holders.
 *
 * The argument is US doctrine. The EU has no fair-use clause, so this is a
 * judgement call about risk rather than a settled permission — which is why it
 * is ONE named switch here instead of a rule spread through the harvest. Turn
 * it off and the generator refuses non-free marks again on the next run.
 *
 * Every such logo still carries its licence and credit, and
 * `data-sanity.test.ts` fails the build on a non-free logo whose source we
 * cannot name — that guard is what keeps the claim honest and is why the
 * attribution capture must stay.
 */
export const PUBLISH_FAIR_USE = true

export const classifyLicence = (
  metadata: ExtMetadata | undefined,
  stripTags: (html: string) => string,
  shortenCredit: (credit: string) => string
): ImageLicence => {
  const license = metadata?.LicenseShortName?.value
    ? stripTags(metadata.LicenseShortName.value)
    : undefined
  const credit = metadata?.Artist?.value ? stripTags(metadata.Artist.value) : undefined
  const nonFree = String(metadata?.NonFree?.value ?? '').toLowerCase() === 'true'
  const restrictions = metadata?.Restrictions?.value || undefined
  // A free licence is a FACT about the file. NonCommercial and NoDerivatives
  // read like CC BY and forbid exactly what a published app does, so they are
  // never free however the rest of the string looks.
  const free = !nonFree && !!license && FREE_LICENCE.test(license) && !ENCUMBERED.test(license)
  return {
    ...(license ? { license } : {}),
    ...(credit ? { credit: shortenCredit(credit) } : {}),
    nonFree,
    ...(restrictions ? { restrictions } : {}),
    free,
    // …and publishability is our POLICY on that fact. The two differ only for
    // fair-use files, which is the whole reason they are separate fields.
    // An NC/ND licence stays refused either way: there the rights-holder has
    // said no in the licence itself, which no fair-use argument answers.
    publishable: free || (PUBLISH_FAIR_USE && nonFree && !ENCUMBERED.test(license ?? '')),
  }
}
