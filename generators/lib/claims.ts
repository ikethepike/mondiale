import { BORDERS } from '~~/data/borders.gen'
import { CAPITAL_FACTS } from '~~/data/capital-facts.gen'
import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COMMODITY_EXPORTERS } from '~~/data/commodity-exporters.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import { TONGUE_FACTS } from '~~/data/tongue-facts.gen'
import { WATER_FEATURES } from '~~/data/water.gen'
import { WATER_FACTS } from '~~/data/water-facts.gen'
import { capitalCityLight } from '~~/lib/capitals'
import { countryInProse, countryName } from '~~/lib/country'
import { countryLatLng, haversineKm } from '~~/lib/geo'
import { nationalLanguages, speaksLanguage } from '~~/lib/language-rounds'
import { clamp, formatOrdinal, formatProseNumber } from '~~/lib/number'
import { listJoin, normalizeAnswer, sentenceCase } from '~~/lib/strings'
import { getValueByAccessorID } from '~~/lib/values'
import { REGION_LABELS } from '~~/lib/variant'
import { isTrap } from '~~/lib/two-truths'
import { FAME_TIERS, type Fame } from '~~/types/fame.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { Claim, ClaimEvidence, ClaimFamily } from '~~/types/two-truths.types'
import {
  CLAIM_COMMODITIES,
  CLAIM_RIVERS,
  CONTESTED,
  CONTESTED_BORDERS,
  DISPUTED_CURRENCY,
  MINORITY_LANGUAGES,
  RECENT_EURO,
  SPLIT_CAPITALS,
} from '../data/claim-curation'

const ISO_CODES = (Object.keys(COUNTRIES) as ISOCountryCode[]).filter(isValidISOCode)

const ring = (value: number): number => Math.round(clamp(value, 0.05, 0.95) * 100) / 100

const worst = (...fames: Fame[]): Fame =>
  FAME_TIERS[Math.max(...fames.map(fame => FAME_TIERS.indexOf(fame)))]

const sentence = (text: string): string => `${sentenceCase(text.trim())}.`

const prose = (isoCode: ISOCountryCode) => countryInProse(isoCode)

const valueOf = (isoCode: ISOCountryCode, accessor: GroupChallengeAccessorId) => {
  const amount = getValueByAccessorID(isoCode, accessor)?.amount
  return amount !== undefined && Number.isFinite(amount) && amount > 0 ? amount : undefined
}

const neighboursOf = (isoCode: ISOCountryCode): ISOCountryCode[] =>
  (BORDERS[isoCode] ?? []).filter(isValidISOCode)

const regionOf = (isoCode: ISOCountryCode) => COUNTRIES[isoCode].region

/** Share of a country's land neighbours that pass `test`; undefined for an island. */
const neighbourShare = (
  isoCode: ISOCountryCode,
  test: (neighbour: ISOCountryCode) => boolean
): number | undefined => {
  const neighbours = neighboursOf(isoCode)
  return neighbours.length ? neighbours.filter(test).length / neighbours.length : undefined
}

const distanceKm = (a: ISOCountryCode, b: ISOCountryCode): number | undefined => {
  const from = countryLatLng(a)
  const to = countryLatLng(b)
  return from && to ? haversineKm(from, to) : undefined
}

/** Centroid distance less both countries' radii — a rough edge-to-edge gap
 *  that doesn't punish two giants for having distant middles. */
const edgeGapKm = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const radius = (isoCode: ISOCountryCode) =>
    Math.sqrt((getValueByAccessorID(isoCode, 'geography.area.total')?.amount ?? 0) / Math.PI)
  return Math.max(0, (distanceKm(a, b) ?? 0) - radius(a) - radius(b))
}

/** 1-based rank of every country by a value, largest first. */
const rankBy = (values: Map<ISOCountryCode, number>): Map<ISOCountryCode, number> =>
  new Map(
    [...values.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([isoCode], index) => [isoCode, index + 1])
  )

const valuesOf = (accessor: GroupChallengeAccessorId, pool = ISO_CODES) =>
  new Map(
    pool.flatMap(isoCode => {
      const value = valueOf(isoCode, accessor)
      return value === undefined ? [] : [[isoCode, value] as const]
    })
  )

const POPULATION = valuesOf('people.population')
const AREA = valuesOf('geography.area.total')
const GDP = valuesOf('economics.gdpTotal')
const TOURISTS = valuesOf('economics.touristArrivals')

/** Area as a Mercator-raised eye reads it: inflated by sec² of the latitude. */
const PERCEIVED_AREA = new Map(
  [...AREA.entries()].flatMap(([isoCode, area]) => {
    const point = countryLatLng(isoCode)
    if (!point) return []
    const latitude = (Math.min(Math.abs(point.lat), 80) * Math.PI) / 180
    return [[isoCode, area / Math.cos(latitude) ** 2] as const]
  })
)

const GDP_RANK = rankBy(GDP)

/**
 * How recognisable a country is: its best standing across economy, people,
 * land and visitors — Mongolia is known for its size, Iceland for its
 * visitors, neither for its GDP.
 */
