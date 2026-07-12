import type { ChallengeTopic } from '~~/types/challenge.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

/**
 * Thin-outline emblems for stat cards, drawn in the shared stroke language
 * (24x24 viewBox, stroke-only currentColor at width 1.5, round caps/joins,
 * artwork kept inside roughly x/y 3-21). Every glyph is paths + circles only;
 * StatTopicIcon.vue renders them. Resolution: bespoke stat glyph by accessor
 * id, else the topic emblem, else a bar chart.
 */
export interface Glyph {
  paths?: string[]
  circles?: [number, number, number][]
}

export const TOPIC_GLYPHS: Record<ChallengeTopic, Glyph> = {
  // A lightbulb: the catch-all topic for indices and composite measures.
  'general knowledge': {
    paths: [
      'M12 3.5a5.5 5.5 0 0 1 3.2 10c-.8.6-1.2 1.3-1.2 2.1h-4c0-.8-.4-1.5-1.2-2.1A5.5 5.5 0 0 1 12 3.5z',
      'M10 18.5h4',
      'M10.8 21h2.4',
    ],
  },
  economics: {
    paths: ['M3.5 7.5h17v10h-17z', 'M6.5 7.5v-2'],
    circles: [[12, 12.5, 2.6]],
  },
  education: {
    paths: [
      'M12 6.5C10 4.8 6.5 4.5 4 5.4v13c2.5-.9 6-.6 8 1.1 2-1.7 5.5-2 8-1.1v-13c-2.5-.9-6-.6-8 1.1z',
      'M12 6.5v13',
    ],
  },
  energy: {
    paths: ['M13 3 6.5 13.5h5L10.5 21l7-10.5h-5z'],
  },
  environment: {
    paths: ['M5 19C5 10.5 10.5 5 19.5 4.5 19.5 13.5 14 19 5.5 19z', 'M5 19c3-5 6-8 10-10'],
  },
  gender: {
    paths: [
      'M4.5 18c0-3 1.5-4.5 4-4.5 1.1 0 2 .3 2.7.8',
      'M19.5 18c0-3-1.5-4.5-4-4.5-1.1 0-2 .3-2.7.8',
    ],
    circles: [
      [8.5, 8, 2.5],
      [15.5, 8, 2.5],
    ],
  },
  geography: {
    paths: ['M3 18 8.5 8l4 6.5', 'M10.5 18 15 10.5 21 18', 'M3 18h18'],
  },
  health: {
    paths: [
      'M12 19.5C7 15.5 4 12.5 4 9.5 4 7 6 5.5 8 5.5c1.6 0 3.2.9 4 2.5.8-1.6 2.4-2.5 4-2.5 2 0 4 1.5 4 4 0 3-3 6-8 10z',
    ],
  },
  // Scales of justice.
  'human rights': {
    paths: [
      'M12 4.5v15',
      'M8.5 19.5h7',
      'M5.5 7h13',
      'M5.5 7 3.1 12.5a2.4 2.4 0 0 0 4.8 0z',
      'M18.5 7l-2.4 5.5a2.4 2.4 0 0 0 4.8 0z',
    ],
  },
  infrastructure: {
    paths: ['M3 17h18', 'M6 17v-6', 'M18 17v-6', 'M4 11c3.5-4 12.5-4 16 0'],
  },
  people: {
    paths: ['M5.5 19.5c0-4 2.5-6 6.5-6s6.5 2 6.5 6'],
    circles: [[12, 7.5, 3]],
  },
  religion: {
    paths: ['M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z'],
  },
  unemployment: {
    paths: ['M4 8.5h16v10H4z', 'M9 8.5V7c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v1.5', 'M4 13h16'],
  },
}

// Not stat topics: the photo clue and the gate hint buttons borrow the same
// glyph language.
export type UtilityGlyphKey = 'photo' | 'reveal' | 'question'

export const UTILITY_GLYPHS: Record<UtilityGlyphKey, Glyph> = {
  photo: {
    paths: ['M3.5 7.5h17v11h-17z', 'M8.5 7.5 10 5h4l1.5 2.5'],
    circles: [[12, 13, 3.2]],
  },
  reveal: {
    paths: ['M2.5 12C4.6 7.7 8 5.5 12 5.5s7.4 2.2 9.5 6.5c-2.1 4.3-5.5 6.5-9.5 6.5S4.6 16.3 2.5 12z'],
    circles: [[12, 12, 2.9]],
  },
  question: {
    paths: ['M9.3 9.2a2.75 2.75 0 1 1 4 2.45c-.85.45-1.3 1.05-1.3 1.95', 'M12 16.9v.01'],
    circles: [[12, 12, 8.6]],
  },
}

// Bench glyphs: not yet bound to any stat — a ready supply for future stats
// and modes. Addressed through the same `topic` string channel.
export type DepartmentGlyphKey =
  | 'department.agriculture'
  | 'department.communications'
  | 'department.culture'
  | 'department.defense'
  | 'department.education'
  | 'department.energy'
  | 'department.environment'
  | 'department.finance'
  | 'department.foreignAffairs'
  | 'department.health'
  | 'department.interior'
  | 'department.justice'
  | 'department.labor'
  | 'department.science'
  | 'department.trade'
  | 'department.transport'

