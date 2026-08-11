import { chamberName, chamberSeats, playableChambers, seatingOrder, type Bench } from './parties'
import { playableCountries } from './game-rules'
import { colorDistance } from './palette'
import { sample } from './arrays'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The Parliament round's deal rules — how many benches a player places, how
 * many seats the arc draws, and which chambers are worth dealing at all.
 *
 * Both ends import this: the dealer builds the round from it and the view
 * draws from the dealt payload, so the arc a player sees and the answer the
 * server grades are the same chamber by construction.
 */

/**
 * Benches placed, by difficulty. The rest of the chamber is drawn but already
 * seated — a full parliament is 8+ blocs and dragging all of them is a chore,
 * not a question.
 */
export const PARLIAMENT_BENCHES: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 4,
  hard: 5,
}

/** A chamber under this many benches has no shape worth reading. */
export const MIN_BENCHES = 3

/**
 * Seats the arc draws. Real chambers run from 51 (Suriname) to 630 (Germany),
 * and drawing one dot per seat would be a wall of dots on a phone at the top
 * of that range. The arc is scaled to this and each dot stands for a share.
 */
export const MAX_SEAT_DOTS = 180

export const PARLIAMENT_SECONDS = 75

/**
 * Two seat colours closer than this are one colour to a player looking at a
 * dot on an arc. Set at the board's own tile-top floor — the same threshold
 * that keeps two gates from looking alike.
 */
export const SEAT_COLOUR_FLOOR = 12

const tooCloseToTell = (a: string, b: string) => colorDistance(a, b) < SEAT_COLOUR_FLOOR

/**
 * A bench is placeable only if it can be TOLD APART on the arc — a logo to
 * drag, or a colour the seats can take. A bench with neither is drawn as part
 * of the chamber but never asked about.
 */
export const isPlaceable = (bench: Bench): boolean =>
  // A bench that won no seats is drawn nowhere on the arc, so asking a player
  // to place it has no answer. Germany's 2025 infobox lists the FDP at 0.
  bench.seats > 0 && !!(bench.party?.logo || bench.party?.colors)

/**
 * Chambers that will actually deal, at the HARDEST difficulty they might be
 * asked for.
 *
 * The pool asks the dealer rather than re-deriving its rules: a chamber can
 * clear `MIN_BENCHES` and still fail once same-coloured benches are dropped
 * (Albania's roster does), and a pool that offered it would hand the round a
 * country it cannot use.
 */
export const parliamentPool = (
  rules: GameRules,
  difficulty: GameDifficulty = 'hard'
): ISOCountryCode[] => {
  const playable = new Set(playableCountries(rules))
  return playableChambers(MIN_BENCHES).filter(
    isoCode => playable.has(isoCode) && !!buildDeal(isoCode, difficulty)
  )
}

export interface ParliamentDeal {
  country: ISOCountryCode
  /** Every bench in SEATING order, left to right — the arc as drawn. */
  benches: {
    name: string
    seats: number
    share: number
    logo?: string
    color?: string
    /** Its transnational family (EPP, Progressive Alliance) — a hint rung. */
    grouping?: string
    /** Placed by the player rather than pre-seated. */
    asked: boolean
  }[]
  totalSeats: number
  /**
   * The house, when the data names one — "Sejm", "Chamber of Deputies". A
   * bicameral country's lower house has a name worth teaching, and the arc is
   * only ever that house, so saying which is honest as well as interesting.
   */
  chamber?: string
}

/**
 * Deal a chamber. The benches asked about are the LARGEST placeable ones:
 * a round that asked a player to place a one-seat party would be a lottery,
 * and the big blocs are the ones whose share is worth knowing.
 */