const RENOWN: Map<ISOCountryCode, Fame> = (() => {
  const ranks = [rankBy(GDP), rankBy(POPULATION), rankBy(AREA), rankBy(TOURISTS)]
  return new Map(
    ISO_CODES.map(isoCode => {
      const best = Math.min(...ranks.map(rank => rank.get(isoCode) ?? Number.POSITIVE_INFINITY))
      return [isoCode, best <= 40 ? 'major' : best <= 100 ? 'minor' : 'obscure'] as const
    })
  )
})()

export const countryRenown = (isoCode: ISOCountryCode): Fame => RENOWN.get(isoCode) ?? 'obscure'

const renown = (...isoCodes: ISOCountryCode[]): Fame => worst(...isoCodes.map(countryRenown))

const names = (isoCodes: ISOCountryCode[], limit = 8): string => {
  const shown = isoCodes.slice(0, limit).map(countryName)
  return isoCodes.length > limit
    ? `${shown.join(', ')} and ${isoCodes.length - limit} more`
    : listJoin(shown)
}

const countriesEvidence = (label: string, countries: ISOCountryCode[]): ClaimEvidence => ({
  kind: 'countries',
  label,
  countries,
})

type Draft = Omit<Claim, 'family'>

const family = (name: ClaimFamily, drafts: Draft[]): Claim[] =>
  drafts.map(draft => ({ ...draft, family: name }))

// --- Borders: a neighbour's neighbour is the classic near miss. -----------

const GIANT_AREA_KM2 = 3_000_000

const borderClaims = (): Claim[] =>
  family(
    'borders',
    ISO_CODES.flatMap(subject => {
      const neighbours = neighboursOf(subject)
      if (!neighbours.length || CONTESTED.has(subject)) return []
      const evidence = countriesEvidence(`${countryName(subject)}'s land neighbours`, neighbours)
      const pairTopic = (other: ISOCountryCode) => `borders:${[subject, other].sort().join(':')}`

      const truths = neighbours
        .filter(other => !CONTESTED.has(other))
        .map((other): Draft => {
          const common = neighbours.filter(isoCode => neighboursOf(other).includes(isoCode)).length
          const far = clamp(((distanceKm(subject, other) ?? 0) - 1200) / 2400, 0, 1)
          return {
            id: `borders:${subject}:${other}`,
            topic: pairTopic(other),
            subject,
            countries: [subject, other],
            text: sentence(`${prose(subject)} shares a land border with ${prose(other)}`),
            truth: true,
            plausibility: ring(
              0.8 -
                (regionOf(subject) !== regionOf(other) ? 0.3 : 0) -
                0.3 * far +
                0.05 * Math.min(common, 2)
            ),
            fame: renown(subject, other),
            note: sentence(`They meet. ${prose(subject)} borders ${names(neighbours)}`),
            evidence,
          }
        })

      const contestedPair = (other: ISOCountryCode) =>
        CONTESTED_BORDERS.some(pair => pair.includes(subject) && pair.includes(other))
      const nearMisses = [...new Set(neighbours.flatMap(neighboursOf))].filter(
        other =>
          other !== subject &&
          !neighbours.includes(other) &&
          !CONTESTED.has(other) &&
          !contestedPair(other) &&
          !neighbours.some(
            isoCode => CONTESTED.has(isoCode) && neighboursOf(other).includes(isoCode)
          )
      )
      const lies = nearMisses.map((other): Draft => {
        const between = neighbours.filter(isoCode => neighboursOf(other).includes(isoCode))
        // A giant in common is weak evidence of closeness: Russia's Kaliningrad
        // makes Norway and Lithuania "share" a neighbour across the Baltic.
        const sharedWeight = between.reduce(
          (sum, isoCode) => sum + ((AREA.get(isoCode) ?? 0) > GIANT_AREA_KM2 ? 0.5 : 1),
          0
        )
        const far = clamp((edgeGapKm(subject, other) - 300) / 1500, 0, 1)
        return {
          id: `borders:${subject}:${other}`,
          topic: pairTopic(other),
          subject,
          countries: [subject, other],
          text: sentence(`${prose(subject)} shares a land border with ${prose(other)}`),
          truth: false,
          plausibility: ring(
            0.3 +
              0.25 * Math.min(sharedWeight, 2) +
              (regionOf(subject) === regionOf(other) ? 0.1 : 0) -
              0.3 * far
          ),
          fame: renown(subject, other),
          note: sentence(
            `They never touch — ${names(between)} ${between.length > 1 ? 'lie' : 'lies'} between them`
          ),
          evidence,
        }
      })

      return [...truths, ...lies]
    })
  )

// --- Language: officiality is crisp; "spoken" is a minority-language fight. ---