export const DEPARTMENT_GLYPHS: Record<DepartmentGlyphKey, Glyph> = {
  // Ear of wheat.
  'department.agriculture': {
    paths: [
      'M12 20.5v-12',
      'M12 8.5c-1.2-1.2-1.2-3.3 0-5 1.2 1.7 1.2 3.8 0 5z',
      'M12 12.5c-2.6 0-4.2-1.4-4.2-3.7 2.6 0 4.2 1.4 4.2 3.7z',
      'M12 12.5c2.6 0 4.2-1.4 4.2-3.7-2.6 0-4.2 1.4-4.2 3.7z',
      'M12 17c-2.6 0-4.2-1.4-4.2-3.7 2.6 0 4.2 1.4 4.2 3.7z',
      'M12 17c2.6 0 4.2-1.4 4.2-3.7-2.6 0-4.2 1.4-4.2 3.7z',
    ],
  },
  // Radio mast.
  'department.communications': {
    paths: [
      'M12 8.5 8 20.5',
      'M12 8.5l4 12',
      'M9.8 14h4.4',
      'M7.3 5a6.6 6.6 0 0 1 9.4 0',
      'M9.2 6.6a3.9 3.9 0 0 1 5.6 0',
    ],
  },
  // Classical column.
  'department.culture': {
    paths: [
      'M6 4.5h12',
      'M7.5 7h9',
      'M8.5 7v9.5',
      'M12 7v9.5',
      'M15.5 7v9.5',
      'M7.5 16.5h9',
      'M6 19.5h12',
    ],
  },
  // Shield with a star.
  'department.defense': {
    paths: [
      'M12 3.5 19 6.2v5.3c0 4.4-2.7 7.4-7 9.2-4.3-1.8-7-4.8-7-9.2V6.2z',
      'M12 7.5l1.1 2.3 2.3 1.1-2.3 1.1L12 14.3l-1.1-2.3-2.3-1.1 2.3-1.1z',
    ],
  },
  // Schoolhouse.
  'department.education': {
    paths: ['M4.5 19.5v-9L12 5l7.5 5.5v9z', 'M10 19.5V14h4v5.5'],
    circles: [[12, 10.2, 1.2]],
  },
  // Battery.
  'department.energy': {
    paths: [
      'M5.5 8.5h11.5A1.5 1.5 0 0 1 18.5 10v4a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 14v-4a1.5 1.5 0 0 1 1.5-1.5z',
      'M20 10.5v3',
      'M7.5 11v2',
      'M10.5 11v2',
    ],
  },
  // Circular arrows.
  'department.environment': {
    paths: [
      'M4.5 12a7.5 7.5 0 0 1 7.5-7.5c2.2 0 4.2.9 5.6 2.3L19.5 8.5',
      'M19.5 4.5v4h-4',
      'M19.5 12a7.5 7.5 0 0 1-7.5 7.5c-2.2 0-4.2-.9-5.6-2.3L4.5 15.5',
      'M4.5 19.5v-4h4',
    ],
  },
  // Bank portico.
  'department.finance': {
    paths: [
      'M3.5 9.5 12 4.5l8.5 5z',
      'M6 11.5v5.5',
      'M10 11.5v5.5',
      'M14 11.5v5.5',
      'M18 11.5v5.5',
      'M3.5 19.5h17',
    ],
  },
  // Globe with meridian.
  'department.foreignAffairs': {
    paths: [
      'M3.5 12h17',
      'M12 3.5c3.1 2.3 4.7 5.2 4.7 8.5s-1.6 6.2-4.7 8.5c-3.1-2.3-4.7-5.2-4.7-8.5S8.9 5.8 12 3.5z',
    ],
    circles: [[12, 12, 8.5]],
  },
  // First-aid cross.
  'department.health': {
    paths: [
      'M6.5 3.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3z',
      'M12 8v8',
      'M8 12h8',
    ],
  },
  // Key.
  'department.interior': {
    paths: ['M10.4 10.4 20 20', 'M15.5 15.5 13.7 17.3', 'M18.2 18.2 16.4 20'],
    circles: [[7.8, 7.8, 3.6]],
  },
  // Gavel.
  'department.justice': {
    paths: ['M10.3 3.5 15.5 8.7l-3.1 3.1-5.2-5.2z', 'M12 11.5 4.5 19', 'M12.5 20.5h8'],
  },
  // Hard hat.
  'department.labor': {
    paths: ['M3.5 15.5h17', 'M5 15.5a7 7 0 0 1 14 0', 'M10.5 9V5.5h3V9'],
  },
  // Erlenmeyer flask.
  'department.science': {
    paths: [
      'M9.5 3.5h5',
      'M10.5 3.5v5.2L5.2 17.6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.8-2.9L13.5 8.7V3.5',
      'M7.8 14h8.4',
    ],
  },
  // Cargo ship.
  'department.trade': {
    paths: ['M3.5 14.5 5.5 19.5h13l2-5z', 'M6.5 14.5V10h5v4.5', 'M11.5 14.5V12h6v2.5'],
  },
  // Road to the horizon.
  'department.transport': {
    paths: ['M4 20.5 10.5 3.5', 'M20 20.5 13.5 3.5', 'M12 19v-3', 'M12 13v-2.5', 'M12 8v-2'],
  },
}

