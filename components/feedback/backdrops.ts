import { defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { CHALLENGE_GROUP_BY_KIND } from '~~/types/challenges/challenge-groups.type'
import type { ChallengeGroupId } from '~~/types/challenges/challenge-groups.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'

// Each ground is fetched only when its category is dealt: statically
// importing all fourteen put every backdrop in one chunk that every
// interstitial parsed to show one.
const BlocDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/BlocDrift.vue')
)
const ConflictDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/ConflictDrift.vue')
)
const DisputedDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/DisputedDrift.vue')
)
const EmpireDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/EmpireDrift.vue')
)
const FlagDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/FlagDrift.vue')
)
const LanguageDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/LanguageDrift.vue')
)
const PlaceDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/PlaceDrift.vue')
)
const SkylineDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/SkylineDrift.vue')
)
const PoliticsDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/PoliticsDrift.vue')
)
const RouteDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/RouteDrift.vue')
)
const SocietyDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/SocietyDrift.vue')
)
const TrendDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/TrendDrift.vue')
)
const WaterDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/WaterDrift.vue')
)
const WordDrift = defineAsyncComponent(
  () => import('~~/components/feedback/backdrops/WordDrift.vue')
)

/**
 * What a category's card is dressed with. A backdrop is DECORATION: it may
 * know which round is coming, but nothing about the seat, the answers or the
 * clock — so it can never become a second way to read game state.
 */
export interface InterstitialBackdropContext {
  kind: RoundChallengeKind
  group: ChallengeGroupId
  /** Stable per round, so every seat at the table sees one layout. */
  seed: number
}

export interface InterstitialBackdrop {
  component: Component
  props: (context: InterstitialBackdropContext) => Record<string, unknown> | undefined
  /** A drifting wall and an expanding ripple fight for the same eye; a line
   *  field does not. Say which. */
  ripple?: 'keep' | 'replace'
}

/**
 * One entry per branded category — REAL imports, because `resolveComponent`
 * only resolves literal names and a dynamic one renders inert elements
 * (the lesson REGION_MAP_COMPONENTS already paid for).
 *
 * Partial on purpose, and that IS the degradation story: a group with no entry
 * renders exactly the card it renders today. No fallback component, no `v-if`
 * ladder, nothing to keep in sync — a category ships when its art is ready.
 * Keyed on the group rather than the kind so a new mode inherits its
 * category's ground for free; 'core' cannot appear, which is correct, since
 * ranking and two truths are the floor rather than a theme.
 */
export const INTERSTITIAL_BACKDROPS: Partial<Record<ChallengeGroupId, InterstitialBackdrop>> = {
  politics: {
    component: PoliticsDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'replace',
  },
  conflicts: {
    component: ConflictDrift,
    props: ({ seed }) => ({ seed }),
    // A swarm of points and an expanding ring are different gestures; the
    // ripple still reads as the card's own flourish over them.
    ripple: 'keep',
  },
  empires: {
    component: EmpireDrift,
    props: ({ seed }) => ({ seed }),
    // Rings over surfacing borders read as a second set of borders.
    ripple: 'replace',
  },
  navigation: {
    component: RouteDrift,
    props: ({ seed }) => ({ seed }),
    // The lattice is already made of arcs.
    ripple: 'replace',
  },
  water: {
    component: WaterDrift,
    props: ({ seed }) => ({ seed }),
    // Concentric rings ARE the contour idiom this borrows; two at once is one
    // too many.
    ripple: 'replace',
  },
  flags: {
    component: FlagDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
  language: {
    component: LanguageDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
  cities: {
    component: SkylineDrift,
    props: ({ seed }) => ({ seed }),
    // The band sits below the copy rather than behind it, so the ripple still
    // has the middle to itself.
    ripple: 'keep',
  },
  places: {
    component: PlaceDrift,
    props: ({ seed }) => ({ seed }),
    // Pin rings and a ripple are the same shape.
    ripple: 'replace',
  },
  blocs: {
    component: BlocDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'replace',
  },
  trends: {
    component: TrendDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
  society: {
    component: SocietyDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
  disputed: {
    component: DisputedDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
  culture: {
    component: WordDrift,
    props: ({ seed }) => ({ seed }),
    ripple: 'keep',
  },
}

/** The one resolver. Undefined when the round's category has no art yet. */
export const backdropFor = (
  kind: RoundChallengeKind | undefined,
  seed: number
):
  | {
      component: Component
      props: Record<string, unknown>
      ripple: 'keep' | 'replace'
    }
  | undefined => {
  if (!kind) return undefined
  const group = CHALLENGE_GROUP_BY_KIND[kind]
  if (group === 'core') return undefined
  const entry = INTERSTITIAL_BACKDROPS[group]
  const props = entry?.props({ kind, group, seed })
  if (!entry || !props) return undefined
  return { component: entry.component, props, ripple: entry.ripple ?? 'keep' }
}