const languageClaims = (): Claim[] => {
  const officialIn = new Map<string, ISOCountryCode[]>()
  for (const isoCode of ISO_CODES) {
    for (const language of nationalLanguages(isoCode)) {
      officialIn.set(language, [...(officialIn.get(language) ?? []), isoCode])
    }
  }

  const languageFame = (language: string): Fame => {
    const speakers = TONGUE_FACTS[language]?.speakers ?? 0
    const reach = officialIn.get(language)?.length ?? 0
    if (speakers >= 50_000_000 || reach >= 5) return 'major'
    if (speakers >= 5_000_000 || reach >= 2) return 'minor'
    return 'obscure'
  }

  const regionalShare = (language: string, region: string, except: ISOCountryCode) => {
    const others = (officialIn.get(language) ?? []).filter(isoCode => isoCode !== except)
    return others.length
      ? others.filter(isoCode => regionOf(isoCode) === region).length / others.length
      : 0
  }

  const officialNote = (isoCode: ISOCountryCode) => {
    const languages = nationalLanguages(isoCode)
    const listed =
      languages.length > 4
        ? `${languages.slice(0, 3).join(', ')} and ${languages.length - 3} more`
        : listJoin(languages)
    return `${sentenceCase(prose(isoCode))}'s official ${languages.length > 1 ? 'languages are' : 'language is'} ${listed}`
  }

  /** A language nobody at the table has heard of makes a coin flip, not a claim. */
  const isKnown = (language: string) =>
    (TONGUE_FACTS[language]?.speakers ?? 0) >= 5_000_000 ||
    (officialIn.get(language)?.length ?? 0) >= 3

  return family(
    'language',
    [...officialIn.entries()]
      .filter(([language]) => isKnown(language))
      .flatMap(([language, speakers]) => {
        const evidence = countriesEvidence(`${language} is official in`, speakers)
        const fame = languageFame(language)

        const home = [...speakers].sort(
          (a, b) => (POPULATION.get(b) ?? 0) - (POPULATION.get(a) ?? 0)
        )[0]
        const truths = speakers.flatMap((subject): Draft[] => {
          // A language's home — its most populous official country, or its only
          // one — is a gift, not a claim: "French is official in France".
          if (subject === home || nationalLanguages(subject)[0] === language) return []
          const share = regionalShare(language, regionOf(subject), subject)
          const nextDoor = neighbourShare(subject, isoCode => speakers.includes(isoCode)) ?? 0
          return [
            {
              id: `language:${subject}:${language}`,
              topic: `language:${subject}:${language}`,
              subject,
              countries: [subject],
              text: sentence(`${language} is an official language of ${prose(subject)}`),
              truth: true,
              plausibility: ring(0.2 + 0.5 * share + 0.25 * nextDoor),
              fame: worst(fame, renown(subject)),
              note: sentence(officialNote(subject)),
              evidence,
            },
          ]
        })

        const lies = [...new Set(speakers.flatMap(neighboursOf))]
          .filter(subject => !speakers.includes(subject) && !speaksLanguage(subject, language))
          .filter(
            subject =>
              !MINORITY_LANGUAGES.some(
                ([isoCode, minority]) => isoCode === subject && minority === language
              )
          )
          .map((subject): Draft => {
            const nextDoor = neighbourShare(subject, isoCode => speakers.includes(isoCode)) ?? 0
            return {
              id: `language:${subject}:${language}`,
              topic: `language:${subject}:${language}`,
              subject,
              countries: [subject],
              text: sentence(`${language} is an official language of ${prose(subject)}`),
              truth: false,
              plausibility: ring(
                0.35 +
                  0.45 * nextDoor +
                  (regionalShare(language, regionOf(subject), subject) >= 0.5 ? 0.1 : 0)
              ),
              fame: worst(fame, renown(subject)),
              note: sentence(`${officialNote(subject)} — ${language} stops at the border`),
              evidence,
            }
          })

        return [...truths, ...lies]
      })
  )
}

// --- Capitals: the biggest city that isn't the capital. ---------------------

const CAPITAL_RIVAL_POPULATION = 1_000_000

const capitalClaims = (): Claim[] =>
  family(
    'capital',
    ISO_CODES.flatMap((subject): Draft[] => {
      if (SPLIT_CAPITALS.has(subject)) return []
      const capital = CAPITALS[subject]?.name
      const row = capitalCityLight(subject)
      const cities = [...(CITY_LIGHTS[subject] ?? [])].sort((a, b) => b.population - a.population)
      const biggest = cities[0]
      if (!capital || !row || !biggest || biggest.name === row.name) return []
      const ratio = biggest.population / Math.max(1, row.population)
      // A city-proper row under a million is the gazetteer's quirk, not a rival
      // capital anyone would name (Kuwait's Al Aḩmadī).
      if (ratio < 1.5 || biggest.population < CAPITAL_RIVAL_POPULATION) return []
      const pull = Math.log2(ratio)
      const evidence: ClaimEvidence = {
        kind: 'bars',
        label: 'City population',
        rows: [
          {
            name: biggest.name,
            value: biggest.population,
            display: formatProseNumber(biggest.population),
          },
          { name: capital, value: row.population, display: formatProseNumber(row.population) },
        ],
      }
      const topic = `capital:${subject}`
      const fame = renown(subject)
      return [
        {
          id: `capital:${subject}:${normalizeAnswer(capital)}`,
          topic,
          subject,
          countries: [subject],
          text: sentence(`The capital of ${prose(subject)} is ${capital}`),
          truth: true,
          plausibility: ring(clamp(0.55 - 0.08 * pull, 0.3, 0.55)),
          fame,
          note: sentence(`${capital} it is — even though ${biggest.name} is the bigger city`),
          evidence,
        },
        {
          id: `capital:${subject}:${normalizeAnswer(biggest.name)}`,
          topic,
          subject,
          countries: [subject],
          text: sentence(`The capital of ${prose(subject)} is ${biggest.name}`),
          truth: false,
          plausibility: ring(clamp(0.45 + 0.08 * pull, 0.45, 0.75)),
          fame,
          note: sentence(`It's ${capital}. ${biggest.name} is the biggest city, not the capital`),
          evidence,
        },
      ]
    })
  )

