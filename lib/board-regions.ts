import {
  boardRegions,
  isValidGameVariant,
  type BoardRegion,
  type Game,
  type GameVariant,
} from '~~/types/game.types'

export const regionsForVariant = (variant: GameVariant): BoardRegion[] =>
  variant === 'world' ? [] : [variant]

/** Deduped and in picker order, so one board always reads (and keys) the same. */
export const normalizeBoardRegions = (regions: readonly BoardRegion[]): BoardRegion[] =>
  boardRegions.filter(region => regions.includes(region))

export const isWorldBoard = (regions: readonly BoardRegion[]): boolean => !regions.length

/** The lobby's pick: World clears the board, a continent toggles in or out —
 *  and dropping the last one leaves the whole world. */
export const toggleBoardRegion = (
  regions: readonly BoardRegion[],
  picked: GameVariant
): BoardRegion[] => {
  if (picked === 'world') return []
  return regions.includes(picked)
    ? regions.filter(region => region !== picked)
    : normalizeBoardRegions([...regions, picked])
}

/** The single variant a pre-regions bundle reads a board as: a combined board
 *  degrades to the world, which still deals every country on it. */
export const legacyVariantFor = (regions: readonly BoardRegion[]): GameVariant =>
  regions.length === 1 ? regions[0] : 'world'

/**
 * Brings a game to both shapes in place: `regions` for current code, filled
 * from a pre-regions save's `variant`, and `variant` mirrored back for bundles
 * loaded before the change, which survive deploys and still read it. The
 * server runs this on every fetch and save, the client on every snapshot.
 */
export const syncLegacyBoard = (game: Game): void => {
  const legacy = game as Game & { variant?: GameVariant }
  legacy.regions ??= regionsForVariant(legacy.variant ?? 'world')
  legacy.variant = legacyVariantFor(legacy.regions)
  for (const { groupChallenge } of game.rounds ?? []) {
    const scoped = groupChallenge as { scope?: BoardRegion | BoardRegion[] } | undefined
    if (scoped && typeof scoped.scope === 'string') scoped.scope = [scoped.scope]
  }
}

/** A pre-regions host's settings form sends `variant`; read it as its board. */
export const upgradeLegacyConfiguration = (configuration: unknown): unknown => {
  if (!configuration || typeof configuration !== 'object' || 'regions' in configuration) {
    return configuration
  }
  const { variant } = configuration as { variant?: unknown }
  return isValidGameVariant(variant)
    ? { ...configuration, regions: regionsForVariant(variant) }
    : configuration
}