export type RelationsGlyphKey =
  | 'relations.aid'
  | 'relations.alliance'
  | 'relations.borders'
  | 'relations.diplomacy'
  | 'relations.embassy'
  | 'relations.exports'
  | 'relations.passport'
  | 'relations.peace'
  | 'relations.sanctions'
  | 'relations.summit'
  | 'relations.treaty'
  | 'relations.visa'

export const RELATIONS_GLYPHS: Record<RelationsGlyphKey, Glyph> = {
  // Relief parcel.
  'relations.aid': {
    paths: [
      'M4.5 8.5h15v11h-15z',
      'M4.5 8.5 7 4.5h10l2.5 4',
      'M12 16.8c-2-1.5-3-2.6-3-3.8 0-.9.7-1.5 1.5-1.5.6 0 1.2.3 1.5.9.3-.6.9-.9 1.5-.9.8 0 1.5.6 1.5 1.5 0 1.2-1 2.3-3 3.8z',
    ],
  },
  // Chain link.
  'relations.alliance': {
    paths: [
      'M10.5 13.5a4.2 4.2 0 0 0 6.3.45l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9L12 7',
      'M13.5 10.5a4.2 4.2 0 0 0-6.3-.45l-2.5 2.5a4.2 4.2 0 0 0 5.9 5.9L12 17',
    ],
  },
  // Dashed frontier.
  'relations.borders': {
    paths: [
      'M3.5 5.5h17v13h-17z',
      'M11 6.5c.6 1 .7 1.9.4 2.9',
      'M11.7 11.2c.5 1 .5 2 .2 3',
      'M12.2 16c.4.8.4 1.6.2 2.4',
    ],
  },
  // Two voices.
  'relations.diplomacy': {
    paths: ['M3.5 4.5h10V11H8.5L6 13.5V11H3.5z', 'M20.5 9.5h-8V16h4.5l2.5 2.5V16h1z'],
  },
  // Mission with flag.
  'relations.embassy': {
    paths: [
      'M6.5 20.5v-17',
      'M6.5 4h5.5v3.5H6.5',
      'M11 20.5v-9h6.5v9',
      'M13.2 14.5v.01',
      'M15.3 14.5v.01',
      'M3.5 20.5h17',
    ],
  },
  // Crate outbound.
  'relations.exports': {
    paths: ['M7 11v8.5h10V11', 'M12 14v-9.5', 'M9.3 7.2 12 4.5l2.7 2.7'],
  },
  // Passport booklet.
  'relations.passport': {
    paths: [
      'M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z',
      'M9 16.5h6',
    ],
    circles: [[12, 10, 3.2]],
  },
  // Peace sign.
  'relations.peace': {
    paths: ['M12 3.5v17', 'M12 12l-6 6', 'M12 12l6 6'],
    circles: [[12, 12, 8.5]],
  },
  // Coin struck through.
  'relations.sanctions': {
    paths: ['M6 6l12 12'],
    circles: [
      [12, 12, 8.5],
      [12, 12, 3.5],
    ],
  },
  // Two parties at the table.
  'relations.summit': {
    paths: [
      'M3.5 13h17',
      'M5.5 13v5.5',
      'M18.5 13v5.5',
      'M4.5 10.5c0-2.3 1.4-3.6 3.5-3.6s3.5 1.3 3.5 3.6',
      'M12.5 10.5c0-2.3 1.4-3.6 3.5-3.6s3.5 1.3 3.5 3.6',
    ],
    circles: [
      [8, 5.6, 2.2],
      [16, 5.6, 2.2],
    ],
  },
  // Sealed accord.
  'relations.treaty': {
    paths: ['M6.5 3.5H15l3.5 3.5v13.5h-12z', 'M15 3.5V7h3.5', 'M9 10.5h6', 'M9 13.5h3.5'],
    circles: [[15, 16.5, 1.8]],
  },
  // Entry stamp.
  'relations.visa': {
    paths: [
      'M5 20.5h14',
      'M4.5 17.5v-1.5A2.5 2.5 0 0 1 7 13.5h10a2.5 2.5 0 0 1 2.5 2.5v1.5z',
      'M14 13.5V9c0-1.5 1-1.5 1-3.5a3 3 0 0 0-6 0c0 2 1 2 1 3.5v4.5',
    ],
  },
}

export type SocietyGlyphKey =
  | 'society.award'
  | 'society.coup'
  | 'society.cuisine'
  | 'society.espionage'
  | 'society.festival'
  | 'society.film'
  | 'society.monarchy'
  | 'society.music'
  | 'society.olympics'
  | 'society.protest'
  | 'society.spaceProgram'
  | 'society.sportsTeam'
  | 'society.tourism'