// --- Currency: the euro outside the EU, the krona inside it. ----------------

const isMember = (isoCode: ISOCountryCode, club: 'eu' | 'nato') =>
  COUNTRIES[isoCode].membership.some(organization => organization.id === club)

const currencyClaims = (): Claim[] => {
  const users = (code: string) => ISO_CODES.filter(isoCode => COUNTRIES[isoCode].currency === code)
  const euro = users('EUR')
  const dollar = users('USD').filter(isoCode => !DISPUTED_CURRENCY.has(isoCode))
  const currencyName = (isoCode: ISOCountryCode) => {
    const code = COUNTRIES[isoCode].currency
    return code ? CURRENCIES[code]?.name : undefined
  }

  const euroTruths = euro.map((subject): Draft => {
    const member = isMember(subject, 'eu')
    return {
      id: `currency:${subject}:EUR`,
      topic: `currency:${subject}:EUR`,
      subject,
      countries: [subject],
      text: sentence(`${prose(subject)} uses the euro`),
      truth: true,
      plausibility: member ? (RECENT_EURO.has(subject) ? 0.45 : 0.8) : 0.3,
      fame: renown(subject),
      note: sentence(
        member
          ? `${prose(subject)} is one of ${euro.length} countries paying in euros`
          : `${prose(subject)} pays in euros without being in the European Union`
      ),
      evidence: countriesEvidence('Paying in euros', euro),
    }
  })

  const euroLies = ISO_CODES.filter(
    subject =>
      !euro.includes(subject) &&
      !DISPUTED_CURRENCY.has(subject) &&
      (isMember(subject, 'eu') || regionOf(subject) === 'europe')
  ).flatMap((subject): Draft[] => {
    const own = currencyName(subject)
    if (!own) return []
    const member = isMember(subject, 'eu')
    const nextDoor = neighbourShare(subject, isoCode => euro.includes(isoCode)) ?? 0.5
    return [
      {
        id: `currency:${subject}:EUR`,
        topic: `currency:${subject}:EUR`,
        subject,
        countries: [subject],
        text: sentence(`${prose(subject)} uses the euro`),
        truth: false,
        plausibility: ring(member ? 0.8 : Math.min(0.6, 0.35 + 0.35 * nextDoor)),
        fame: renown(subject),
        note: sentence(`${prose(subject)} still pays in the ${own}`),
        evidence: countriesEvidence('Paying in euros', euro),
      },
    ]
  })

  const dollarTruths = dollar
    .filter(subject => subject !== 'US')
    .map((subject): Draft => ({
      id: `currency:${subject}:USD`,
      topic: `currency:${subject}:USD`,
      subject,
      countries: [subject],
      text: sentence(`${prose(subject)} uses the US dollar as its currency`),
      truth: true,
      plausibility: 0.25,
      fame: renown(subject),
      note: sentence(`${prose(subject)} dollarised — the greenback is its own currency`),
      evidence: countriesEvidence('Paying in US dollars', dollar),
    }))

  return family('currency', [...euroTruths, ...euroLies, ...dollarTruths])
}

// --- Clubs: NATO and the EU, judged by the neighbours. ----------------------

/** Where a non-member is a believable member — a lie anywhere else is a joke. */
const CLUBS = {
  nato: { name: 'NATO', regions: ['europe', 'north-america'] },
  eu: { name: 'the European Union', regions: ['europe'] },
} as const

const clubClaims = (): Claim[] =>
  family(
    'club',
    (Object.keys(CLUBS) as (keyof typeof CLUBS)[]).flatMap(club => {
      const { name, regions } = CLUBS[club]
      const members = ISO_CODES.filter(isoCode => isMember(isoCode, club))
      const regional = (subject: ISOCountryCode) =>
        members.filter(isoCode => regionOf(isoCode) === regionOf(subject))
      return ISO_CODES.flatMap((subject): Draft[] => {
        const member = members.includes(subject)
        const nextDoor = neighbourShare(subject, isoCode => members.includes(isoCode))
        if (!member && (nextDoor === undefined ? regionOf(subject) !== 'europe' : nextDoor === 0))
          return []
        if (!member && !(regions as readonly string[]).includes(regionOf(subject))) return []
        const shareNextDoor = nextDoor ?? 0
        const shareRegion =
          regional(subject).filter(isoCode => isoCode !== subject).length /
          Math.max(
            1,
            ISO_CODES.filter(isoCode => regionOf(isoCode) === regionOf(subject)).length - 1
          )
        const neighboursIn = neighboursOf(subject).filter(isoCode =>
          members.includes(isoCode)
        ).length
        return [
          {
            id: `club:${subject}:${club}`,
            topic: `club:${subject}:${club}`,
            subject,
            countries: [subject],
            text: sentence(`${prose(subject)} is a member of ${name}`),
            truth: member,
            plausibility: ring(0.3 + 0.3 * shareNextDoor + 0.3 * shareRegion),
            fame: renown(subject),
            note: sentence(
              member
                ? `${prose(subject)} is one of ${name}'s ${members.length} members`
                : `${prose(subject)} isn't a member${neighboursIn ? ` — though ${neighboursIn === 1 ? 'one of its neighbours is' : `${neighboursIn} of its neighbours are`}` : ''}`
            ),
            evidence: countriesEvidence(
              `Members of ${name} in ${REGION_LABELS[regionOf(subject)]}`,
              regional(subject)
            ),
          },
        ]
      })
    })
  )