const buildDeal = (
  country: ISOCountryCode,
  difficulty: GameDifficulty
): ParliamentDeal | undefined => {
  const seated = seatingOrder(country)
  const total = chamberSeats(country)
  if (!seated.length || !total) return undefined

  // Largest first: placing a one-seat party is a lottery, and the big blocs
  // are the ones whose share is worth knowing.
  const candidates = [...seated].filter(isPlaceable).sort((a, b) => b.seats - a.seats)

  // Two asked benches wearing the same colour make the colour hint a coin
  // flip. Exact equality is not enough: the Netherlands runs the VVD and PVV
  // both at #234672, but Sweden's Left Party (#ED1C24) and Social Democrats
  // (#ED1B34) are two different reds no eye separates on a seat dot. Keep the
  // larger and pass over the other; it is still drawn, just never asked.
  const takenColours: string[] = []
  const picked: Bench[] = []
  for (const bench of candidates) {
    if (picked.length >= PARLIAMENT_BENCHES[difficulty]) break
    const colour = bench.party?.colors?.[0]
    if (colour && takenColours.some(taken => tooCloseToTell(taken, colour))) continue
    if (colour) takenColours.push(colour)
    picked.push(bench)
  }

  const asked = new Set(picked.map(bench => bench.name))
  if (asked.size < MIN_BENCHES) return undefined

  // The article title leaks into `chamber` for most countries ("2023 Polish
  // parliamentary election"); only a real house name is worth showing.
  const house = chamberName(country)

  return {
    country,
    totalSeats: total,
    ...(house ? { chamber: house } : {}),
    benches: seated.map(bench => ({
      name: bench.name,
      seats: bench.seats,
      share: bench.share,
      ...(bench.party?.logo ? { logo: bench.party.logo } : {}),
      ...(bench.party?.colors?.[0] ? { color: `#${bench.party.colors[0]}` } : {}),
      ...(bench.groupings?.[0] ? { grouping: bench.groupings[0] } : {}),
      asked: asked.has(bench.name),
    })),
  }
}

/**
 * Deal a chamber — a named one, or any the pool offers.
 *
 * The pool is defined as "chambers `buildDeal` accepts", so the two can never
 * disagree about what is dealable: a country that clears MIN_BENCHES but loses
 * benches to the colour guard is absent from both.
 */
export const dealParliament = (
  rules: GameRules,
  difficulty: GameDifficulty,
  isoCode?: ISOCountryCode
): ParliamentDeal | undefined => {
  const country = isoCode ?? sample(parliamentPool(rules, difficulty))
  return country ? buildDeal(country, difficulty) : undefined
}

/** The benches a player has to place, in the order the arc draws them. */
export const askedBenches = (deal: ParliamentDeal) => deal.benches.filter(bench => bench.asked)

/**
 * Seat colours, adjusted so NEIGHBOURING benches can be told apart.
 *
 * The arc seats allies side by side, and allies wear near-identical colours:
 * Sweden's Left Party (#ED1C24) and Social Democrats (#ED1B34) are ΔE 8 apart,
 * so drawn as-is they merge into one red block and the chamber looks like it
 * holds one bloc where it holds two. Where two adjacent benches collide, the
 * LATER one is darkened until it separates — the party's own colour is kept
 * wherever it can be.
 */
const separated = (benches: ParliamentDeal['benches']): string[] => {
  const out: string[] = []
  for (const [index, bench] of benches.entries()) {
    let colour = bench.color ?? ''
    const previous = out[index - 1]
    if (colour && previous) {
      let attempt = 0
      while (colorDistance(colour, previous) < SEAT_COLOUR_FLOOR && attempt < 6) {
        colour = shade(colour, -0.14)
        attempt += 1
      }
    }
    out.push(colour)
  }
  return out
}

/** Move a hex colour toward black (negative) or white (positive). */
const shade = (hex: string, amount: number): string => {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
  return `#${channels
    .map(channel => {
      const moved = amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount
      return Math.round(Math.min(255, Math.max(0, moved)))
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

/** Every bench's drawn colour, in arc order — neighbours guaranteed distinct. */
export const benchColors = (deal: ParliamentDeal): Record<string, string> =>
  Object.fromEntries(
    separated(deal.benches)
      .map((colour, index) => [deal.benches[index]!.name, colour] as const)
      .filter(([, colour]) => !!colour)
  )

/**
 * How the arc's dots divide between benches. Seats are scaled to `MAX_SEAT_DOTS`
 * so a 630-seat chamber and a 51-seat one draw at the same size, and every
 * bench keeps at least one dot — a bloc that held seats must never vanish.
 */
export const seatDots = (deal: ParliamentDeal): { name: string; dots: number }[] => {
  const scale = Math.min(1, MAX_SEAT_DOTS / deal.totalSeats)
  return deal.benches.map(bench => ({
    name: bench.name,
    dots: Math.max(1, Math.round(bench.seats * scale)),
  }))
}