export const SOCIETY_GLYPHS: Record<SocietyGlyphKey, Glyph> = {
  // Medal on a ribbon.
  'society.award': {
    paths: ['M9.5 13.3 7.5 20.5l4.5-2.5 4.5 2.5-2-7.2'],
    circles: [
      [12, 9, 5],
      [12, 9, 1.8],
    ],
  },
  // The crown, overturned.
  'society.coup': {
    paths: ['M4.5 7.5 3.5 16.5l4.7-3.5L12 18.5l3.8-5.5 4.7 3.5-1-9z'],
  },
  // Fork and knife.
  'society.cuisine': {
    paths: [
      'M7 3.5V7a2.5 2.5 0 0 0 5 0V3.5',
      'M9.5 3.5v17',
      'M15 20.5v-6',
      'M15 14.5c-1-3.5-.7-7.8 1.5-11 1 3.3 1 7.5-1.5 11z',
    ],
  },
  // Fedora and dark glasses.
  'society.espionage': {
    paths: ['M3.5 12.5h17', 'M7 12.5c0-4 1.5-6 5-6s5 2 5 6', 'M10.8 16.5h2.4'],
    circles: [
      [8.5, 16.5, 2.3],
      [15.5, 16.5, 2.3],
    ],
  },
  // Bunting.
  'society.festival': {
    paths: [
      'M3.5 7c5.5 3.2 11.5 3.2 17 0',
      'M5.6 8.1h4.2L7.7 12.5z',
      'M9.9 9.3h4.2L12 13.7z',
      'M14.2 8.1h4.2l-2.1 4.4z',
    ],
  },
  // Clapperboard.
  'society.film': {
    paths: [
      'M4.5 10.5h15v9h-15z',
      'M4.5 10.5 5.5 6l14 1.5-1 3z',
      'M9 6.4l-.7 3',
      'M13 6.8l-.7 3',
    ],
  },
  // The crown, upright.
  'society.monarchy': {
    paths: ['M4.5 16.5 3.5 7.5l4.7 3.5L12 5.5l3.8 5.5 4.7-3.5-1 9z'],
  },
  // Beamed notes.
  'society.music': {
    paths: ['M9.5 17V5.5l8-2V15'],
    circles: [
      [7.5, 17, 2],
      [15.5, 15, 2],
    ],
  },
  // Torch.
  'society.olympics': {
    paths: [
      'M12 3.5c1.5 1.8 2.3 3.2 2.3 4.4a2.3 2.3 0 0 1-4.6 0c0-1.2.8-2.6 2.3-4.4z',
      'M9.5 10.5h5',
      'M9.5 10.5 11 20.5h2l1.5-10',
    ],
  },
  // Placard.
  'society.protest': {
    paths: ['M5.5 4.5h13v7h-13z', 'M12 11.5v9', 'M12 6.3v2.2', 'M12 9.9v.01'],
  },
  // Rocket.
  'society.spaceProgram': {
    paths: [
      'M12 3.5c2.2 1.8 3.3 4.6 3.3 8l-1.3 4h-4l-1.3-4c0-3.4 1.1-6.2 3.3-8z',
      'M8.7 12.5 6.5 16l2.9-.5',
      'M15.3 12.5 17.5 16l-2.9-.5',
      'M12 17.5v3',
    ],
    circles: [[12, 9.5, 1.5]],
  },
  // Trophy.
  'society.sportsTeam': {
    paths: [
      'M8 4.5h8v4.2a4 4 0 0 1-8 0z',
      'M8 5.5H5c0 2.2 1.2 3.5 3.1 3.7',
      'M16 5.5h3c0 2.2-1.2 3.5-3.1 3.7',
      'M12 12.7V16',
      'M9.3 16 8.5 19.5h7L14.7 16',
    ],
  },
  // Rolling luggage.
  'society.tourism': {
    paths: [
      'M8.5 7.5h7A1.5 1.5 0 0 1 17 9v9.5H7V9a1.5 1.5 0 0 1 1.5-1.5z',
      'M10.5 7.5V4.5h3v3',
      'M7 13h10',
    ],
    circles: [
      [9, 19.7, 1],
      [15, 19.7, 1],
    ],
  },
}

// Encyclopedic emblems for political leanings — labels, not endorsements.
export type IdeologyGlyphKey =
  | 'ideology.anarchism'
  | 'ideology.capitalism'
  | 'ideology.centrism'
  | 'ideology.communism'
  | 'ideology.conservatism'
  | 'ideology.fascism'
  | 'ideology.green'
  | 'ideology.liberalism'
  | 'ideology.libertarianism'
  | 'ideology.monarchism'
  | 'ideology.nationalism'
  | 'ideology.populism'
  | 'ideology.progressivism'
  | 'ideology.socialism'