// --- Ranks: regional podiums and the world's top ten. -----------------------

const RANKED = [
  {
    key: 'population',
    values: POPULATION,
    proxy: GDP,
    display: (value: number) => `${formatProseNumber(value)} people`,
    regional: (k: number) =>
      k === 1 ? 'the most populous' : `the ${['', '', 'second', 'third'][k]} most populous`,
    world: 'one of the ten most populous countries in the world',
    label: 'Population',
  },
  {
    key: 'area',
    values: AREA,
    proxy: PERCEIVED_AREA,
    display: (value: number) => `${formatProseNumber(value)} km²`,
    regional: (k: number) =>
      k === 1 ? 'the largest' : `the ${['', '', 'second', 'third'][k]}-largest`,
    world: 'one of the ten largest countries in the world',
    label: 'Area',
  },
] as const

/**
 * Regions whose borders match what a player means by the continent. Europe,
 * Asia and the Middle East don't: the dataset files Russia under Asia and
 * Turkey under the Middle East, which made France "the largest country in
 * Europe".
 */
const RANKED_REGIONS = ['africa', 'north-america', 'south-america', 'oceania'] as const

/** World-rank claims run this far down, and their evidence shows every rank they reach. */
const WORLD_RANK_REACH = 16

/** Neighbouring values this close are a data-vintage coin flip, not a fact. */
const RANK_MARGIN = 1.03

const rankClaims = (): Claim[] =>
  family(
    'rank',
    RANKED.flatMap(stat => {
      const regionalClaims = RANKED_REGIONS.flatMap(region => {
        const pool = ISO_CODES.filter(
          isoCode => regionOf(isoCode) === region && stat.values.has(isoCode)
        )
        const ordered = [...pool].sort((a, b) => stat.values.get(b)! - stat.values.get(a)!)
        const proxyRank = rankBy(
          new Map(
            pool.flatMap(isoCode =>
              stat.proxy.has(isoCode) ? [[isoCode, stat.proxy.get(isoCode)!] as const] : []
            )
          )
        )
        const regionLabel = REGION_LABELS[region]
        const evidence: ClaimEvidence = {
          kind: 'bars',
          label: `${stat.label} · ${regionLabel}`,
          rows: ordered.slice(0, 5).map(isoCode => ({
            isoCode,
            name: countryName(isoCode),
            value: stat.values.get(isoCode)!,
            display: stat.display(stat.values.get(isoCode)!),
          })),
        }
        return [1, 2, 3].flatMap(k => {
          const holder = ordered[k - 1]
          if (!holder) return []
          const above = ordered[k - 2]
          const below = ordered[k]
          const value = stat.values.get(holder)!
          if (above && stat.values.get(above)! / value < RANK_MARGIN) return []
          if (below && value / stat.values.get(below)! < RANK_MARGIN) return []
          return ordered.slice(Math.max(0, k - 2), k + 1).map((subject): Draft => {
            const rank = ordered.indexOf(subject) + 1
            const proxy = proxyRank.get(subject) ?? pool.length
            return {
              id: `rank:${stat.key}:${region}:${k}:${subject}`,
              topic: `rank:${stat.key}:${region}:${subject}`,
              subject,
              countries: [subject],
              text: sentence(`${prose(subject)} is ${stat.regional(k)} country in ${regionLabel}`),
              truth: rank === k,
              plausibility: ring(0.9 - 0.22 * Math.abs(proxy - k)),
              fame: renown(subject),
              note: sentence(
                rank === k
                  ? `${stat.display(stat.values.get(subject)!)} — ${formatOrdinal(k)} in ${regionLabel}`
                  : `${prose(subject)} ranks ${formatOrdinal(rank)}. ${countryName(holder)} is ${formatOrdinal(k)}`
              ),
              evidence,
            }
          })
        })
      })

      const ordered = [...stat.values.keys()].sort(
        (a, b) => stat.values.get(b)! - stat.values.get(a)!
      )
      const proxyRank = rankBy(stat.proxy)
      const cutoff = stat.values.get(ordered[9])! / stat.values.get(ordered[10])!
      const worldEvidence: ClaimEvidence = {
        kind: 'bars',
        label: `${stat.label} · world top ${WORLD_RANK_REACH}`,
        rows: ordered.slice(0, WORLD_RANK_REACH).map(isoCode => ({
          isoCode,
          name: countryName(isoCode),
          value: stat.values.get(isoCode)!,
          display: stat.display(stat.values.get(isoCode)!),
        })),
      }
      // The giants are no question; only the band around the cut-off is.
      const worldClaims = ordered.slice(0, WORLD_RANK_REACH).flatMap((subject, index): Draft[] => {
        const rank = index + 1
        if (rank < 6) return []
        if ((rank === 10 || rank === 11) && cutoff < RANK_MARGIN) return []
        const proxy = proxyRank.get(subject) ?? ordered.length
        return [
          {
            id: `rank:${stat.key}:world:10:${subject}`,
            topic: `rank:${stat.key}:world:${subject}`,
            subject,
            countries: [subject],
            text: sentence(`${prose(subject)} is ${stat.world}`),
            truth: rank <= 10,
            plausibility: ring(proxy <= 10 ? 0.9 : 0.9 - 0.03 * (proxy - 10)),
            fame: renown(subject),
            note: sentence(`${prose(subject)} ranks ${formatOrdinal(rank)} in the world`),
            evidence: worldEvidence,
          },
        ]
      })

      return [...regionalClaims, ...worldClaims]
    })
  )

