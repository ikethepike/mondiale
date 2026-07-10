import type { CiaLeader } from '../leaders'

/**
 * The CIA's own world-leaders directory, as structured JSON.
 *
 * The `factbook/factbook.json` GitHub mirror we used to parse stopped updating
 * its data on 2026-01-22 — every commit since is a README edit — so it still
 * reports leaders who left office months ago. The CIA's site is a Gatsby app,
 * and each country's page has a sibling `page-data.json` carrying `name` and
 * `title` as separate fields. No prose to parse, and a per-country
 * `date_updated` telling us how much to trust it.
 *
 * Undocumented and a build artifact (there is an `app-data.json` beside it), so
 * this throws loudly rather than letting a moved endpoint quietly blank out
 * every leader in the game.
 */

export interface CiaCountry {
  /** ISO 3166-1 alpha-2, as the CIA reports it. */
  code: string
  country: string
  /** "2026-04-07 16:59:15" — how current this page is. */
  dateUpdated: string
  leaders: CiaLeader[]
}

interface PageDataResponse {
  result?: {
    data?: {
      page?: {
        code?: string
        country?: string
        date_updated?: string
        leaders?: { name?: string; title?: string; honorific?: string }[]
      }
    }
  }
}

/**
 * Where the CIA's slug does not fall out of the country's English name.
 * `US` is absent by design — it is not a *foreign* government.
 */
const SLUG_OVERRIDES: { [isoCode: string]: string } = {
  AE: 'united-arab-emirates',
  BA: 'bosnia-and-herzegovina',
  BS: 'bahamas-the',
  CD: 'congo-democratic-republic-of-the',
  CG: 'congo-republic-of-the',
  CI: 'cote-divoire',
  CZ: 'czechia',
  DO: 'dominican-republic',
  FM: 'micronesia-federated-states-of',
  GB: 'united-kingdom',
  GM: 'gambia-the',
  KP: 'korea-north',
  KR: 'korea-south',
  MM: 'burma',
  SZ: 'eswatini',
  TL: 'timor-leste',
  VA: 'holy-see-vatican-city',
  XK: 'kosovo',
}

/** Countries the CIA does not publish a world-leaders page for. */
const NO_PAGE = new Set([
  'US', // not a foreign government
  'PS', // no page; the game stores no leader for Palestine either
])

const slugFor = (isoCode: string, englishName: string): string =>
  SLUG_OVERRIDES[isoCode] ??
  englishName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const pageDataUrl = (slug: string) =>
  `https://www.cia.gov/resources/world-leaders/page-data/foreign-governments/${slug}/page-data.json`

/**
 * Fetch one country's leaders. Returns `undefined` only for countries the CIA
 * genuinely does not cover; any other failure throws, because silently
 * returning nothing would blank the leader for that country on the next regen.
 */
export const fetchCiaCountry = async (
  isoCode: string,
  englishName: string
): Promise<CiaCountry | undefined> => {
  if (NO_PAGE.has(isoCode)) return undefined

  const url = pageDataUrl(slugFor(isoCode, englishName))
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CIA world-leaders fetch failed for ${isoCode}: ${response.status} ${url}`)
  }

  const page = ((await response.json()) as PageDataResponse).result?.data?.page
  if (!page?.leaders?.length) {
    throw new Error(`CIA world-leaders payload has no leaders[] for ${isoCode}: ${url}`)
  }
  if (!page.date_updated) {
    throw new Error(`CIA world-leaders payload has no date_updated for ${isoCode}: ${url}`)
  }

  return {
    code: page.code ?? isoCode,
    country: page.country ?? englishName,
    dateUpdated: page.date_updated,
    leaders: page.leaders
      .filter(
        (leader): leader is { name: string; title: string } => !!leader.name && !!leader.title
      )
      .map(leader => ({ name: leader.name, title: leader.title })),
  }
}