export const IDEOLOGY_GLYPHS: Record<IdeologyGlyphKey, Glyph> = {
  // Circle-A.
  'ideology.anarchism': {
    paths: ['M8 16.5 12 6.5l4 10', 'M9.3 13.7h5.4'],
    circles: [[12, 12, 8.5]],
  },
  // Coin, rising.
  'ideology.capitalism': {
    paths: ['M12 15.5V4.5', 'M9.3 7.2 12 4.5l2.7 2.7'],
    circles: [[12, 13, 6]],
  },
  // Bullseye.
  'ideology.centrism': {
    circles: [
      [12, 12, 8.5],
      [12, 12, 4.8],
      [12, 12, 1.2],
    ],
  },
  // Hammer and sickle.
  'ideology.communism': {
    paths: [
      'M9 3.5a9.5 9.5 0 0 0 8.5 14',
      'M17.5 17.5 20.5 20.5',
      'M11.5 7.5l3-3 5 5-3 3z',
      'M14 10 5.5 18.5',
    ],
  },
  // Oak.
  'ideology.conservatism': {
    paths: [
      'M7 16.5c-1.7 0-3-1.3-3-3 0-1.3.8-2.4 2-2.8C6 8.2 8 6.5 10.4 6.5c.6-1.2 1.9-2 3.3-2 2 0 3.7 1.5 3.9 3.4 1.4.4 2.4 1.7 2.4 3.2 0 1.9-1.5 3.4-3.4 3.4z',
      'M12 16.5v4',
      'M8.5 20.5h7',
    ],
  },
  // Fasces.
  'ideology.fascism': {
    paths: [
      'M10 4.5v16',
      'M12 4.5v16',
      'M14 4.5v16',
      'M9.5 8h5',
      'M9.5 16h5',
      'M14 7c3-.5 4.5 1 4.5 3-2 .8-3.5.5-4.5-.5',
    ],
  },
  // Sprout in a ring.
  'ideology.green': {
    paths: [
      'M12 17v-4.5',
      'M12 12.5c0-2.3-1.6-4-4-4 0 2.3 1.6 4 4 4z',
      'M12 12.5c0-2.3 1.6-4 4-4 0 2.3-1.6 4-4 4z',
    ],
    circles: [[12, 12, 8.5]],
  },
  // Liberty torch.
  'ideology.liberalism': {
    paths: [
      'M12 3.5c1.2 1.4 1.8 2.5 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.9.6-2 1.8-3.4z',
      'M9 9.5c.6 1.2 1.6 1.8 3 1.8s2.4-.6 3-1.8',
      'M12 11.5v9',
    ],
  },
  // Broken chain.
  'ideology.libertarianism': {
    paths: [
      'M9.7 7.7 8.2 6.2a3.5 3.5 0 0 0-5 5l1.5 1.5',
      'M9.7 7.7l1.4 1.4',
      'M4.7 12.7l1.4 1.4',
      'M14.3 16.3l1.5 1.5a3.5 3.5 0 0 0 5-5l-1.5-1.5',
      'M14.3 16.3l-1.4-1.4',
      'M19.3 11.3l-1.4-1.4',
    ],
  },
  // Globus cruciger.
  'ideology.monarchism': {
    paths: ['M6.5 14.5h11', 'M12 8.5V4', 'M9.8 6h4.4'],
    circles: [[12, 14, 6]],
  },
  // Flag with a heart.
  'ideology.nationalism': {
    paths: [
      'M6.5 20.5v-17',
      'M6.5 4.5H18v7H6.5',
      'M12.2 10c-1.4-1-2.1-1.8-2.1-2.7 0-.6.5-1.1 1.1-1.1.4 0 .8.2 1 .6.2-.4.6-.6 1-.6.6 0 1.1.5 1.1 1.1 0 .9-.7 1.7-2.1 2.7z',
    ],
  },
  // Megaphone.
  'ideology.populism': {
    paths: ['M6 9.5 17.5 5v13L6 14.5z', 'M3.5 10h2.5v4H3.5z', 'M19.3 9.5a4.3 4.3 0 0 1 0 5'],
  },
  // Sunrise.
  'ideology.progressivism': {
    paths: [
      'M3.5 17h17',
      'M7.5 17a4.5 4.5 0 0 1 9 0',
      'M12 9V6.5',
      'M7 11.5 5.2 9.7',
      'M17 11.5l1.8-1.8',
    ],
  },
  // Rose.
  'ideology.socialism': {
    paths: [
      'M12 6.5c1.4 0 2.5 1 2.5 2.3S13.4 11 12 11',
      'M12 13v7.5',
      'M12 16.5c0-1.8-1.3-3-3.2-3 0 1.8 1.3 3 3.2 3z',
      'M12 18c0-1.8 1.3-3 3.2-3 0 1.8-1.3 3-3.2 3z',
    ],
    circles: [[12, 8.7, 4.3]],
  },
}

export const FALLBACK_GLYPH: Glyph = { paths: ['M5 19v-7', 'M10 19V7', 'M15 19v-5', 'M20 19V9'] }