// --- Versus: more people in the smaller country. ----------------------------

/** Countries a player measures others against. */
const ANCHORS: ISOCountryCode[] = [
  'US',
  'CA',
  'AU',
  'RU',
  'BR',
  'DE',
  'GB',
  'FR',
  'JP',
  'IT',
  'ES',
  'MX',
  'AR',
  'EG',
  'ZA',
  'CN',
  'IN',
  'KR',
]

const VERSUS_MARGIN = 1.15
/** Beyond this the comparison stops being a question (Germany vs Mauritania). */
const VERSUS_SPREAD = 3

const versusClaims = (): Claim[] => {
  const pairs = [
    {
      key: 'population',
      values: POPULATION,
      proxy: AREA,
      text: (a: ISOCountryCode, b: ISOCountryCode) =>
        `More people live in ${prose(a)} than in ${prose(b)}`,
      display: (value: number) => `${formatProseNumber(value)} people`,
      label: 'Population',
    },
    {
      key: 'area',
      values: AREA,
      proxy: PERCEIVED_AREA,
      text: (a: ISOCountryCode, b: ISOCountryCode) => `${prose(a)} is larger than ${prose(b)}`,
      display: (value: number) => `${formatProseNumber(value)} km²`,
      label: 'Area',
    },
  ] as const

  return family(
    'versus',
    pairs.flatMap(stat =>
      ISO_CODES.flatMap(subject =>
        ANCHORS.flatMap((anchor): Draft[] => {
          if (anchor === subject) return []
          const [own, theirs] = [stat.values.get(subject), stat.values.get(anchor)]
          const [ownProxy, theirProxy] = [stat.proxy.get(subject), stat.proxy.get(anchor)]
          if (!own || !theirs || !ownProxy || !theirProxy) return []
          const ratio = own / theirs
          const spread = Math.max(ratio, 1 / ratio)
          if (spread < VERSUS_MARGIN || spread > VERSUS_SPREAD) return []
          const proxyRatio = ownProxy / theirProxy
          // Only pairs where the proxy points the wrong way earn a card: that
          // disagreement is the whole trick, in both directions.
          if (ratio > 1 === proxyRatio > 1 || Math.max(proxyRatio, 1 / proxyRatio) < 1.3) return []
          const evidence: ClaimEvidence = {
            kind: 'bars',
            label: stat.label,
            rows: [subject, anchor]
              .sort((a, b) => stat.values.get(b)! - stat.values.get(a)!)
              .map(isoCode => ({
                isoCode,
                name: countryName(isoCode),
                value: stat.values.get(isoCode)!,
                display: stat.display(stat.values.get(isoCode)!),
              })),
          }
          const topic = `versus:${stat.key}:${[subject, anchor].sort().join(':')}`
          const fame = renown(subject, anchor)
          const note = sentence(
            `${countryName(subject)}: ${stat.display(own)}; ${countryName(anchor)}: ${stat.display(theirs)}`
          )
          const ringFor = (leanRatio: number) =>
            ring(0.5 + 0.3 * Math.tanh(0.4 * Math.log(leanRatio)))
          return [
            {
              id: `versus:${stat.key}:${subject}:${subject}:${anchor}`,
              topic,
              subject,
              countries: [subject, anchor],
              text: sentence(stat.text(subject, anchor)),
              truth: ratio > 1,
              plausibility: ringFor(proxyRatio),
              fame,
              note,
              evidence,
            },
            {
              id: `versus:${stat.key}:${subject}:${anchor}:${subject}`,
              topic,
              subject,
              countries: [subject, anchor],
              text: sentence(stat.text(anchor, subject)),
              truth: ratio < 1,
              plausibility: ringFor(1 / proxyRatio),
              fame,
              note,
              evidence,
            },
          ]
        })
      )
    )
  )
}

