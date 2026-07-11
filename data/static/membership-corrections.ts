import type { OrganizationVector } from '~~/types/organization.type'

type OrgId = keyof typeof OrganizationVector

/**
 * Hand-maintained corrections to organization membership.
 *
 * Membership is parsed from the CIA Factbook's loose "International organization
 * participation" text, which lags real-world changes and lists associate/partner
 * ties as full membership. This overlay fixes known errors: `remove` strips a
 * stale membership, `add` grants one the Factbook omits. Keys are ISO 3166-1
 * alpha-2. Applied after the Factbook parse in create-countries-file.ts.
 *
 * Update when membership changes (a country joins/leaves), then re-run
 * `generate:countries`. Keep an eye on: EU accessions, NATO enlargement,
 * OPEC entries/exits, OECD accessions.
 */
export const MEMBERSHIP_CORRECTIONS: {
  [isoCode: string]: { add?: OrgId[]; remove?: OrgId[] }
} = {
  // Left the EU on 2020-01-31 (Brexit); Factbook still lists it.
  GB: { remove: ['eu'] },
  // Suspended OPEC membership in 2020; Factbook still lists it.
  EC: { remove: ['opec'] },
  // Left OPEC on 2019-01-01; Factbook still lists it.
  QA: { remove: ['opec'] },
  // Factbook lists India under OECD, but India is a key partner, not a member.
  IN: { remove: ['oecd'] },
  // OECD members the Factbook text omits: Chile (2010), Latvia (2016),
  // Colombia (2020), Costa Rica (2021).
  CL: { add: ['oecd'] },
  LV: { add: ['oecd'] },
  CO: { add: ['oecd'] },
  CR: { add: ['oecd'] },
  // OPEC members the Factbook text omits: Equatorial Guinea (2017),
  // Congo (2018), Gabon (rejoined 2016; also AU-suspended, below).
  GQ: { add: ['opec'] },
  CG: { add: ['opec'] },
  // Withdrew from the Belt and Road Initiative in December 2023.
  IT: { remove: ['bri'] },
  // Suspended from AU activities after coups, but still member states;
  // Factbook drops them entirely.
  BF: { add: ['au'] },
  GA: { add: ['au', 'opec'] },
  GN: { add: ['au'] },
  ML: { add: ['au'] },
  NE: { add: ['au'] },
  SD: { add: ['au'] },
}