// One bespoke emblem per stat. Same-topic siblings stay visually related but
// each carries the stat's own motif, so a card reads at a glance.
export const STAT_GLYPHS: Record<GroupChallengeAccessorId, Glyph> = {
  // — economics —
  // Person beside a coin.
  'economics.gdpPerCapita': {
    paths: ['M3.5 18c0-3.4 2-5.2 5-5.2s5 1.8 5 5.2', 'M17.5 8v3'],
    circles: [
      [8.5, 7.5, 2.5],
      [17.5, 9.5, 3],
    ],
  },
  // Shield.
  'economics.militarySpending': {
    paths: ['M12 3.5 19 6.2v5.3c0 4.4-2.7 7.4-7 9.2-4.3-1.8-7-4.8-7-9.2V6.2z'],
  },
  // Person under the line.
  'economics.populationBelowPovertyLine': {
    paths: ['M4 5.5h16', 'M6.5 19.5c0-3.4 2.2-5.2 5.5-5.2s5.5 1.8 5.5 5.2'],
    circles: [[12, 10.5, 2.5]],
  },
  // Equals sign (Gini).
  'economics.equality': {
    paths: ['M8.5 10h7', 'M8.5 14h7'],
    circles: [[12, 12, 8.5]],
  },
  // Rising balloon.
  'economics.inflation': {
    paths: ['M12 14.5l-1.1 1.7h2.2z', 'M12 16.2c-1.3 1.5.9 2.6-.5 4.3'],
    circles: [[12, 9, 5.5]],
  },
  // Globe of bars.
  'economics.gdpTotal': {
    paths: ['M8.3 15.5V12', 'M12 15.5v-7', 'M15.7 15.5v-5'],
    circles: [[12, 12, 8.5]],
  },
  // Climbing trend arrow.
  'economics.gdpGrowth': {
    paths: ['M3.5 18.5 9 13l3.5 3L20.5 8', 'M15.8 8h4.7v4.7'],
  },
  // A weight to carry.
  'economics.publicDebt': {
    paths: [
      'M9.5 9.5V8a2.5 2.5 0 0 1 5 0v1.5',
      'M7.5 9.5h9l1.8 8.2a1.5 1.5 0 0 1-1.5 1.8H7.2a1.5 1.5 0 0 1-1.5-1.8z',
    ],
  },

  // — geography —
  // Rolling hill under the sun.
  'geography.area.land': {
    paths: ['M3 18.5c2.5-5.5 5.5-8.5 9-8.5s6.5 3 9 8.5z'],
    circles: [[17, 6, 2.2]],
  },
  // Water drop.
  'geography.area.water': {
    paths: [
      'M12 3.5c3.6 4.4 5.4 7.4 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-2.5 1.8-5.5 5.4-9.9z',
      'M9.4 14c.9.9 1.7.9 2.6 0s1.7-.9 2.6 0',
    ],
  },
  // Folded map.
  'geography.area.total': {
    paths: ['M3.5 6.5 9.2 4.5l5.6 2 5.7-2v13l-5.7 2-5.6-2-5.7 2z', 'M9.2 4.5v13', 'M14.8 6.5v13'],
  },
  // Sprout in tilled soil.
  'geography.area.arable': {
    paths: [
      'M12 20.5V14',
      'M12 14c0-3.2-2.2-5.5-5.5-5.5 0 3.2 2.2 5.5 5.5 5.5z',
      'M12 14c0-3.2 2.2-5.5 5.5-5.5 0 3.2-2.2 5.5-5.5 5.5z',
      'M6.5 20.5h11',
    ],
  },
  // Pine tree.
  'geography.area.forested': {
    paths: ['M12 3.5 7.5 9.5h2.3L6 15.5h12l-3.8-6h2.3z', 'M12 15.5v5'],
  },
  // Summit flag.
  'geography.highestPeak': {
    paths: ['M3.5 19.5 11.5 6 20 19.5z', 'M11.5 6V3', 'M11.5 3H16l-1.6 1.5L16 6h-4.5'],
  },

  // — unemployment —
  // Briefcase, work falling away.
  'unemployment.total': {
    paths: [
      'M4 8.5h16v10H4z',
      'M9 8.5V7c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v1.5',
      'M12 11v5',
      'M9.8 13.8 12 16l2.2-2.2',
    ],
  },
  // A young person, prospects pointing down.
  'unemployment.youth': {
    paths: ['M4 18.5c0-3.4 2-5.2 5-5.2s5 1.8 5 5.2', 'M18.5 10v6', 'M16.3 13.8 18.5 16l2.2-2.2'],
    circles: [[9, 7.5, 2.6]],
  },

  // — infrastructure —
  // Converging rails with sleepers.
  'infrastructure.rail': {
    paths: ['M9 3.5 6.5 20.5', 'M15 3.5l2.5 17', 'M7.9 8.5h8.2', 'M7.2 13.5h9.6', 'M6.6 18h10.8'],
  },
  // Wifi waves.
  'infrastructure.internetAccess': {
    paths: ['M3.5 10.5c4.8-4.7 12.2-4.7 17 0', 'M6.5 13.8c3.2-3 7.8-3 11 0'],
    circles: [[12, 17.2, 0.9]],
  },
  // Handset.
  'infrastructure.mobileSubscriptions': {
    paths: [
      'M8 3.5h8c.8 0 1.5.7 1.5 1.5v14c0 .8-.7 1.5-1.5 1.5H8c-.8 0-1.5-.7-1.5-1.5V5c0-.8.7-1.5 1.5-1.5z',
      'M10.5 17.5h3',
    ],
  },
  // Plane, top-down.
  'infrastructure.airports': {
    paths: [
      'M12 3.5c.9 0 1.4.9 1.4 2.3v3.6l7.1 4.1v2.1l-7.1-2.2v4.2l1.9 1.7v1.6L12 20l-3.3.9v-1.6l1.9-1.7v-4.2l-7.1 2.2v-2.1l7.1-4.1V5.8c0-1.4.5-2.3 1.4-2.3z',
    ],
  },

  // — gender —
  // Venus symbol.
  'gender.womenInParliament': {
    paths: ['M12 12.5v8', 'M8.8 16.5h6.4'],
    circles: [[12, 8, 4.5]],
  },
  // Pram.
  'gender.motherMeanAgeAtBirth': {
    paths: [
      'M4 10h16v.8a6.8 6.8 0 0 1-6.8 6.8h-2.4A6.8 6.8 0 0 1 4 10.8z',
      'M20 10c0-3.6-2.9-6.5-6.5-6.5V10',
    ],
    circles: [
      [8.2, 19.7, 1.3],
      [15.8, 19.7, 1.3],
    ],
  },

  // — health —
  // Bathroom scale.
  'health.obesity': {
    paths: [
      'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13.5h-17V6A1.5 1.5 0 0 1 5 4.5z',
      'M8.5 10.5a3.5 3.5 0 0 1 7 0',
      'M12 10.5l1.8-2.4',
    ],
  },
  // Stethoscope.
  'health.doctors': {
    paths: ['M6.5 4.5v4.5a3.5 3.5 0 0 0 7 0V4.5', 'M10 12.5v3a4 4 0 0 0 8 0v-1.6'],
    circles: [[18, 11.5, 2.3]],
  },
  // Hospital bed.
  'health.hospitalBeds': {
    paths: ['M3.5 5.5v14', 'M3.5 15.5h17', 'M9.5 10.5H18a2.5 2.5 0 0 1 2.5 2.5v6.5'],
    circles: [[6.4, 12.8, 1.7]],
  },
  // Heartbeat trace.
  'health.lifeExpectancy': {
    paths: ['M3 12.5h3.8l1.9-3.8 3.2 7.6 2.4-5.7 1.4 1.9H21'],
  },
  // Wine glass.
  'health.alcoholConsumption': {
    paths: ['M8 3.5h8c0 5-1.7 8-4 8s-4-3-4-8z', 'M12 11.5V20', 'M8.5 20h7'],
  },
  // Cigarette and smoke.
  'health.tobaccoUse': {
    paths: [
      'M3.5 14.5h13v3.5h-13z',
      'M13.5 14.5V18',
      'M18 12c-.9-.9-.9-1.8 0-2.7s.9-1.8 0-2.7',
    ],
  },
  // Capsule.
  'health.accessToContraceptives': {
    paths: [
      'M6.3 13.2l6.9-6.9a3.6 3.6 0 0 1 5.1 5.1l-6.9 6.9a3.6 3.6 0 0 1-5.1-5.1z',
      'M9.8 9.7l4.5 4.5',
    ],
  },

  // — people —
  // Hourglass.
  'people.lifeExpectancy': {
    paths: [
      'M7 3.5h10',
      'M7 20.5h10',
      'M8.2 3.5v2.8c0 2.6 3.8 3.5 3.8 5.7s-3.8 3.1-3.8 5.7v2.8',
      'M15.8 3.5v2.8c0 2.6-3.8 3.5-3.8 5.7s3.8 3.1 3.8 5.7v2.8',
    ],
  },
  // Calendar.
  'people.medianAge': {
    paths: ['M4.5 5.5h15v14h-15z', 'M4.5 9.5h15', 'M8.5 3.5v4', 'M15.5 3.5v4'],
    circles: [[12, 14.5, 1.1]],
  },
  // Parent and child.
  'people.childrenPerWoman': {
    paths: [
      'M3 19.5c0-3.7 2-5.6 5-5.6 1.7 0 3 .6 3.9 1.7',
      'M13 19.5c0-2.7 1.4-4.2 3.5-4.2s3.5 1.5 3.5 4.2',
    ],
    circles: [
      [8, 6.5, 2.6],
      [16.5, 10, 1.9],
    ],
  },
  // A crowd of three.
  'people.population': {
    paths: [
      'M7.5 19.5c0-3.2 1.8-4.9 4.5-4.9s4.5 1.7 4.5 4.9',
      'M3 17.2c0-2.4 1.1-3.8 2.8-3.8.7 0 1.3.2 1.8.6',
      'M21 17.2c0-2.4-1.1-3.8-2.8-3.8-.7 0-1.3.2-1.8.6',
    ],
    circles: [
      [12, 6.5, 2.4],
      [5.5, 9, 1.9],
      [18.5, 9, 1.9],
    ],
  },
  // Person, numbers climbing.
  'people.populationGrowthRate': {
    paths: ['M4 18.5c0-3.4 2-5.2 5-5.2s5 1.8 5 5.2', 'M18.5 16v-6', 'M16.3 12.2 18.5 10l2.2 2.2'],
    circles: [[9, 7.5, 2.6]],
  },
  // Flows both ways.
  'people.netMigration': {
    paths: ['M4 8.5h13.5', 'M14.5 5.5l3 3-3 3', 'M20 15.5H6.5', 'M9.5 12.5l-3 3 3 3'],
  },
  // Hatching egg.
  'people.birthRate': {
    paths: [
      'M12 3.5c3.4 0 6 3.6 6 8.2a6 6 0 0 1-12 0c0-4.6 2.6-8.2 6-8.2z',
      'M8.6 13l1.7-1.4 1.7 1.4 1.7-1.4 1.7 1.4',
    ],
  },
  // Skyline.
  'people.urbanization': {
    paths: [
      'M3 20h18',
      'M5.5 20V9.5H11V20',
      'M13 20V4.5h5.5V20',
      'M8.2 12.5v.01',
      'M8.2 16v.01',
      'M15.7 8v.01',
      'M15.7 11.5v.01',
      'M15.7 15v.01',
    ],
  },

  // — education —
  // The letter being learned.
  'education.literacy': {
    paths: ['M5.5 19.5 12 4.5l6.5 15', 'M8.2 14h7.6'],
  },
  // Graduation cap.
  'education.averageYearsOfStudy': {
    paths: ['M3 9.5 12 5.5l9 4-9 4z', 'M6.5 11.7v3.8c3 2.2 8 2.2 11 0v-3.8', 'M21 9.5v4.5'],
  },

  // — religion —
  // Atom, the secular emblem.
  'religion.atheism': {
    paths: [
      'M12 8.4c4.7 0 8.5 1.6 8.5 3.6s-3.8 3.6-8.5 3.6-8.5-1.6-8.5-3.6 3.8-3.6 8.5-3.6z',
      'M12 3.5c2 0 3.6 3.8 3.6 8.5s-1.6 8.5-3.6 8.5-3.6-3.8-3.6-8.5 1.6-8.5 3.6-8.5z',
    ],
    circles: [[12, 12, 1.3]],
  },
  // Votive candle.
  'religion.believers': {
    paths: [
      'M12 3.5c1.7 2 2.6 3.5 2.6 4.9a2.6 2.6 0 0 1-5.2 0c0-1.4.9-2.9 2.6-4.9z',
      'M9.5 20.5V13h5v7.5',
      'M8 20.5h8',
    ],
  },

  // — environment —
  // Factory.
  'environment.CO2Emissions': {
    paths: ['M3.5 19.5V11l5 3v-3l5 3v-3l7 4.2v4.3z', 'M16.5 10.6V4.5h4v9.7'],
  },
  // Wind turbine.
  'environment.renewables': {
    paths: ['M12 20.5V10', 'M12 10V3.5', 'M12 10l5.6 3.2', 'M12 10l-5.6 3.2', 'M8.5 20.5h7'],
    circles: [[12, 10, 1.2]],
  },
  // Rising gas bubbles.
  'environment.methaneEmissions': {
    circles: [
      [8.8, 16.3, 2.9],
      [15.8, 9.8, 2.3],
      [10.3, 5.3, 1.5],
    ],
  },

  // — human rights —
  // Wedding rings.
  'humanRights.gayMarriageLegalized': {
    circles: [
      [8.8, 12, 4.6],
      [15.2, 12, 4.6],
    ],
  },
  // A person on the move.
  'humanRights.refugees': {
    paths: [
      'M3.5 17.5c0-3.1 1.8-4.7 4.5-4.7 1.7 0 3 .6 3.7 1.8',
      'M13 17.5h7.5',
      'M17.8 14.8 20.5 17.5l-2.7 2.7',
    ],
    circles: [[8, 6.8, 2.4]],
  },

  // — government (general knowledge) —
  // Crossed swords.
  'government.amountOfMilitaryConflicts': {
    paths: [
      'M4.5 4.5l14 14',
      'M19.5 4.5l-14 14',
      'M15.5 19.5l4-4',
      'M8.5 19.5l-4-4',
      'M18.5 18.5l2 2',
      'M5.5 18.5l-2 2',
    ],
  },
  // Ballot into the box.
  'government.democracyIndex': {
    paths: ['M4.5 11.5h15V20h-15z', 'M9 11.5v-6h6v6', 'M10.7 8.4l1.2 1.2 2.1-2.5'],
  },
  // Money under the lens.
  'government.corruptionIndex': {
    paths: ['M14.7 14.7l5.6 5.6'],
    circles: [
      [10.5, 10.5, 5.8],
      [10.5, 10.5, 2.2],
    ],
  },
  // Podium.
  'government.humanDevelopmentIndex': {
    paths: ['M3 19.5h18', 'M3.5 19.5V15H9v-4.5h6V13h5.5v6.5'],
  },
  // Smile.
  'government.happiness': {
    paths: [
      'M8.8 9.8v.01',
      'M15.2 9.8v.01',
      'M8.3 14c1 1.6 2.3 2.4 3.7 2.4s2.7-.8 3.7-2.4',
    ],
    circles: [[12, 12, 8.5]],
  },

  // — energy —
  // Plug.
  'energy.electricityAccess': {
    paths: ['M9 3.5V8', 'M15 3.5V8', 'M7 8h10v2.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5z', 'M12 15.5v5'],
  },
  // Oil barrel.
  'energy.fossilFuels': {
    paths: [
      'M6.5 4.5h11v15h-11z',
      'M6.5 8.5h11',
      'M6.5 16h11',
      'M12 10.2c1 1.2 1.5 2.1 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.8.5-1.7 1.5-2.9z',
    ],
  },
}

// Every glyph addressable by name through the `topic` string channel. The
// key spaces don't overlap: topics are bare words, the benches are prefixed.
const NAMED_GLYPHS: Record<string, Glyph> = {
  ...TOPIC_GLYPHS,
  ...UTILITY_GLYPHS,
  ...DEPARTMENT_GLYPHS,
  ...RELATIONS_GLYPHS,
  ...SOCIETY_GLYPHS,
  ...IDEOLOGY_GLYPHS,
}

export const resolveGlyph = (accessor?: GroupChallengeAccessorId, topic?: string): Glyph => {
  if (accessor && STAT_GLYPHS[accessor]) return STAT_GLYPHS[accessor]
  if (topic && NAMED_GLYPHS[topic]) return NAMED_GLYPHS[topic]
  return FALLBACK_GLYPH
}