// --- Trade: the small economy at the top of a market. -----------------------

const TRADE_MARGIN = 1.05
/** Trade claims reach this far down the exporter table, and so does their evidence. */
const TRADE_RANK_REACH = 6

const tradeClaims = (): Claim[] =>
  family(
    'trade',
    Object.entries(CLAIM_COMMODITIES).flatMap(([commodity, { phrase, major }]) => {
      const market = COMMODITY_EXPORTERS[commodity]
      if (!market) return []
      const top = market.top.filter(row => isValidISOCode(row.isoCode) && COUNTRIES[row.isoCode])
      const evidence: ClaimEvidence = {
        kind: 'bars',
        label: `Share of world ${phrase} exports, ${market.world.year ?? ''}`.trim(),
        rows: top.slice(0, TRADE_RANK_REACH).map(row => ({
          isoCode: row.isoCode,
          name: countryName(row.isoCode),
          value: row.share,
          display: `${Math.round(row.share * 100)}%`,
        })),
      }
      const amountAt = (rank: number) => top[rank - 1]?.value.amount ?? 0
      const decisive = (rank: number) =>
        amountAt(rank) / Math.max(1, amountAt(rank + 1)) >= TRADE_MARGIN
      const commodityFame: Fame = major ? 'major' : 'minor'
      const plausibilityFor = (isoCode: ISOCountryCode) =>
        ring(Math.max(0.2, 0.75 - 0.007 * ((GDP_RANK.get(isoCode) ?? 150) - 1)))

      return top.slice(0, TRADE_RANK_REACH).flatMap((row, index): Draft[] => {
        const rank = index + 1
        const subject = row.isoCode
        const topic = `trade:${commodity}:${subject}`
        const fame = worst(commodityFame, renown(subject))
        const leader = top[0].isoCode
        const claims: Draft[] = []
        if (rank <= 3 && decisive(1)) {
          claims.push({
            id: `trade:${commodity}:1:${subject}`,
            topic,
            subject,
            countries: [subject],
            text: sentence(`${prose(subject)} is the world's biggest exporter of ${phrase}`),
            truth: rank === 1,
            plausibility: plausibilityFor(subject),
            fame,
            note: sentence(
              rank === 1
                ? `${prose(subject)} ships ${Math.round(row.share * 100)}% of the world's ${phrase} exports`
                : `${prose(subject)} is ${formatOrdinal(rank)}. ${countryName(leader)} leads with ${Math.round(top[0].share * 100)}%`
            ),
            evidence,
          })
        }
        if (rank >= 2 && decisive(3)) {
          claims.push({
            id: `trade:${commodity}:3:${subject}`,
            topic,
            subject,
            countries: [subject],
            text: sentence(
              `${prose(subject)} is one of the world's three biggest exporters of ${phrase}`
            ),
            truth: rank <= 3,
            plausibility: plausibilityFor(subject),
            fame,
            note: sentence(
              `${prose(subject)} ranks ${formatOrdinal(rank)} with ${Math.round(row.share * 100)}% of world exports`
            ),
            evidence,
          })
        }
        return claims
      })
    })
  )

// --- Clocks: the capitals that sit off the hour. ----------------------------

const utcOffset = (timezone: string | undefined): number | undefined => {
  if (timezone === 'UTC') return 0
  const match = timezone?.match(/^UTC([+-])(\d+(?:\.\d+)?)$/)
  return match ? (match[1] === '-' ? -1 : 1) * Number(match[2]) : undefined
}

const formatOffset = (offset: number): string => {
  const hours = Math.trunc(Math.abs(offset))
  const minutes = Math.round((Math.abs(offset) - hours) * 60)
  return `UTC${offset < 0 ? '−' : '+'}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

const clockClaims = (): Claim[] => {
  const offsets = new Map(
    ISO_CODES.flatMap(isoCode => {
      const offset = utcOffset(CAPITAL_FACTS[isoCode]?.timezone)
      return offset === undefined || !CAPITALS[isoCode] ? [] : [[isoCode, offset] as const]
    })
  )
  const offHour = [...offsets.entries()].filter(([, offset]) => !Number.isInteger(offset))
  const evidence = countriesEvidence(
    'Capitals off the whole hour',
    offHour.map(([isoCode]) => isoCode)
  )
  const clockText = (isoCode: ISOCountryCode, offset: number) =>
    sentence(
      `Clocks in ${CAPITALS[isoCode]!.name}, the capital of ${prose(isoCode)}, run on ${formatOffset(offset)}`
    )

  const truths = offHour.map(([subject, offset]): Draft => ({
    id: `clock:${subject}:${offset}`,
    topic: `clock:${subject}`,
    subject,
    countries: [subject],
    text: clockText(subject, offset),
    truth: true,
    plausibility: 0.35,
    fame: renown(subject),
    note: sentence(`${formatOffset(offset)} — one of a handful of capitals set off the whole hour`),
    evidence,
  }))

  const lies = offHour.flatMap(([source, offset]) =>
    neighboursOf(source)
      .filter(subject => {
        const own = offsets.get(subject)
        return own !== undefined && Number.isInteger(own) && Math.abs(own - offset) <= 1
      })
      .map((subject): Draft => ({
        id: `clock:${subject}:${offset}`,
        topic: `clock:${subject}`,
        subject,
        countries: [subject],
        text: clockText(subject, offset),
        truth: false,
        plausibility: 0.6,
        fame: renown(subject),
        note: sentence(
          `${CAPITALS[subject]!.name} keeps ${formatOffset(offsets.get(subject)!)} — it's ${prose(source)} that runs on ${formatOffset(offset)}`
        ),
        evidence,
      }))
  )

  const unique = new Map([...truths, ...lies].map(draft => [draft.id, draft]))
  return family('clock', [...unique.values()])
}

