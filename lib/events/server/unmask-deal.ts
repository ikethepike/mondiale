import { UNMASK_LOGOS, UNMASK_PORTRAITS } from '~~/data/unmask.gen'
import { sample } from '~~/lib/arrays'
import { isWorldBoard } from '~~/lib/board-regions'
import { COUNTRIES } from '~~/data/countries.gen'
import { playableCountries } from '~~/lib/game-rules'
import { chainContenders } from '~~/lib/player'
import {
  decodePixels,
  downsamplePixels,
  encodePixels,
  narrowFields,
  unmaskFacts,
  unmaskInitials,
  unmaskPortraitKey,
  type UnmaskFacts,
} from '~~/lib/unmask'
import { UNMASK_SOURCE_SIZE, UNMASK_TUNING } from '~~/lib/unmask-pace'
import type {
  UnmaskChallenge,
  UnmaskClue,
  UnmaskRungKind,
} from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Unmask's dealer: the subject, every rung's contents and the field after
 * each. Reached only through `loadUnmaskAnswers`, so no portrait source ships
 * in a production client build.
 */

/** Fewer suspects than this and the map is a coin flip, not a lineup. */
const MIN_SUSPECTS = 4

const portraitPixels = (facts: UnmaskFacts): string | undefined =>
  UNMASK_PORTRAITS[unmaskPortraitKey(facts.leader)]

const population = (isoCode: ISOCountryCode) => COUNTRIES[isoCode]?.people.population?.amount ?? 0

const clueFor = (
  kind: UnmaskRungKind,
  facts: UnmaskFacts,
  portrait: { source: Uint8Array; size: number } | undefined,
  game: Game
): UnmaskClue | undefined => {
  switch (kind) {
    case 'portrait': {
      if (!portrait) return undefined
      const pixels =
        portrait.size === UNMASK_SOURCE_SIZE
          ? portrait.source
          : downsamplePixels(portrait.source, UNMASK_SOURCE_SIZE, portrait.size)
      return { kind, size: portrait.size, pixels: encodePixels(pixels) }
    }
    case 'region':
      return isWorldBoard(game.regions) ? { kind, region: facts.region } : undefined
    case 'born':
      return facts.born ? { kind, decade: facts.born } : undefined
    case 'tenure':
      return facts.since ? { kind, since: facts.since } : undefined
    case 'office':
      return { kind, office: facts.office }
    case 'party':
      return facts.band ? { kind, band: facts.band } : undefined
    case 'logo': {
      const logo = facts.logo && UNMASK_LOGOS[facts.logo.path]
      return logo
        ? { kind, logo, ...(facts.logo?.ratio ? { ratio: facts.logo.ratio } : {}) }
        : undefined
    }
    case 'initials':
      return { kind, initials: unmaskInitials(facts.leader.name) }
    case 'name':
      return { kind, name: facts.leader.name }
  }
}

export const dealUnmask = (
  game: Game,
  maximumPoints: number,
  /** Deal this subject when it holds a file (the harness, the tests). */
  subject?: ISOCountryCode
): UnmaskChallenge | undefined => {
  const tuning = UNMASK_TUNING[game.difficulty]
  const files = new Map<ISOCountryCode, UnmaskFacts>()
  for (const isoCode of playableCountries(game)) {
    const facts = unmaskFacts(isoCode)
    if (facts && portraitPixels(facts)) files.set(isoCode, facts)
  }
  // One person answering for two countries (a shared monarch, a co-prince)
  // would make both of them right.
  const byName = new Map<string, number>()
  for (const facts of files.values()) {
    byName.set(facts.leader.name, (byName.get(facts.leader.name) ?? 0) + 1)
  }
  const suspects = [...files.keys()].filter(
    isoCode => byName.get(files.get(isoCode)!.leader.name) === 1
  )
  if (suspects.length < MIN_SUSPECTS) return undefined

  const country =
    subject && suspects.includes(subject)
      ? subject
      : sample([...suspects].sort((a, b) => population(b) - population(a)).slice(0, tuning.reach))
  const facts = country ? files.get(country) : undefined
  const pixels = facts ? portraitPixels(facts) : undefined
  if (!country || !facts || !pixels) return undefined
  const source = decodePixels(pixels)

  const rungs: UnmaskRungKind[] = []
  const clues: UnmaskClue[] = []
  let tier = 0
  for (const kind of tuning.ladder) {
    const size = kind === 'portrait' ? tuning.tiers[tier++] : undefined
    const clue = clueFor(kind, facts, size ? { source, size } : undefined, game)
    if (!clue) continue
    rungs.push(kind)
    clues.push(clue)
  }

  return {
    _type: 'unmask-challenge',
    rungs,
    secondsPerRung: tuning.secondsPerRung,
    maximumPoints,
    suspects,
    state: { briefing: true, ready: [], order: chainContenders(game) },
    sealed: {
      country,
      clues,
      fields: narrowFields(suspects, clues, isoCode => files.get(isoCode), tuning.floor),
    },
  }
}