// --- Rivers: the curated reaches, near misses next door. --------------------

const riverLength = (feature: { name: string; aliases?: string[] }) =>
  [feature.name, ...(feature.aliases ?? [])]
    .map(name => WATER_FACTS[normalizeAnswer(name)]?.lengthKm)
    .find((length): length is number => length !== undefined)

const riverClaims = (): Claim[] =>
  family(
    'river',
    Object.entries(CLAIM_RIVERS).flatMap(([id, { name, disputed = [] }]) => {
      const feature = WATER_FEATURES[id]
      if (!feature) return []
      const along = feature.countries.filter(isValidISOCode)
      const length = riverLength(feature) ?? 0
      const riverFame: Fame = length >= 2500 || along.length >= 5 ? 'major' : 'minor'
      const evidence = countriesEvidence(`${sentenceCase(name)} touches`, along)
      const text = (subject: ISOCountryCode) =>
        sentence(`${name} flows through or along ${prose(subject)}`)
      const ringFor = (subject: ISOCountryCode) =>
        ring(0.3 + 0.6 * (neighbourShare(subject, isoCode => along.includes(isoCode)) ?? 0.4))

      const truths = along.map((subject): Draft => ({
        id: `river:${id}:${subject}`,
        topic: `river:${id}:${subject}`,
        subject,
        countries: [subject],
        text: text(subject),
        truth: true,
        plausibility: ringFor(subject),
        fame: worst(riverFame, renown(subject)),
        note: sentence(`${sentenceCase(name)} touches ${names(along)}`),
        evidence,
      }))
      const lies = [...new Set(along.flatMap(neighboursOf))]
        .filter(subject => !along.includes(subject) && !disputed.includes(subject))
        .filter(
          subject => (neighbourShare(subject, isoCode => along.includes(isoCode)) ?? 0) >= 0.4
        )
        .map((subject): Draft => ({
          id: `river:${id}:${subject}`,
          topic: `river:${id}:${subject}`,
          subject,
          countries: [subject],
          text: text(subject),
          truth: false,
          plausibility: ringFor(subject),
          fame: worst(riverFame, renown(subject)),
          note: sentence(`It never reaches ${prose(subject)} — ${name} touches ${names(along)}`),
          evidence,
        }))
      return [...truths, ...lies]
    })
  )

/** The whole deck, every claim stamped. Pure over the shipped datasets. */
export const buildClaims = (): Claim[] => {
  const claims = [
    ...borderClaims(),
    ...languageClaims(),
    ...capitalClaims(),
    ...currencyClaims(),
    ...clubClaims(),
    ...rankClaims(),
    ...versusClaims(),
    ...tradeClaims(),
    ...clockClaims(),
    ...riverClaims(),
  ]
  const byId = new Map<string, Claim>()
  for (const claim of claims) {
    if (byId.has(claim.id)) throw new Error(`Duplicate claim id: ${claim.id}`)
    byId.set(claim.id, claim)
  }
  return claims.sort((a, b) => a.id.localeCompare(b.id))
}

/** The human-review report: what the deck holds and where it is spiciest. */
export const claimsReport = (claims: Claim[], coverage: string[]): string => {
  const lines: string[] = [`Two Truths claim deck — ${claims.length} claims`, '']
  const families = [...new Set(claims.map(claim => claim.family))]
  for (const name of families) {
    const own = claims.filter(claim => claim.family === name)
    const truths = own.filter(claim => claim.truth).length
    const traps = own.filter(isTrap).length
    lines.push(
      `${name.padEnd(10)} ${String(own.length).padStart(5)} claims · ${truths} true · ${own.length - truths} false · ${traps} traps`
    )
  }
  const list = (title: string, picked: Claim[]) => {
    lines.push('', title)
    for (const claim of picked) {
      lines.push(`  ${claim.plausibility.toFixed(2)} [${claim.fame}] ${claim.text}`)
    }
  }
  list(
    'Truths that ring false (spiciest 40):',
    claims
      .filter(claim => claim.truth)
      .sort((a, b) => a.plausibility - b.plausibility)
      .slice(0, 40)
  )
  list(
    'Lies that ring true (most tempting 40):',
    claims
      .filter(claim => !claim.truth)
      .sort((a, b) => b.plausibility - a.plausibility)
      .slice(0, 40)
  )
  lines.push('', 'Sheets dealable per difficulty:', ...coverage.map(line => `  ${line}`))
  return `${lines.join('\n')}\n`
}
