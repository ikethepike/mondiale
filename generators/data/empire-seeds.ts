import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Curated roster of vanished polities for the Ghosts of Empires round.
 *
 * THE CURATION CONTRACT
 * - Global representation is a hard requirement: at most 1/3 of entries may
 *   be `region: 'europe'` — the generator refuses to emit past the quota.
 * - Every entry animates 4–8 keyframes, chronological, rise → peak →
 *   decline → dissolution. Keyframe years for `source: 'basemaps'` MUST come
 *   from the pinned snapshot menu (AVAILABLE_BASEMAP_YEARS in the generator);
 *   `source: 'cshapes'` keyframes are day-dated slices (1886–2019 only);
 *   `source: 'handmade'` frames are hand-traced WGS84 GeoJSON under
 *   data/static/empires/ for the gaps neither dataset covers (wartime
 *   occupation extents, 1819–1831 Gran Colombia, Neo-Babylonia).
 * - Alias strings are matched EXACTLY against the snapshot's fields. The
 *   source data is typo-ridden ("Britany", "Chola state") — copy values
 *   verbatim from the generator's error suggestions, never "fix" them here.
 * - members.core = unambiguously ruled at peakYear; members.partial = edges,
 *   vassals, brief holdings. Only core/never are scoreable; when in doubt,
 *   demote to partial — a wrong `core` teaches falsehood, a cautious
 *   `partial` only softens one reveal.
 * - Blurbs: 1–2 sentences, archaeological register — "extent", "rule",
 *   "dissolution" — never celebratory; colonial and 20th-century empires on
 *   the same footing as ancient ones. Aim for the detail a player retells.
 * - Overlapping polities (Mongol ⊃ Golden Horde, Rome → Byzantium) are fine
 *   as separate entries; the dealer never repeats an empire within a game.
 * - eventSlugs cross-link data/events.gen.ts EVENTS; advisory only (events
 *   can drop on regen), checked by generators/check-empires.ts.
 */

export type EmpireRegion =
  | 'south-america'
  | 'north-america'
  | 'africa'
  | 'middle-east'
  | 'asia'
  | 'europe'

/** Icons deal on every difficulty; deep cuts are weighted toward hard mode. */
export type EmpireTier = 'icon' | 'deep-cut'

export type EmpireKeyframeSpec =
  | {
      source: 'basemaps'
      /** Snapshot year from the pinned menu; negative = BCE (bc500 → -500). */
      year: number
      /** Exact NAME values unioned into the extent. */
      name?: string[]
      /** Exact SUBJECTO values — colonial-overlord union. */
      subjecto?: string[]
      /** Exact PARTOF values; use sparingly (cultural areas are broad). */
      partof?: string[]
    }
  | {
      source: 'cshapes'
      /** Scrubber label (CShapes is 1886–2019, so never negative). */
      year: number
      /** Slice date 'YYYY-MM-DD': features active with gws ≤ date ≤ gwe. */
      date: string
      /** Exact cntry_name values unioned. */
      name?: string[]
      /** GW codes, when names are ambiguous across periods. */
      gwcode?: number[]
    }
  | {
      source: 'handmade'
      year: number
      /** Filename under data/static/empires/, WGS84 FeatureCollection. */
      file: string
    }

export interface EmpireCapital {
  name: string
  /** WGS84 [lon, lat]; projected to map space at generation time. */
  coordinates: [number, number]
  /** Star visibility window on the scrubber; defaults to the whole run. */
  from?: number
  to?: number
}

export interface EmpireSeed {
  /** kebab-case slug; stable across regens (keys flags, paths, reports). */
  id: string
  /** Display name — the answer players buzz with. */
  name: string
  /** Accepted alternate answers ("Tawantinsuyu", "Sassanid Empire"). */
  answerAliases?: string[]
  region: EmpireRegion
  tier: EmpireTier
  /** 4–8 specs, strictly ascending by year. */
  keyframes: EmpireKeyframeSpec[]
  /** Beat 2 freezes here; must equal one keyframe's year. */
  peakYear: number
  members: {
    core: ISOCountryCode[]
    partial: ISOCountryCode[]
  }
  capitals: EmpireCapital[]
  /** Commons SVG filename, e.g. 'Flag of the Ottoman Empire.svg'. */
  commons?: string
  blurb: string
  /** Slugs into data/events.gen.ts EVENTS. */
  eventSlugs?: string[]
}

export const EMPIRE_SEEDS: EmpireSeed[] = [
  // --- Middle East ------------------------------------------------------------
  {
    id: 'abbasid-caliphate',
    name: 'Abbasid Caliphate',
    answerAliases: ['Abbasids', 'Abbasid Empire'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // Snapshots name the Abbasids only at 800/900 (Buyids/Seljuks subsume
      // them after) — the rise and the Baghdad rump are hand-traced.
      { source: 'handmade', year: 762, file: 'abbasid-caliphate-762.geojson' },
      { source: 'basemaps', year: 800, name: ['Abbasid Caliphate'] },
      { source: 'basemaps', year: 900, name: ['Abbasid Caliphate'] },
      { source: 'handmade', year: 1200, file: 'abbasid-caliphate-1200.geojson' },
    ],
    peakYear: 800,
    members: {
      core: ['IQ', 'SY', 'LB', 'JO', 'IL', 'PS', 'EG', 'KW', 'SA', 'IR', 'AF', 'TM', 'UZ', 'TJ'],
      partial: ['TR', 'AM', 'AZ', 'GE', 'CY', 'YE', 'OM', 'BH', 'QA', 'AE', 'PK', 'KG', 'LY', 'TN', 'DZ'],
    },
    capitals: [{ name: 'Baghdad', coordinates: [44.4009, 33.3152], from: 800 }],
    commons: 'Abbasid Caliphate Caliphal Banner.svg',
    blurb:
      'Rule from the round city of Baghdad reached from the Maghreb to the Indus at its height around 800. Provincial dynasties peeled away over three centuries until the caliphate held little beyond Mesopotamia, and Mongol forces ended it in 1258.',
  },

  {
    id: 'akkadian-empire',
    name: 'Akkadian Empire',
    answerAliases: ['Akkad', 'Akkadians', 'Empire of Akkad'],
    region: 'middle-east',
    tier: 'deep-cut',
    keyframes: [
      // Predates every snapshot — the whole arc is hand-traced.
      { source: 'handmade', year: -2330, file: 'akkadian-empire-bc2330.geojson' },
      { source: 'handmade', year: -2250, file: 'akkadian-empire-bc2250.geojson' },
      { source: 'handmade', year: -2200, file: 'akkadian-empire-bc2200.geojson' },
      { source: 'handmade', year: -2150, file: 'akkadian-empire-bc2150.geojson' },
    ],
    peakYear: -2250,
    members: {
      core: ['IQ'],
      partial: ['SY', 'IR', 'TR', 'KW'],
    },
    capitals: [{ name: 'Akkad', coordinates: [44.1, 33.1] }],
    // hand-drawn: attested Mesopotamian star emblem on a banner field; no Akkadian flag exists
    commons: 'Star of Ishtar banner (hand-drawn).svg',
    blurb:
      'Often counted the first empire: Sargon’s dynasty yoked the Sumerian city-states to campaigns reaching the Mediterranean and Elam. It lasted about 180 years before drought and Gutian incursions broke it; the city of Akkad itself has never been found.',
  },
  {
    id: 'neo-assyrian-empire',
    name: 'Neo-Assyrian Empire',
    answerAliases: ['Assyria', 'Assyrian Empire', 'Assyrians'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: -1000, name: ['Assyria'] },
      { source: 'basemaps', year: -700, name: ['Assyria'] },
      { source: 'handmade', year: -650, file: 'neo-assyrian-empire-bc650.geojson' },
      { source: 'handmade', year: -615, file: 'neo-assyrian-empire-bc615.geojson' },
    ],
    peakYear: -650,
    members: {
      core: ['IQ', 'SY'],
      partial: ['TR', 'IR', 'IL', 'PS', 'LB', 'JO', 'EG', 'KW', 'CY'],
    },
    capitals: [
      { name: 'Assur', coordinates: [43.26, 35.46], to: -700 },
      { name: 'Nineveh', coordinates: [43.1522, 36.3627], from: -700 },
    ],
    commons: 'Flag of the Assyrians (no Assur).svg',
    blurb:
      'The first state to rule the whole Fertile Crescent, run on roads, provincial governors and mass deportation, its kings recording conquests as far as Thebes. Within four decades of its widest extent, a Babylonian–Median coalition burned Nineveh in 612 BCE.',
  },
  {
    id: 'neo-babylonian-empire',
    name: 'Neo-Babylonian Empire',
    answerAliases: ['Babylon', 'Babylonia', 'Babylonian Empire', 'Chaldean Empire'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // Lives entirely between the -700 and -500 snapshots — all hand-traced.
      { source: 'handmade', year: -620, file: 'neo-babylonian-empire-bc620.geojson' },
      { source: 'handmade', year: -600, file: 'neo-babylonian-empire-bc600.geojson' },
      { source: 'handmade', year: -580, file: 'neo-babylonian-empire-bc580.geojson' },
      { source: 'handmade', year: -540, file: 'neo-babylonian-empire-bc540.geojson' },
    ],
    peakYear: -580,
    members: {
      core: ['IQ', 'SY', 'LB', 'IL', 'PS', 'JO'],
      partial: ['SA', 'TR', 'KW'],
    },
    capitals: [{ name: 'Babylon', coordinates: [44.4275, 32.5364] }],
    // hand-drawn: the Ishtar Gate rosette on lapis; no Babylonian flag exists
    commons: 'Ishtar Gate rosette banner (hand-drawn).svg',
    blurb:
      'The last native Mesopotamian empire, whose kings rebuilt Babylon around the Ishtar Gate and deported Judah’s elite after taking Jerusalem in 587 BCE. Nabonidus lost the city to Cyrus without a siege in 539, and Babylonia became a Persian satrapy.',
  },
  {
    id: 'achaemenid-empire',
    name: 'Achaemenid Empire',
    answerAliases: ['Persia', 'Persian Empire', 'Achaemenids', 'First Persian Empire'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // Not on the -700 map (Media holds Iran) — the rise frame is hand-traced.
      { source: 'handmade', year: -550, file: 'achaemenid-empire-bc550.geojson' },
      { source: 'basemaps', year: -500, name: ['Achaemenid Empire'] },
      { source: 'basemaps', year: -400, name: ['Achaemenid Empire'] },
      { source: 'handmade', year: -335, file: 'achaemenid-empire-bc335.geojson' },
    ],
    peakYear: -500,
    members: {
      // aid: CY flagged <0.3 — the coarse extent drops the island, but Cyprus
      // paid satrapal tribute from Cambyses on; keeping core. JO/KW demoted
      // (unadministered desert interior).
      core: [
        'IR', 'IQ', 'SY', 'LB', 'IL', 'PS', 'EG', 'TR', 'AF',
        'TM', 'UZ', 'TJ', 'AM', 'AZ', 'CY',
      ],
      partial: ['JO', 'KW', 'PK', 'GR', 'BG', 'MK', 'GE', 'LY', 'SA', 'KG', 'KZ'],
    },
    capitals: [
      { name: 'Pasargadae', coordinates: [53.17, 30.19], to: -500 },
      { name: 'Persepolis', coordinates: [52.8916, 29.9354], from: -500 },
    ],
    commons: 'Standard of Cyrus the Great (White).svg',
    blurb:
      'Cyrus and Darius assembled the largest state the world had yet seen, from the Indus to the Aegean, run through satraps, a royal road and tribute recorded at Persepolis. Alexander’s decade-long campaign ended the dynasty in 330 BCE.',
  },
  {
    id: 'seleucid-empire',
    name: 'Seleucid Empire',
    answerAliases: ['Seleucids', 'Seleucid Kingdom', 'Seleucia'],
    region: 'middle-east',
    tier: 'deep-cut',
    keyframes: [
      // Not yet distinct at -323 (Alexander's empire) — the rise is hand-traced.
      { source: 'handmade', year: -312, file: 'seleucid-empire-bc312.geojson' },
      { source: 'basemaps', year: -300, name: ['Seleucid Kingdom'] },
      { source: 'basemaps', year: -200, name: ['Seleucid Kingdom'] },
      { source: 'basemaps', year: -100, name: ['Seleucid Kingdom'] },
    ],
    // Peak on -200 (Antiochus III): the -300 sheet still gives Syria to
    // Antigonus (Ipsus falls in 301), which would strand SY/LB outside it.
    peakYear: -200,
    members: {
      // aid: AF/TM/LB flagged <0.3 at the -200 peak — Bactria and Parthia had
      // already seceded and Coele-Syria was newly contested; demoted.
      core: ['SY', 'IQ', 'IR'],
      partial: ['LB', 'AF', 'TM', 'TR', 'IL', 'PS', 'JO', 'UZ', 'TJ', 'PK', 'KW', 'AM', 'AZ'],
    },
    capitals: [
      { name: 'Seleucia on the Tigris', coordinates: [44.52, 33.09], to: -300 },
      { name: 'Antioch', coordinates: [36.1628, 36.2021], from: -300 },
    ],
    // hand-drawn from a supplied reconstruction; no Commons SVG exists
    commons: 'Seleucid anchor reconstruction (hand-drawn).svg',
    blurb:
      'The largest fragment of Alexander’s conquests, a Macedonian dynasty ruling from twin capitals in Syria and Mesopotamia over dozens of founded Greek cities. Parthia peeled away the east, Rome the west, and Pompey annexed the Syrian rump in 63 BCE.',
  },
  {
    id: 'parthian-empire',
    name: 'Parthian Empire',
    answerAliases: ['Parthia', 'Parthians', 'Arsacid Empire', 'Arsacids'],
    region: 'middle-east',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: -200, name: ['Parthia'] },
      { source: 'basemaps', year: -100, name: ['Parthia'] },
      { source: 'basemaps', year: -1, name: ['Parthian Empire'] },
      { source: 'basemaps', year: 100, name: ['Parthian Empire'] },
      { source: 'basemaps', year: 200, name: ['Parthian Empire'] },
    ],
    peakYear: -1,
    members: {
      core: ['IR', 'IQ'],
      partial: ['AM', 'AZ', 'GE', 'TM', 'AF', 'PK', 'TJ', 'UZ', 'KW', 'SY'],
    },
    capitals: [{ name: 'Ctesiphon', coordinates: [44.5809, 33.0937] }],
    // modern reconstruction, per Isaac
    commons: 'Flag of Parthian Empire.svg',
    blurb:
      'A steppe dynasty that took Iran and Mesopotamia from the Seleucids and held Rome at the Euphrates for three centuries, annihilating a legionary army at Carrhae in 53 BCE. Weakened by succession wars, it fell to its own vassals, the Sasanians, in 224.',
  },
  {
    id: 'sasanian-empire',
    name: 'Sasanian Empire',
    answerAliases: ['Sassanid Empire', 'Sasanians', 'Sassanids', 'Persia', 'Eranshahr'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // The 300 snapshot still labels Iran 'Parthian Empire' — rise hand-traced.
      { source: 'handmade', year: 240, file: 'sasanian-empire-240.geojson' },
      { source: 'basemaps', year: 400, name: ['Persia'] },
      { source: 'basemaps', year: 500, name: ['Sasanian Empire'] },
      { source: 'basemaps', year: 600, name: ['Sasanian Empire', 'Sasanian dependencies'] },
    ],
    peakYear: 600,
    members: {
      core: ['IR', 'IQ'],
      partial: ['AM', 'AZ', 'GE', 'TM', 'AF', 'PK', 'TJ', 'UZ', 'SY', 'TR', 'YE', 'OM', 'BH', 'QA', 'AE', 'KW'],
    },
    capitals: [{ name: 'Ctesiphon', coordinates: [44.5809, 33.0937] }],
    commons: 'Derafsh Kaviani flag of the late Sassanid Empire.svg',
    blurb:
      'The last pre-Islamic Persian empire, Rome’s equal for four centuries, with a state church, walled frontiers and dependencies reaching Yemen. A final exhausting war with Byzantium ended in 628; within a generation the Arab armies had taken everything.',
  },
  {
    id: 'umayyad-caliphate',
    name: 'Umayyad Caliphate',
    answerAliases: ['Umayyads', 'Umayyad Empire', 'Omayyad Caliphate', 'Arab Caliphate'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // The rise outruns the century snapshots — 632/661/720 are hand-traced.
      { source: 'handmade', year: 632, file: 'umayyad-caliphate-632.geojson' },
      { source: 'handmade', year: 661, file: 'umayyad-caliphate-661.geojson' },
      // The 700 sheet still gives Iran and its Arabian dependencies to the
      // Sasanians (gone since 651) — union the stale features in, and peak on
      // the hand-traced 720 maximum instead.
      {
        source: 'basemaps',
        year: 700,
        name: ['Umayyad Caliphate', 'Sasanian Empire', 'Sasanian dependencies'],
      },
      { source: 'handmade', year: 720, file: 'umayyad-caliphate-720.geojson' },
    ],
    peakYear: 720,
    members: {
      // aid: LY flagged <0.3 — rule ran along the coast road, not the Fezzan;
      // demoted like the other desert interiors.
      core: [
        'SA', 'YE', 'OM', 'AE', 'QA', 'BH', 'KW', 'IQ', 'SY', 'LB',
        'JO', 'IL', 'PS', 'EG', 'IR', 'TM', 'AF',
      ],
      partial: ['LY', 'TN', 'DZ', 'MA', 'ES', 'PT', 'UZ', 'TJ', 'PK', 'AM', 'AZ', 'GE', 'CY', 'SD', 'TR'],
    },
    capitals: [
      { name: 'Medina', coordinates: [39.6142, 24.4672], to: 661 },
      { name: 'Damascus', coordinates: [36.2765, 33.5138], from: 661 },
    ],
    commons: 'Umayyad Flag.svg',
    blurb:
      'Within a century of 632 the caliphate stretched from the Atlantic to the Indus — the fastest sustained expansion on record, administered in Arabic from Damascus. The Abbasid revolution overthrew the dynasty in 750; one survivor carried the line to Córdoba.',
  },
  {
    id: 'ottoman-empire',
    name: 'Ottoman Empire',
    answerAliases: ['Ottomans', 'Turkish Empire', 'Sublime Porte', 'Osman Empire'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1400, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1500, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1600, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1700, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1800, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1900, name: ['Ottoman Empire'] },
      { source: 'basemaps', year: 1920, name: ['Ottoman Sultanate'] },
    ],
    peakYear: 1600,
    members: {
      // aid: SK suggested core — the 1600 sheet sweeps all Upper Hungary into
      // the empire, but most of it stayed Royal (Habsburg) Hungary; kept
      // partial. LY demoted: a coastal regency, not the interior.
      core: [
        'TR', 'GR', 'BG', 'MK', 'RS', 'BA', 'AL', 'ME', 'XK', 'SY',
        'LB', 'IL', 'PS', 'JO', 'IQ', 'EG', 'CY', 'TN',
      ],
      partial: [
        'LY', 'SK', 'AZ', 'IR', 'HU', 'RO', 'MD', 'UA', 'HR', 'GE',
        'AM', 'SA', 'YE', 'KW', 'DZ', 'SD', 'ER',
      ],
    },
    capitals: [
      { name: 'Edirne', coordinates: [26.5557, 41.6771], to: 1453 },
      { name: 'Constantinople', coordinates: [28.9784, 41.0082], from: 1453 },
    ],
    commons: 'Flag of the Ottoman Empire.svg',
    blurb:
      'From a Anatolian frontier beylik to a state on three continents, taking Constantinople in 1453 and besieging Vienna twice. Six centuries of rule ended in 1922, its provinces redrawn into more than thirty present-day states.',
  },
  {
    id: 'safavid-empire',
    name: 'Safavid Empire',
    answerAliases: ['Safavids', 'Safavid Persia', 'Safavid dynasty', 'Persia'],
    region: 'middle-east',
    tier: 'icon',
    keyframes: [
      // Founded 1501 but not on the 1500 sheet — the run opens at 1530.
      { source: 'basemaps', year: 1530, name: ['Safavid Empire'] },
      { source: 'basemaps', year: 1600, name: ['Safavid Empire'] },
      { source: 'basemaps', year: 1650, name: ['Safavid Empire'] },
      { source: 'basemaps', year: 1700, name: ['Safavid Empire'] },
    ],
    peakYear: 1600,
    members: {
      // aid: AZ flagged <0.3 — Azerbaijan was under Ottoman occupation at the
      // 1600 frame (1578–1603 war) though Safavid before and after; demoted.
      core: ['IR'],
      partial: ['AZ', 'AM', 'GE', 'IQ', 'AF', 'TM', 'BH'],
    },
    capitals: [
      { name: 'Tabriz', coordinates: [46.2919, 38.0962], to: 1555 },
      { name: 'Qazvin', coordinates: [50.0041, 36.2688], from: 1555, to: 1600 },
      { name: 'Isfahan', coordinates: [51.666, 32.6539], from: 1600 },
    ],
    commons: 'Safavid Flag.svg',
    blurb:
      'The dynasty that made Twelver Shi’ism Iran’s state religion and rebuilt Isfahan into a capital its poets called half the world. Pressed between Ottoman and Uzbek fronts for two centuries, it collapsed to an Afghan revolt in 1722.',
  },
  {
    id: 'hittite-empire',
    name: 'Hittite Empire',
    answerAliases: ['Hittites', 'Hatti', 'Hittite Kingdom'],
    region: 'middle-east',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: -2000, name: ['Hittites'] },
      { source: 'basemaps', year: -1500, name: ['Hittites'] },
      { source: 'handmade', year: -1300, file: 'hittite-empire-bc1300.geojson' },
      { source: 'handmade', year: -1200, file: 'hittite-empire-bc1200.geojson' },
    ],
    peakYear: -1300,
    members: {
      core: ['TR'],
      partial: ['SY', 'LB'],
    },
    capitals: [{ name: 'Hattusa', coordinates: [34.6154, 40.0198] }],
    // Commons file named for the Latin Empire; chosen for the double-headed eagle, attested at Alaca Hoyuk, per Isaac
    commons: 'Latin Empire Flag 3.svg',
    blurb:
      'An Anatolian great power that fought Egypt to a standstill at Qadesh and sealed the first surviving peace treaty, its archives kept in cuneiform on clay. The capital was abandoned around 1180 BCE in the general Bronze Age collapse.',
  },
  {
    id: 'seljuk-empire',
    name: 'Seljuk Empire',
    answerAliases: ['Seljuks', 'Seljuq Empire', 'Great Seljuk Empire', 'Seljuk Turks'],
    region: 'middle-east',
    tier: 'deep-cut',
    keyframes: [
      // Only the 1100 sheet names the empire — rise and remnants hand-traced.
      { source: 'handmade', year: 1040, file: 'seljuk-empire-1040.geojson' },
      { source: 'handmade', year: 1080, file: 'seljuk-empire-1080.geojson' },
      { source: 'basemaps', year: 1100, name: ['Seljuk Empire'] },
      { source: 'handmade', year: 1180, file: 'seljuk-empire-1180.geojson' },
    ],
    peakYear: 1100,
    members: {
      // aid: TM flagged <0.3 (the 1100 sheet clips Khorasan) — Merv was a
      // Seljuk capital, keeping core. QA/SA/PK suggestions declined: the
      // coarse polygon sweeps the Gulf; the Seljuks never ruled Arabia.
      core: ['IR', 'IQ', 'TM'],
      partial: ['TR', 'SY', 'AZ', 'AM', 'GE', 'UZ', 'TJ', 'AF', 'KG', 'KW'],
    },
    capitals: [{ name: 'Isfahan', coordinates: [51.666, 32.6539] }],
    // modern reconstruction (16 Great Turkic Empires series), per Isaac
    commons: 'Flag of Seljuk Empire (16 Great Turkic Empires) 2.svg',
    blurb:
      'Oghuz Turkic horsemen who took Baghdad under their protection in 1055 and, after Manzikert in 1071, opened Anatolia to Turkish settlement. The empire split among family lines within a century; the Rum branch carried on in Anatolia until the Mongols.',
  },

  // --- Asia -----------------------------------------------------------------------
  {
    id: 'mongol-empire',
    name: 'Mongol Empire',
    answerAliases: ['Mongols', 'Mongolian Empire', 'Great Mongol State'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1200, name: ['Mongol Empire'] },
      // From 1279 the sheets name the khanates; 'Mongol Empire' survives only
      // as their SUBJECTO — union everything for the whole-empire frames.
      {
        source: 'basemaps',
        year: 1279,
        name: ['Great Khanate', 'Ilkhanate', 'Chagatai Khanate', 'Khanate of the Golden Horde'],
        subjecto: ['Mongol Empire'],
      },
      {
        source: 'basemaps',
        year: 1300,
        name: ['Great Khanate', 'Ilkhanate', 'Chagatai Khanate', 'Khanate of the Golden Horde'],
        subjecto: ['Mongol Empire'],
      },
      {
        source: 'basemaps',
        year: 1400,
        name: ['Great Khanate', 'Chagatai Khanate', 'Blue Horde', 'White Horde'],
        subjecto: ['Mongol Empire'],
      },
    ],
    peakYear: 1279,
    members: {
      // aid: BY/BT/NP/QA/KW/MD suggested core by the coarse union blob —
      // declined: the Rus lands paid tribute without garrisons, the Himalaya
      // and Arabia were never ruled. MD/RO/VN/KW added as partial instead.
      core: ['MN', 'CN', 'KZ', 'KG', 'UZ', 'TM', 'TJ', 'AF', 'IR', 'IQ', 'GE', 'AM', 'AZ'],
      partial: ['RU', 'UA', 'MD', 'RO', 'KR', 'KP', 'MM', 'PK', 'TR', 'SY', 'VN', 'KW'],
    },
    capitals: [
      { name: 'Karakorum', coordinates: [102.8456, 47.194], to: 1279 },
      { name: 'Khanbaliq', coordinates: [116.4074, 39.9042], from: 1279 },
    ],
    // hand-drawn: the attested nine-tailed white tug; Commons' rectangular Mongol flag is speculative and rejected
    commons: 'White tug standard (hand-drawn).svg',
    blurb:
      'The largest contiguous land empire there has been, assembled within three generations of Genghis Khan’s 1206 proclamation and knit together by relay post-roads. It ran from Korea to Hungary before partitioning into four khanates that went their own ways.',
  },
  {
    id: 'han-dynasty',
    name: 'Han Dynasty',
    answerAliases: ['Han', 'Han Empire', 'Han China'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: -200, name: ['Han Empire'] },
      { source: 'basemaps', year: -100, name: ['Han Empire'] },
      { source: 'basemaps', year: -1, name: ['Han'] },
      { source: 'basemaps', year: 100, name: ['Han'] },
      { source: 'basemaps', year: 200, name: ['Han'] },
    ],
    peakYear: -1,
    members: {
      core: ['CN'],
      partial: ['KP', 'KR', 'VN', 'MN', 'KG'],
    },
    capitals: [
      { name: 'Chang’an', coordinates: [108.9398, 34.3416], to: 100 },
      { name: 'Luoyang', coordinates: [112.454, 34.6197], from: 100 },
    ],
    // modern reconstruction, per Isaac
    commons: 'Flag of Han Nation (original).svg',
    blurb:
      'Four centuries of centralized rule that fixed the pattern of the Chinese state — an examination bureaucracy, monopolies on salt and iron, commanderies reaching Korea and Vietnam, and caravans west through the Tarim. It fell apart into three kingdoms after 220.',
  },
  {
    id: 'tang-dynasty',
    name: 'Tang Dynasty',
    answerAliases: ['Tang', 'Tang Empire', 'Tang China'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'handmade', year: 618, file: 'tang-dynasty-618.geojson' },
      // The 700 sheet still labels the empire 'Sui Empire' (gone since 618) —
      // the polygon is the Tang extent; copied verbatim per the data contract.
      { source: 'basemaps', year: 700, name: ['Sui Empire'] },
      { source: 'basemaps', year: 800, name: ['Tang Empire'] },
      { source: 'basemaps', year: 900, name: ['Tang Empire'] },
    ],
    peakYear: 700,
    members: {
      core: ['CN'],
      partial: ['MN', 'KG', 'KZ', 'UZ', 'TJ', 'VN', 'KP', 'KR'],
    },
    capitals: [{ name: 'Chang’an', coordinates: [108.9398, 34.3416] }],
    // raster source; hand-simplified SVG committed alongside
    commons: 'Flag of Tang Dynasty (China).png',
    blurb:
      'At its height the Tang garrisoned the Tarim basin and ran protectorates to Samarkand, while Chang’an held a million people and the examination system took mature form. The An Lushan rebellion of 755 broke the expansion; the dynasty ended in 907.',
  },
  {
    id: 'qing-dynasty',
    name: 'Qing Dynasty',
    answerAliases: ['Qing', 'Qing Empire', 'Manchu Empire', 'Great Qing', 'Manchu Dynasty'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1650, name: ['Manchu Empire'] },
      { source: 'basemaps', year: 1700, name: ['Manchu Empire'] },
      { source: 'basemaps', year: 1783, name: ['Qing Empire'] },
      { source: 'basemaps', year: 1800, name: ['Qing Empire'] },
      { source: 'basemaps', year: 1880, name: ['Manchu Empire'] },
      { source: 'cshapes', year: 1911, date: '1911-01-01', gwcode: [710] },
    ],
    peakYear: 1783,
    members: {
      // aid: TW flagged <0.3 — the island's ring falls below the area floor,
      // but Taiwan was a Qing prefecture 1683–1895; keeping core.
      core: ['CN', 'MN', 'TW'],
      partial: ['KZ', 'KG', 'TJ', 'RU', 'KR', 'KP', 'VN', 'MM', 'NP'],
    },
    capitals: [{ name: 'Beijing', coordinates: [116.4074, 39.9042] }],
    commons: 'Flag of China (1889–1912).svg',
    blurb:
      'Manchu banners took Beijing in 1644 and by the Qianlong reign ruled the largest Chinese state ever assembled, adding Mongolia, Tibet and Xinjiang. A century of treaty ports, indemnities and rebellions followed; the last emperor abdicated in 1912.',
  },
  {
    id: 'maurya-empire',
    name: 'Maurya Empire',
    answerAliases: ['Mauryas', 'Mauryan Empire', 'Magadha'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: -300, name: ['Mauryan Empire'] },
      { source: 'handmade', year: -250, file: 'maurya-empire-bc250.geojson' },
      { source: 'basemaps', year: -200, name: ['Mauryan Empire'] },
      { source: 'basemaps', year: -100, name: ['Mauryan Empire'] },
    ],
    peakYear: -250,
    members: {
      core: ['IN', 'PK', 'BD'],
      partial: ['AF', 'NP'],
    },
    capitals: [{ name: 'Pataliputra', coordinates: [85.1376, 25.5941] }],
    // raster source; hand-simplified SVG committed alongside
    commons: 'Flag of Maurya Empire.pvg.png',
    blurb:
      'The first state to span most of the subcontinent, its size known partly from where Ashoka’s rock edicts stop. After the bloodshed of Kalinga around 260 BCE the emperor turned the administration toward dhamma; the dynasty lasted barely fifty years past him.',
  },
  {
    id: 'gupta-empire',
    name: 'Gupta Empire',
    answerAliases: ['Guptas', 'Gupta dynasty'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 300, name: ['Gupta Empire'] },
      { source: 'basemaps', year: 400, name: ['Gupta Empire'] },
      { source: 'basemaps', year: 500, name: ['Gupta Empire'] },
      { source: 'handmade', year: 550, file: 'gupta-empire-550.geojson' },
    ],
    peakYear: 400,
    members: {
      core: ['IN', 'BD'],
      partial: ['PK', 'NP'],
    },
    capitals: [{ name: 'Pataliputra', coordinates: [85.1376, 25.5941] }],
    // hand-drawn after the Garudadhvaja on Gupta coins and seals
    commons: 'Garuda standard (hand-drawn).svg',
    blurb:
      'Northern India under one dynasty in the age of Kalidasa’s poetry, the zero digit and the Nalanda schools — later historiography’s classical benchmark. Hunnic invasions and defecting feudatories reduced it to Magadha by the mid-sixth century.',
  },
  {
    id: 'mughal-empire',
    name: 'Mughal Empire',
    answerAliases: ['Mughals', 'Mogul Empire', 'Moghul Empire', 'Timurid-Mughal Empire'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1530, name: ['Mughal Empire'] },
      { source: 'basemaps', year: 1600, name: ['Mughal Empire'] },
      { source: 'basemaps', year: 1650, name: ['Mughal Empire'] },
      { source: 'basemaps', year: 1700, name: ['Mughal Empire'] },
      { source: 'basemaps', year: 1715, name: ['Mughal Empire'] },
    ],
    peakYear: 1700,
    members: {
      core: ['IN', 'PK', 'BD'],
      partial: ['AF', 'NP'],
    },
    capitals: [
      { name: 'Agra', coordinates: [78.0081, 27.1767], to: 1650 },
      { name: 'Delhi', coordinates: [77.209, 28.6139], from: 1650 },
    ],
    commons: 'Alam of the Mughal Empire.svg',
    blurb:
      'Babur’s Timurid line ruled a quarter of the world’s people at Aurangzeb’s death in 1707, financing Taj-scale building from the land revenue of the Gangetic plain. The century after saw Maratha, Afghan and Company inroads reduce it to the walls of Delhi.',
  },
  {
    id: 'khmer-empire',
    name: 'Khmer Empire',
    answerAliases: ['Khmer', 'Angkor', 'Angkorian Empire', 'Kambuja'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 900, name: ['Khmer Empire'] },
      { source: 'basemaps', year: 1000, name: ['Khmer Empire'] },
      { source: 'basemaps', year: 1100, name: ['Khmer Empire'] },
      { source: 'basemaps', year: 1200, name: ['Khmer Empire'] },
      { source: 'basemaps', year: 1300, name: ['Khmer Empire'] },
      { source: 'basemaps', year: 1400, name: ['Khmer Empire'] },
    ],
    peakYear: 1200,
    members: {
      core: ['KH'],
      partial: ['TH', 'LA', 'VN'],
    },
    capitals: [{ name: 'Angkor', coordinates: [103.867, 13.4125] }],
    // pre-colonial Cambodian flag, post-dates Angkor
    commons: 'Flag of Cambodia (pre-1863).svg',
    blurb:
      'From Angkor — the largest pre-industrial urban footprint known — a hydraulic state of reservoirs and rice terraces ruled the lower Mekong for half a millennium. Ayutthaya sacked the capital in 1431 and the court moved south toward Phnom Penh.',
  },
  {
    id: 'srivijaya',
    name: 'Srivijaya',
    answerAliases: ['Srivijaya Empire', 'Sriwijaya', 'Palembang Empire'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 800, name: ['Srivijaya Empire'] },
      { source: 'basemaps', year: 900, name: ['Srivijaya Empire'] },
      { source: 'basemaps', year: 1000, name: ['Srivijaya Empire'] },
      { source: 'basemaps', year: 1100, name: ['Srivijaya Empire'] },
    ],
    peakYear: 900,
    members: {
      // aid: ID flagged <0.3 — a straits thalassocracy against the whole
      // archipelago's landmass; Sumatra is unambiguously its home, keeping.
      core: ['ID', 'MY'],
      partial: ['TH', 'SG'],
    },
    capitals: [{ name: 'Palembang', coordinates: [104.7458, -2.9761] }],
    // hand-drawn INVENTED emblem after the Borobudur ship reliefs; no Srivijayan vexillology survives
    commons: 'Borobudur ship emblem (hand-drawn).svg',
    blurb:
      'A Buddhist thalassocracy on the Palembang river that taxed every hull passing the Malacca and Sunda straits for four centuries, endowing monasteries as far as Nalanda. Chola raids in 1025 broke its grip, and the ports drifted to rival houses.',
  },
  {
    id: 'majapahit',
    name: 'Majapahit',
    answerAliases: ['Majapahit Empire', 'Mojopahit', 'Wilwatikta'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      // Absent from every snapshot — the whole arc is hand-traced.
      { source: 'handmade', year: 1293, file: 'majapahit-1293.geojson' },
      { source: 'handmade', year: 1365, file: 'majapahit-1365.geojson' },
      { source: 'handmade', year: 1450, file: 'majapahit-1450.geojson' },
      { source: 'handmade', year: 1520, file: 'majapahit-1520.geojson' },
    ],
    peakYear: 1365,
    members: {
      // aid: ID flagged <0.3 — Java against the whole archipelago; the state
      // is nowhere but Indonesia, keeping core.
      core: ['ID'],
      partial: ['MY', 'SG', 'BN'],
    },
    capitals: [{ name: 'Trowulan', coordinates: [112.3833, -7.5561] }],
    commons: 'Surya Majapahit Gold.svg',
    blurb:
      'A Javanese court whose 1365 panegyric lists tributaries across the whole archipelago — claims the fleet enforced unevenly but no neighbour matched. The coastal sultanates it once taxed eclipsed it, and the line ended in the early sixteenth century.',
  },
  {
    id: 'timurid-empire',
    name: 'Timurid Empire',
    answerAliases: ['Timurids', 'Tamerlane’s Empire', 'Empire of Timur', 'Timur'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'handmade', year: 1370, file: 'timurid-empire-1370.geojson' },
      { source: 'basemaps', year: 1400, name: ['Timurid Empire'] },
      { source: 'basemaps', year: 1492, name: ['Timurid Emirates'] },
      { source: 'basemaps', year: 1500, name: ['Timurid Emirates'] },
    ],
    peakYear: 1400,
    members: {
      // aid: KW/QA suggested core — the 1400 sheet sweeps the Gulf shore into
      // the empire; Timur never ruled Arabia, declined.
      core: ['UZ', 'TM', 'TJ', 'AF', 'IR'],
      partial: ['IQ', 'AZ', 'AM', 'GE', 'PK', 'KZ', 'KG', 'SY', 'TR'],
    },
    capitals: [
      { name: 'Samarkand', coordinates: [66.975, 39.627], to: 1400 },
      { name: 'Herat', coordinates: [62.1997, 34.3529], from: 1400 },
    ],
    commons: 'Timurid Empire flag.svg',
    blurb:
      'Timur’s campaigns out of Samarkand broke every neighbouring power from Delhi to Ankara and paid for a capital of ribbed turquoise domes. The conquests stopped at his death in 1405; his heirs kept a smaller bookish realm at Herat for a century.',
  },
  {
    id: 'chola-empire',
    name: 'Chola Empire',
    answerAliases: ['Cholas', 'Chola dynasty', 'Chola state', 'Imperial Cholas'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 900, name: ['Cholas'] },
      { source: 'basemaps', year: 1000, name: ['Chola state'] },
      { source: 'basemaps', year: 1100, name: ['Cholas'] },
      { source: 'basemaps', year: 1200, name: ['Chola state'] },
      { source: 'basemaps', year: 1279, name: ['Chola state'] },
    ],
    peakYear: 1100,
    members: {
      // aid: IN flagged <0.3 — the Tamil south against the whole
      // subcontinent; keeping core.
      core: ['IN'],
      partial: ['LK', 'MV', 'MY', 'ID'],
    },
    capitals: [
      { name: 'Thanjavur', coordinates: [79.1378, 10.787], to: 1000 },
      { name: 'Gangaikonda Cholapuram', coordinates: [79.4485, 11.2054], from: 1000 },
    ],
    // hand-drawn: the tiger banner attested in Tamil literature; stylized reconstruction
    commons: 'Chola tiger banner (hand-drawn).svg',
    blurb:
      'A Tamil dynasty that ruled the Kaveri delta through temple-centred bureaucracy, took northern Sri Lanka, and sent a fleet against Srivijaya in 1025 — the rare Indian state to project power overseas. Pandya rivals absorbed it in the late thirteenth century.',
  },
  {
    id: 'empire-of-japan',
    name: 'Empire of Japan',
    answerAliases: ['Japan', 'Japanese Empire', 'Imperial Japan', 'Dai Nippon'],
    region: 'asia',
    tier: 'icon',
    keyframes: [
      // CShapes' Japan polygon never changes (home islands only), so the
      // colonial acquisitions and the 1942 high-water are hand-traced.
      { source: 'cshapes', year: 1886, date: '1886-01-01', gwcode: [740] },
      { source: 'handmade', year: 1910, file: 'empire-of-japan-1910.geojson' },
      { source: 'handmade', year: 1933, file: 'empire-of-japan-1933.geojson' },
      { source: 'handmade', year: 1942, file: 'empire-of-japan-1942.geojson' },
      { source: 'cshapes', year: 1946, date: '1946-01-01', gwcode: [740] },
    ],
    peakYear: 1942,
    members: {
      core: ['JP', 'KR', 'KP', 'TW'],
      partial: ['CN', 'PH', 'ID', 'MY', 'SG', 'MM', 'VN', 'LA', 'KH', 'TH', 'BN', 'PG'],
    },
    capitals: [{ name: 'Tokyo', coordinates: [139.6917, 35.6895] }],
    commons: 'War flag of the Imperial Japanese Army.svg',
    blurb:
      'Meiji industrialization turned an archipelago into a colonial power — Taiwan by 1895, Korea by 1910, Manchuria by 1932 — and by mid-1942 its occupation ran from Burma to New Guinea. Surrender in 1945 returned the state to the home islands.',
  },
  {
    id: 'vijayanagara',
    name: 'Vijayanagara Empire',
    answerAliases: ['Vijayanagar', 'Vijayanagara', 'Karnata Empire', 'Kingdom of Bisnaga'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      // Founded 1336 but first on the 1492 sheet.
      { source: 'basemaps', year: 1492, name: ['Vijayanagara'] },
      { source: 'basemaps', year: 1500, name: ['Vijayanagara'] },
      { source: 'basemaps', year: 1530, name: ['Vijayanagara'] },
      { source: 'basemaps', year: 1600, name: ['Vijayanagara'] },
    ],
    peakYear: 1530,
    members: {
      // aid: IN flagged <0.3 — the peninsular south against the whole
      // subcontinent; keeping core.
      core: ['IN'],
      partial: [],
    },
    capitals: [{ name: 'Vijayanagara', coordinates: [76.46, 15.335] }],
    // modern reconstruction, per Isaac
    commons: 'Flag of Vijaynagara.svg',
    blurb:
      'For two centuries the peninsular south answered to a capital on the Tungabhadra that travellers ranked among the world’s great cities. A sultanate coalition won at Talikota in 1565 and sacked it; the granite ruins at Hampi remain.',
  },
  {
    id: 'ayutthaya',
    name: 'Ayutthaya Kingdom',
    answerAliases: ['Ayutthaya', 'Ayuthaya', 'Siam', 'Ayutthaya Empire'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1400, name: ['Ayutthaya'] },
      { source: 'basemaps', year: 1500, name: ['Ayutthaya'] },
      { source: 'basemaps', year: 1600, name: ['Ayutthaya'] },
      { source: 'basemaps', year: 1700, name: ['Ayutthaya'] },
      { source: 'basemaps', year: 1715, name: ['Ayutthaya'] },
    ],
    peakYear: 1700,
    members: {
      core: ['TH'],
      partial: ['KH', 'LA', 'MM', 'MY'],
    },
    capitals: [{ name: 'Ayutthaya', coordinates: [100.5877, 14.3532] }],
    // attested: the plain red Siamese ensign
    commons: 'Flag of Thailand (Ayutthaya period).svg',
    blurb:
      'A Siamese river capital that outlasted four centuries of wars with Burma and Cambodia while trading with every fleet from Ryukyu to Versailles. Burmese armies razed the city in 1767; the court reconstituted itself downstream at Bangkok.',
  },
  {
    id: 'golden-horde',
    name: 'Golden Horde',
    answerAliases: ['Kipchak Khanate', 'Ulus of Jochi', 'Horde'],
    region: 'asia',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1279, name: ['Khanate of the Golden Horde'] },
      { source: 'basemaps', year: 1300, name: ['Khanate of the Golden Horde'] },
      { source: 'basemaps', year: 1400, name: ['Blue Horde', 'White Horde'] },
      { source: 'basemaps', year: 1492, name: ['Golden Horde'] },
    ],
    peakYear: 1300,
    members: {
      core: ['KZ'],
      partial: ['RU', 'UA', 'MD', 'RO', 'UZ', 'TM'],
    },
    capitals: [{ name: 'Sarai', coordinates: [47.35, 47.17] }],
    commons: 'Golden Horde flag 1339.svg',
    blurb:
      'The Jochid share of the Mongol partition: the steppe from the Danube to the Irtysh, taking tribute from the Russian principalities for over two centuries. It splintered into Kazan, Crimea and Astrakhan; the rump Great Horde dissolved after 1502.',
  },

  // --- Modern era ---------------------------------------------------------------
  {
    id: 'soviet-union',
    name: 'Soviet Union',
    answerAliases: ['USSR', 'Union of Soviet Socialist Republics', 'CCCP'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'cshapes', year: 1923, date: '1923-01-01', gwcode: [365] },
      { source: 'cshapes', year: 1938, date: '1938-01-01', gwcode: [365] },
      { source: 'cshapes', year: 1946, date: '1946-06-01', gwcode: [365] },
      { source: 'cshapes', year: 1980, date: '1980-01-01', gwcode: [365] },
      { source: 'cshapes', year: 1992, date: '1992-06-01', gwcode: [365] },
    ],
    peakYear: 1946,
    members: {
      core: [
        'RU', 'UA', 'BY', 'MD', 'EE', 'LV', 'LT', 'GE', 'AM', 'AZ',
        'KZ', 'KG', 'TJ', 'TM', 'UZ',
      ],
      partial: [],
    },
    capitals: [{ name: 'Moscow', coordinates: [37.6173, 55.7558] }],
    commons: 'Flag of the Soviet Union.svg',
    blurb:
      'Fifteen republics administered from Moscow across eleven time zones, at its widest extent after 1945. The union dissolved in December 1991, its border with the world becoming fifteen new ones overnight.',
  },

  // --- Europe ---------------------------------------------------------------------
  {
    id: 'roman-empire',
    name: 'Roman Empire',
    answerAliases: ['Rome', 'Ancient Rome', 'Roman Republic', 'Romans', 'SPQR'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: -200, name: ['Rome'] },
      { source: 'basemaps', year: -100, name: ['Roman Republic'] },
      { source: 'basemaps', year: -1, name: ['Roman Empire'] },
      { source: 'basemaps', year: 100, name: ['Roman Empire'] },
      { source: 'basemaps', year: 200, name: ['Roman Empire'] },
      // The 300 sheet splits the empire among the tetrarchs; 400 splits it
      // east/west — union the halves for whole-empire frames.
      {
        source: 'basemaps',
        year: 300,
        name: ['Rome (Constantinus)', 'Rome (Diocletianus)', 'Rome (Galerius)', 'Rome (Maximian)'],
      },
      { source: 'basemaps', year: 400, name: ['Western Roman Empire', 'Eastern Roman Empire'] },
    ],
    peakYear: 100,
    members: {
      // aid: RO demoted — Dacia falls only in 106, after the 100 CE peak
      // frame; HU demoted — Pannonia is the Transdanubian half only; DZ/LY
      // demoted like the other desert interiors. MT kept core (the island's
      // ring falls below the area floor, but Melita was a Roman municipium).
      // Interior micro-states (suggested by the aid) added as core.
      core: [
        'IT', 'ES', 'PT', 'FR', 'BE', 'LU', 'CH', 'AT', 'GR', 'TR',
        'CY', 'SY', 'LB', 'IL', 'PS', 'JO', 'EG', 'TN',
        'HR', 'SI', 'BA', 'RS', 'ME', 'MK', 'AL', 'XK', 'BG',
        'GB', 'MT', 'AD', 'LI', 'MC', 'SM', 'VA',
      ],
      partial: ['DZ', 'LY', 'HU', 'RO', 'NL', 'DE', 'MA', 'AM', 'GE', 'IQ', 'SA', 'UA', 'MD', 'SD'],
    },
    capitals: [{ name: 'Rome', coordinates: [12.4964, 41.9028] }],
    commons: 'Flag of the Roman Empire with Eagle (3-2).svg',
    blurb:
      'A city-state that came to ring the entire Mediterranean, holding it for centuries with forty-odd legions, a road network still traceable and a citizenship eventually extended to every free inhabitant. The western half dissolved in the fifth century; the east carried on from Constantinople.',
  },
  {
    id: 'macedonian-empire',
    name: 'Macedonian Empire',
    answerAliases: [
      'Empire of Alexander',
      'Alexander the Great',
      'Macedon',
      'Macedonia',
      'Alexandrian Empire',
    ],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      // Growth-only arc to Alexander's death, peak = final frame — the story
      // is the eleven-year sprint; Macedon is unnamed on the -400 sheet.
      { source: 'handmade', year: -336, file: 'macedonian-empire-bc336.geojson' },
      { source: 'handmade', year: -334, file: 'macedonian-empire-bc334.geojson' },
      { source: 'handmade', year: -330, file: 'macedonian-empire-bc330.geojson' },
      { source: 'basemaps', year: -323, name: ['Empire of Alexander'] },
    ],
    peakYear: -323,
    members: {
      // aid: JO flagged <0.3 — the desert interior again; demoted.
      core: ['GR', 'MK', 'TR', 'SY', 'LB', 'IL', 'PS', 'EG', 'IQ', 'IR', 'AF'],
      partial: ['JO', 'BG', 'AL', 'CY', 'TM', 'UZ', 'TJ', 'PK', 'IN', 'KW', 'AM', 'AZ', 'GE', 'LY'],
    },
    capitals: [
      { name: 'Pella', coordinates: [22.5254, 40.7615], to: -330 },
      { name: 'Babylon', coordinates: [44.4275, 32.5364], from: -330 },
    ],
    commons: 'Vergina Sun.svg',
    blurb:
      'Philip II’s reformed phalanx and his son’s eleven-year campaign carried Macedon from the Balkans to the Indus without losing a set battle. Alexander died at Babylon in 323 BCE with no adult heir, and his generals partitioned the conquest within a generation.',
  },
  {
    id: 'byzantine-empire',
    name: 'Byzantine Empire',
    answerAliases: ['Byzantium', 'Eastern Roman Empire', 'East Rome', 'Romania (Byzantine)'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 500, name: ['Eastern Roman Empire'] },
      { source: 'basemaps', year: 600, name: ['Eastern Roman Empire'] },
      { source: 'basemaps', year: 800, name: ['Byzantine Empire'] },
      { source: 'basemaps', year: 1000, name: ['Byzantine Empire'] },
      { source: 'basemaps', year: 1200, name: ['Byzantine Empire'] },
      { source: 'basemaps', year: 1400, name: ['Byzantine Empire'] },
    ],
    peakYear: 600,
    members: {
      // aid: VA/SM suggested core — declined for consistency with IT: at the
      // 600 peak only the exarchate strips were imperial; listed partial.
      core: ['GR', 'TR', 'CY', 'EG', 'SY', 'LB', 'IL', 'PS'],
      partial: [
        'IT', 'VA', 'SM', 'ES', 'TN', 'LY', 'DZ', 'JO', 'BG', 'MK',
        'RS', 'AL', 'ME', 'XK', 'BA', 'HR', 'MT', 'RO', 'GE', 'AM', 'UA',
      ],
    },
    capitals: [{ name: 'Constantinople', coordinates: [28.9784, 41.0082] }],
    commons: 'Byzantine imperial flag, 14th century.svg',
    blurb:
      'The Roman state carried on in Greek for another thousand years, holding Justinian’s reconquered Mediterranean briefly and Anatolia far longer. It contracted siege by siege until 1453, when Ottoman guns breached the Theodosian walls.',
  },
  {
    id: 'kalmar-union',
    name: 'Kalmar Union',
    answerAliases: ['Union of Kalmar', 'Scandinavian Union', 'Denmark-Norway-Sweden'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1400, name: ['Kalmar Union'] },
      // The 1492 sheet lists the crowns separately (Sweden under the Stures
      // still nominally in union) — union both; 1520 is Christian II's brief
      // reconquest, hand-traced.
      { source: 'basemaps', year: 1492, name: ['Denmark-Norway', 'Sweden'] },
      { source: 'basemaps', year: 1500, name: ['Kalmar Union'] },
      { source: 'handmade', year: 1520, file: 'kalmar-union-1520.geojson' },
    ],
    peakYear: 1492,
    members: {
      core: ['DK', 'NO', 'SE', 'FI'],
      partial: ['IS'],
    },
    capitals: [{ name: 'Copenhagen', coordinates: [12.5683, 55.6761] }],
    commons: 'Flag of the Kalmar Union.svg',
    blurb:
      'From 1397 one monarch held the crowns of Denmark, Norway and Sweden, a union covering all Scandinavia with Finland and Iceland. Sweden slipped in and out of it for a century; the Stockholm Bloodbath of 1520 provoked the revolt that ended it in 1523.',
  },
  {
    id: 'swedish-empire',
    name: 'Swedish Empire',
    answerAliases: ['Sweden', 'Great Power Sweden', 'Stormaktstiden'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1600, name: ['Sweden'] },
      { source: 'basemaps', year: 1650, name: ['Sweden'] },
      { source: 'basemaps', year: 1700, name: ['Sweden'] },
      { source: 'basemaps', year: 1715, name: ['Sweden'] },
    ],
    peakYear: 1650,
    members: {
      core: ['SE', 'FI'],
      partial: ['EE', 'LV', 'RU', 'DE', 'PL', 'DK'],
    },
    capitals: [{ name: 'Stockholm', coordinates: [18.0686, 59.3293] }],
    commons: 'Naval Ensign of Sweden.svg',
    blurb:
      'For a century after Gustavus Adolphus’s interventions the Baltic was close to a Swedish lake, ringed by Finland, Estonia, Livonia, Ingria and Pomeranian bridgeheads. The Great Northern War stripped the provinces away, sealed at Nystad in 1721.',
  },
  {
    id: 'habsburg-austria',
    name: 'Habsburg Monarchy',
    answerAliases: [
      'Austria-Hungary',
      'Austrian Empire',
      'Habsburg Empire',
      'Austria',
      'Austro-Hungarian Empire',
    ],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      // Austria appears under HRE labels before 1650 — the run opens there.
      { source: 'basemaps', year: 1650, name: ['Austrian Empire'] },
      { source: 'basemaps', year: 1715, name: ['Austrian Empire', 'Austrian Netherlands'] },
      {
        source: 'basemaps',
        year: 1783,
        name: ['Austrian Empire', 'Austrian Netherlands', 'Milano (Austria)'],
      },
      { source: 'basemaps', year: 1815, name: ['Austrian Empire'] },
      { source: 'cshapes', year: 1914, date: '1914-06-01', gwcode: [300] },
    ],
    peakYear: 1914,
    members: {
      core: ['AT', 'HU', 'CZ', 'SK', 'SI', 'HR', 'BA'],
      partial: ['IT', 'PL', 'UA', 'RO', 'RS', 'ME', 'BE', 'NL', 'LU'],
    },
    capitals: [{ name: 'Vienna', coordinates: [16.3738, 48.2082] }],
    commons: 'Flag of the Habsburg Monarchy.svg',
    blurb:
      'A dynastic accumulation — archduchy, kingdoms of Bohemia and Hungary, later a share of Poland — governed from Vienna in a dozen languages. Reorganized as Austria-Hungary in 1867, it dissolved within weeks of the 1918 armistice into half a dozen states.',
  },
  {
    id: 'napoleonic-france',
    name: 'Napoleonic France',
    answerAliases: [
      'First French Empire',
      'French Empire',
      'France',
      'Napoleon’s Empire',
      'Napoleonic Empire',
    ],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1800, name: ['France'] },
      { source: 'handmade', year: 1807, file: 'napoleonic-france-1807.geojson' },
      { source: 'handmade', year: 1812, file: 'napoleonic-france-1812.geojson' },
      { source: 'basemaps', year: 1815, name: ['France'] },
    ],
    peakYear: 1812,
    members: {
      // aid: AD/VA/MC suggested core — annexed with their surroundings
      // (Rome a département from 1809); listed partial, not scoreable.
      core: ['FR', 'BE', 'NL', 'LU'],
      partial: ['DE', 'IT', 'ES', 'CH', 'SI', 'HR', 'MC', 'VA', 'AD'],
    },
    capitals: [{ name: 'Paris', coordinates: [2.3522, 48.8566] }],
    commons: 'Flag of the First French Empire (with coat of arms).svg',
    blurb:
      'By 1812 the empire proper counted 130 departments, from Rome to Hamburg, with satellite kingdoms beyond — an order run on one legal code and conscription. The Russian campaign that year cost the Grande Armée, and the borders of 1815 reverted to those of 1789.',
  },
  {
    id: 'british-empire',
    name: 'British Empire',
    answerAliases: ['Britain', 'Great Britain', 'United Kingdom', 'England', 'UK'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      // The sheets are inconsistent about overlordship: some colonies carry a
      // UK SUBJECTO (its spelling drifts — 'UK', both long forms), most are
      // SUBJECTO'd to themselves and must be unioned by NAME, colony by
      // colony; dominions are drawn in too (the frame is the map-coloured
      // footprint; membership keeps them partial). Values verbatim per sheet.
      {
        source: 'basemaps',
        year: 1783,
        name: [
          'United Kingdom', 'Kingdom of Ireland', "Rupert's Land",
          'Acadian Peninsula (UK)', 'Bahamas',
        ],
        subjecto: ['UK', 'British East India Company'],
      },
      {
        source: 'basemaps',
        year: 1815,
        name: [
          'United Kingdom', 'United Kingdom of Great Britain and Ireland',
          'Canada', 'Cape Colony', 'Ceylon', 'Sierra Leone', 'Trinidad', 'Barbados',
        ],
        subjecto: [
          'United Kingdom',
          'United Kingdom of Great Britain and Ireland',
          'British East India Company',
        ],
      },
      {
        source: 'basemaps',
        year: 1880,
        name: [
          'United Kingdom of Great Britain and Ireland', 'Canada', 'Cape Colony',
          'Natal', 'Basutoland', 'Sierra Leone', 'British Guiana', 'Belize',
          'Ceylon', 'Malaya', 'Fiji', 'Malta',
          'New South Wales (UK)', 'Northern Territory (UK)', 'Queensland (UK)',
          'South Australia (UK)', 'Victoria (UK)', 'Western Australia (UK)',
        ],
        subjecto: ['United Kingdom', 'United Kingdom of Great Britain and Ireland', 'Great Britain'],
      },
      {
        source: 'basemaps',
        year: 1920,
        name: [
          'United Kingdom of Great Britain and Ireland', 'Canada', 'Australia',
          'New Zealand', 'Union of South Africa', 'Nigeria', 'Ghana',
          'Sierra Leone', 'Gambia, The', 'Kenya', 'Uganda',
          'Tanzania, United Republic of', 'Zambia', 'Zimbabwe', 'Malawi',
          'Botswana', 'Lesotho', 'Swaziland', 'Sudan', 'Ceylon', 'Malaysia',
          'Brunei', 'Jamaica', 'Trinidad', 'Barbados', 'Belize', 'Guyana',
          'Fiji', 'Papua New Guinea',
        ],
        subjecto: ['United Kingdom', 'United Kingdom of Great Britain and Ireland'],
      },
      {
        source: 'basemaps',
        year: 1938,
        // Éire left out (its 1937 constitution had ended the dominion
        // relationship in all but name); Egypt independent since 1922.
        name: [
          'United Kingdom', 'Canada', 'Dominion of Newfoundland', 'Australia',
          'New Zealand', 'Union of South Africa', 'India', 'Ceylon', 'Malawi',
          'Gambia, The', 'Sudan', 'Jamaica', 'Trinidad', 'Barbados', 'Bahamas',
          'Belize', 'Guyana', 'Fiji', 'Brunei', 'Kuwait', 'Jordan', 'Israel',
        ],
        subjecto: ['United Kingdom', 'United Kingdom of Great Britain and Ireland'],
      },
      {
        source: 'basemaps',
        year: 1960,
        // Dissolution frame: the dominions and already-independent colonies
        // are gone; what remains is what was still British on 1960-01-01.
        name: [
          'United Kingdom', 'Nigeria', 'Sierra Leone', 'Gambia, The', 'Kenya',
          'Uganda', 'Tanzania, United Republic of', 'Zambia', 'Zimbabwe',
          'Malawi', 'Botswana', 'Lesotho', 'Swaziland', 'Cyprus', 'Jamaica',
          'Trinidad', 'Bahamas', 'Belize', 'Guyana', 'Fiji', 'Brunei',
          'Kuwait', 'Qatar', 'United Arab Emirates',
        ],
        subjecto: ['United Kingdom'],
      },
    ],
    peakYear: 1920,
    members: {
      // Directly-ruled colonies and India at the 1920 peak are core; FJ and
      // BB promoted beyond the review list (both crown colonies since the
      // 1870s/1620s). Partial keeps the self-governing dominions and the
      // mandates/protectorates/condominium, plus Brunei, NA (South African
      // mandate) and SS (inside the condominium). aid: the <0.3 flags on the
      // island and sliver colonies (BB CY FJ IE JM MT SG …) are RING_CAP
      // artifacts — their rings drop smallest-first from a 46-ring frame.
      core: [
        'GB', 'IE', 'IN', 'PK', 'BD', 'LK', 'MM', 'MY', 'SG', 'NG',
        'GH', 'KE', 'UG', 'SL', 'GM', 'MW', 'ZM', 'ZW', 'BW', 'LS',
        'SZ', 'CY', 'MT', 'JM', 'TT', 'GY', 'BZ', 'BB', 'FJ',
      ],
      partial: [
        'CA', 'AU', 'NZ', 'ZA', 'EG', 'SD', 'SS', 'IQ', 'IL', 'PS',
        'JO', 'SO', 'YE', 'KW', 'BH', 'QA', 'AE', 'OM', 'PG', 'TZ',
        'BN', 'NA',
      ],
    },
    capitals: [{ name: 'London', coordinates: [-0.1276, 51.5074] }],
    commons: 'Flag of the United Kingdom.svg',
    blurb:
      'At the 1920 mandate settlement roughly a quarter of the world’s land and people answered in some form to London — colonies, dominions, protectorates and railways gauged to the shipping lanes between them. Decolonization ran its course inside two generations.',
  },
  {
    id: 'russian-empire',
    name: 'Russian Empire',
    answerAliases: ['Russia', 'Imperial Russia', 'Tsarist Russia', 'Muscovy'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      // The 1700 sheet still styles it the Tsardom (empire proclaimed 1721).
      { source: 'basemaps', year: 1700, name: ['Tsardom of Muscovy'] },
      { source: 'basemaps', year: 1800, name: ['Russian Empire'] },
      { source: 'basemaps', year: 1880, name: ['Russian Empire'] },
      // The 1914 sheet anachronistically splits out Finland and the Caucasus
      // as their own NAMEs — union the governorates back in.
      {
        source: 'basemaps',
        year: 1914,
        name: ['Russian Empire', 'Finland', 'Georgia', 'Armenia', 'Azerbaijan'],
        subjecto: ['Russia'],
      },
    ],
    peakYear: 1914,
    members: {
      // aid: MD flagged <0.3 — the 1914 sheet gives Bessarabia to Romania,
      // but it was the empire's Bessarabia Governorate until 1918; keeping.
      core: [
        'RU', 'UA', 'BY', 'MD', 'EE', 'LV', 'LT', 'FI', 'PL', 'GE',
        'AM', 'AZ', 'KZ', 'KG', 'UZ', 'TM', 'TJ',
      ],
      partial: ['TR'],
    },
    capitals: [
      { name: 'Moscow', coordinates: [37.6173, 55.7558], to: 1712 },
      { name: 'Saint Petersburg', coordinates: [30.3351, 59.9343], from: 1712 },
    ],
    commons: 'Flag of Russian Empire for private use (1914–1917) 3.svg',
    blurb:
      'Two centuries of expansion from Muscovy reached the Baltic under Peter, the Black Sea under Catherine, and the Pacific, Caucasus and Central Asia after — one subject in six was ethnically Russian. War strain broke the dynasty in February 1917.',
  },
  {
    id: 'third-reich',
    name: 'Third Reich',
    answerAliases: ['Nazi Germany', 'German Reich', 'Germany', 'Greater German Reich'],
    region: 'europe',
    tier: 'icon',
    keyframes: [
      // CShapes folds Anschluss and Munich into one 1938-09-30 step, and
      // Germany's polygon ends 1945-05-07 — the 1942 high-water and the
      // occupied 1946 rump are hand-traced.
      { source: 'cshapes', year: 1933, date: '1933-01-30', gwcode: [255] },
      { source: 'cshapes', year: 1938, date: '1938-10-01', gwcode: [255] },
      { source: 'handmade', year: 1942, file: 'third-reich-1942.geojson' },
      { source: 'handmade', year: 1946, file: 'third-reich-1946.geojson' },
    ],
    peakYear: 1942,
    members: {
      // aid: the coarse 1942 blob suggests every ally, satellite and swallowed
      // neutral as core — occupied and Axis-aligned states listed partial
      // instead; CH/LI/AD/SM/VA/MC declined outright (neutral or Italian-held).
      core: ['DE', 'AT'],
      partial: [
        'PL', 'CZ', 'FR', 'BE', 'NL', 'LU', 'DK', 'NO', 'GR', 'RS',
        'HR', 'SI', 'UA', 'BY', 'RU', 'EE', 'LV', 'LT', 'IT', 'HU',
        'RO', 'BG', 'SK', 'AL', 'ME', 'MK', 'XK', 'BA', 'MD',
      ],
    },
    capitals: [{ name: 'Berlin', coordinates: [13.405, 52.52] }],
    commons: 'Flag of Germany (1935–1945).svg',
    blurb:
      'The National Socialist state annexed Austria and the Sudetenland, then occupied most of the continent between 1939 and 1942, running an extermination system in the east. It capitulated in May 1945 and was partitioned into occupation zones.',
  },
  {
    id: 'polish-lithuanian-commonwealth',
    name: 'Polish–Lithuanian Commonwealth',
    answerAliases: ['Poland-Lithuania', 'Poland', 'Rzeczpospolita', 'Commonwealth of the Two Nations'],
    region: 'europe',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1530, name: ['Poland-Llituania'] },
      { source: 'basemaps', year: 1600, name: ['Poland-Llituania'] },
      { source: 'basemaps', year: 1650, name: ['Polish–Lithuanian Commonwealth'] },
      { source: 'basemaps', year: 1715, name: ['Polish–Lithuanian Commonwealth'] },
      { source: 'basemaps', year: 1783, name: ['Poland'] },
    ],
    peakYear: 1600,
    members: {
      core: ['PL', 'LT', 'BY', 'UA'],
      partial: ['LV', 'EE', 'MD', 'RU'],
    },
    capitals: [
      { name: 'Kraków', coordinates: [19.945, 50.0647], to: 1600 },
      { name: 'Warsaw', coordinates: [21.0122, 52.2297], from: 1600 },
    ],
    commons: 'Banner of Sigismund III Vasa.svg',
    blurb:
      'An elective monarchy of two nations whose szlachta — a tenth of the population — voted for kings and could veto any law, over territory from the Baltic nearly to the Black Sea. Three partitions by its neighbours erased it from the map by 1795.',
  },
  {
    id: 'venice',
    name: 'Republic of Venice',
    answerAliases: ['Venice', 'Venetian Republic', 'La Serenissima', 'Venetian Empire'],
    region: 'europe',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1300, name: ['Venice'] },
      { source: 'basemaps', year: 1400, name: ['Venice'] },
      { source: 'basemaps', year: 1500, name: ['Venice'] },
      { source: 'basemaps', year: 1600, name: ['Venice'] },
      { source: 'basemaps', year: 1700, name: ['Venice'] },
    ],
    peakYear: 1500,
    members: {
      // aid: IT will read <0.3 — a lagoon city plus its terraferma against
      // the whole peninsula; the republic is nowhere else, keeping core.
      core: ['IT'],
      partial: ['HR', 'GR', 'CY', 'ME', 'AL', 'SI'],
    },
    capitals: [{ name: 'Venice', coordinates: [12.3155, 45.4408] }],
    commons: 'Flag of the Republic of Venice.svg',
    blurb:
      'A lagoon republic that ran the eastern Mediterranean carrying trade for centuries from an arsenal capable of a galley a day, holding Crete, Cyprus and a chain of Adriatic ports. Napoleon dissolved the thousand-year state in 1797 without a battle.',
  },

  // --- Africa ---------------------------------------------------------------------
  {
    id: 'ancient-egypt',
    name: 'Ancient Egypt',
    answerAliases: ['Egypt', 'Egyptian Empire', 'Kingdom of Egypt', 'Kemet'],
    region: 'africa',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: -3000, name: ['Egypt'] },
      { source: 'basemaps', year: -2000, name: ['Egypt'] },
      { source: 'basemaps', year: -1500, name: ['Egypt'] },
      { source: 'basemaps', year: -1000, name: ['Egypt'] },
      { source: 'basemaps', year: -700, name: ['Egypt'] },
    ],
    peakYear: -1500,
    members: {
      // aid: EG flagged <0.3 — the extent is the settled Nile strip, modern
      // Egypt is mostly open desert; the state is nowhere else, keeping core.
      core: ['EG'],
      partial: ['SD', 'IL', 'PS', 'JO', 'LB', 'SY'],
    },
    capitals: [
      { name: 'Memphis', coordinates: [31.2544, 29.8444], to: -1500 },
      { name: 'Thebes', coordinates: [32.6396, 25.7188], from: -1500 },
    ],
    // emblem, not a banner - attested iconography (Toltec precedent)
    commons: 'Eye of Horus.svg',
    blurb:
      'A state organized around one river for close to three millennia, its reach stretching up the Nile into Nubia and along the Levantine coast at the New Kingdom height. The frames end with the eighth-century Kushite dynasty, when kings from the south ruled the valley.',
  },
  {
    id: 'carthage',
    name: 'Carthage',
    answerAliases: ['Carthaginian Empire', 'Punic Empire', 'Carthaginians'],
    region: 'africa',
    tier: 'icon',
    keyframes: [
      // The -700 snapshot has no Carthage feature yet — the run opens at -500.
      { source: 'basemaps', year: -500, name: ['Carthaginian Empire'] },
      { source: 'basemaps', year: -400, name: ['Carthaginian Empire'] },
      { source: 'basemaps', year: -300, name: ['Carthaginian Empire'] },
      { source: 'basemaps', year: -200, name: ['Carthage'] },
    ],
    peakYear: -300,
    members: {
      core: ['TN'],
      partial: ['DZ', 'LY', 'MA', 'ES', 'IT', 'MT'],
    },
    capitals: [{ name: 'Carthage', coordinates: [10.3236, 36.8528] }],
    // hand-drawn: the Tanit sign and crescent-disc from Punic stelae on Tyrian purple
    commons: 'Sign of Tanit banner (hand-drawn).svg',
    blurb:
      'A Phoenician harbour city that came to run the western Mediterranean — Sardinia, western Sicily, the Iberian coast — on shipping lanes rather than land. Three wars with Rome ended with the city razed in 146 BCE and its fields annexed as a Roman province.',
  },
  {
    id: 'mali-empire',
    name: 'Mali Empire',
    answerAliases: ['Mali', 'Malian Empire', 'Manden'],
    region: 'africa',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1279, name: ['Mali'] },
      { source: 'basemaps', year: 1300, name: ['Mali'] },
      { source: 'basemaps', year: 1400, name: ['Mali'] },
      { source: 'basemaps', year: 1500, name: ['Mali'] },
    ],
    peakYear: 1300,
    members: {
      core: ['ML', 'SN', 'GM', 'GN'],
      partial: ['MR', 'BF', 'NE', 'GW'],
    },
    capitals: [{ name: 'Niani', coordinates: [-8.4, 11.37] }],
    // modern reconstruction, per Isaac
    commons: 'Flag of the Mali Empire.svg',
    blurb:
      'Gold from the Bure and Bambuk fields underwrote a Mande state spanning the upper Niger to the Atlantic; Mansa Musa’s 1324 pilgrimage moved enough of it to depress prices in Cairo. Songhai and Mossi pressure pared the empire back to its heartland by the fifteenth century.',
  },
  {
    id: 'songhai-empire',
    name: 'Songhai Empire',
    answerAliases: ['Songhai', 'Songhay', 'Songhay Empire'],
    region: 'africa',
    tier: 'icon',
    keyframes: [
      // Not named at 1400; the 1600 frame is the Dendi remnant after Tondibi.
      { source: 'basemaps', year: 1492, name: ['Songhai'] },
      { source: 'basemaps', year: 1500, name: ['Songhai'] },
      { source: 'basemaps', year: 1530, name: ['Songhai'] },
      { source: 'basemaps', year: 1600, name: ['Songhai'] },
    ],
    peakYear: 1500,
    members: {
      // aid: NE flagged <0.3 — Songhai held only the river's right bank and
      // Aïr's edge, a sliver of modern Niger; demoted.
      core: ['ML'],
      partial: ['NE', 'SN', 'MR', 'BF', 'NG', 'GM', 'GN'],
    },
    capitals: [{ name: 'Gao', coordinates: [-0.0447, 16.2666] }],
    // raster source; hand-simplified SVG committed alongside
    commons: 'Flag of the Songhai Empire.jpg',
    blurb:
      'From Gao the askias ran the largest state in West African history, taxing the Niger bend trade through Timbuktu and Djenné. A Moroccan expedition with firearms crossed the Sahara and broke the army at Tondibi in 1591; a remnant held out downriver in Dendi.',
  },
  {
    id: 'ghana-empire',
    name: 'Ghana Empire',
    answerAliases: ['Ghana', 'Wagadu', 'Awkar', 'Empire of Ghana'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 800, name: ['Ghana'] },
      { source: 'basemaps', year: 900, name: ['Ghana'] },
      { source: 'basemaps', year: 1000, name: ['Ghana'] },
      { source: 'basemaps', year: 1100, name: ['Ghana'] },
      { source: 'basemaps', year: 1200, name: ['Ghana'] },
    ],
    peakYear: 1000,
    members: {
      // aid: ML/MR flagged <0.3 — the polity sits on their shared Sahel edge
      // and both are mostly Sahara; it is unambiguously in these two, keeping.
      core: ['MR', 'ML'],
      partial: ['SN'],
    },
    capitals: [{ name: 'Koumbi Saleh', coordinates: [-7.97, 15.77] }],
    // hand-drawn INVENTED emblem (salt/gold trade halves); no Wagadu iconography survives
    commons: 'Wagadu trade emblem (hand-drawn).svg',
    blurb:
      'The first of the Sahelian trading empires, brokering Saharan salt against Bambuk gold from a twin capital on the desert edge — in modern Mauritania and Mali, not the republic that later took its name. It faded through the twelfth century and its lands passed to rising Mali.',
  },
  {
    id: 'ethiopian-empire',
    name: 'Ethiopian Empire',
    answerAliases: ['Ethiopia', 'Abyssinia', 'Abyssinian Empire'],
    region: 'africa',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1400, name: ['Ethiopia'] },
      { source: 'basemaps', year: 1600, name: ['Ethiopia'] },
      { source: 'basemaps', year: 1800, name: ['Ethiopia'] },
      { source: 'cshapes', year: 1900, date: '1900-01-01', gwcode: [530] },
      { source: 'cshapes', year: 1955, date: '1955-01-01', gwcode: [530] },
    ],
    peakYear: 1900,
    members: {
      core: ['ET'],
      partial: ['ER', 'DJ', 'SO', 'SD'],
    },
    capitals: [
      { name: 'Gondar', coordinates: [37.4667, 12.6], from: 1600, to: 1900 },
      { name: 'Addis Ababa', coordinates: [38.7469, 9.0301], from: 1900 },
    ],
    commons: 'Flag of Ethiopia (1897-1936).svg',
    blurb:
      'A Christian highland monarchy tracing its line to Solomon, alternately contracting under invasion and expanding across the Horn. Menelik II’s victory at Adwa in 1896 kept it off the colonial map; the monarchy itself ended with Haile Selassie’s deposition in 1974.',
  },
  {
    id: 'zulu-kingdom',
    name: 'Zulu Kingdom',
    answerAliases: ['Zulu', 'Zulu Empire', 'Zululand', 'KwaZulu'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1815, name: ['Zulu'] },
      { source: 'handmade', year: 1830, file: 'zulu-kingdom-1830.geojson' },
      { source: 'handmade', year: 1870, file: 'zulu-kingdom-1870.geojson' },
      { source: 'basemaps', year: 1880, name: ['Zululand'] },
    ],
    peakYear: 1830,
    members: {
      // The kingdom is one corner of modern South Africa — coverage is
      // necessarily thin; ZA stays core because the polity is nowhere else.
      core: ['ZA'],
      partial: ['SZ', 'MZ'],
    },
    capitals: [{ name: 'Ulundi', coordinates: [31.4166, -28.3352] }],
    commons: 'Zulu flag.svg',
    blurb:
      'Shaka reorganized a minor chiefdom into a regimental state that dominated the country between the Pongola and the Tugela within a decade. The kingdom destroyed a British column at Isandlwana in 1879, was partitioned the same year, and was annexed in 1887.',
  },
  {
    id: 'sokoto-caliphate',
    name: 'Sokoto Caliphate',
    answerAliases: ['Sokoto', 'Fulani Empire', 'Fulani Caliphate', 'Sokoto Empire'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'handmade', year: 1804, file: 'sokoto-caliphate-1804.geojson' },
      { source: 'basemaps', year: 1815, name: ['Fulani Empire'] },
      { source: 'basemaps', year: 1880, name: ['Sokoto Caliphate'] },
      { source: 'basemaps', year: 1900, name: ['Sokoto Caliphate'] },
    ],
    peakYear: 1880,
    members: {
      core: ['NG'],
      partial: ['NE', 'CM', 'BJ', 'BF'],
    },
    capitals: [{ name: 'Sokoto', coordinates: [5.2339, 13.0059], from: 1809 }],
    commons: 'Flag of the Sokoto Caliphate.svg',
    blurb:
      'Usman dan Fodio’s 1804 jihad federated the Hausa lands into some thirty emirates answering to Sokoto, one of the century’s largest states anywhere. British forces took the capital in 1903 and folded the emirates into Northern Nigeria under indirect rule.',
  },
  {
    id: 'kongo-kingdom',
    name: 'Kingdom of Kongo',
    answerAliases: ['Kongo', 'Congo Kingdom', 'Kongo Empire'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      // Founded around 1390 but first named in the 1492 snapshot.
      { source: 'basemaps', year: 1492, name: ['Congo'] },
      { source: 'basemaps', year: 1530, name: ['Congo'] },
      { source: 'basemaps', year: 1600, name: ['Congo'] },
      { source: 'basemaps', year: 1650, name: ['Congo'] },
      { source: 'basemaps', year: 1700, name: ['Congo'] },
    ],
    peakYear: 1600,
    members: {
      // aid: AO/CD flagged <0.3 — the kingdom is the far northwest corner of
      // Angola (the capital's country, kept core); the DRC share is a western
      // sliver of a huge country, demoted.
      core: ['AO'],
      partial: ['CD', 'CG', 'GA'],
    },
    capitals: [{ name: 'Mbanza Kongo', coordinates: [14.2401, -6.2678] }],
    commons: 'Flag of the Kingdom of Kongo according to Giovanni Cavazzi da Montecuccolo.svg',
    blurb:
      'A centralized monarchy south of the Congo mouth that exchanged embassies with Lisbon and the Vatican, its kings baptized from 1491. The Atlantic slave trade it was drawn into corroded it; after the battle of Mbwila in 1665 the kingdom fragmented into civil war.',
  },
  {
    id: 'almoravid-almohad',
    name: 'Almohad Caliphate',
    answerAliases: [
      'Almohads',
      'Almohad Empire',
      'Almoravids',
      'Almoravid Empire',
      'Almoravid dynasty',
    ],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      // One arc for the two Berber reform empires that succeeded each other.
      { source: 'basemaps', year: 1100, name: ['Almoravid dynasty'] },
      { source: 'handmade', year: 1150, file: 'almoravid-almohad-1150.geojson' },
      { source: 'basemaps', year: 1200, name: ['Almohad Caliphate'] },
      { source: 'handmade', year: 1250, file: 'almoravid-almohad-1250.geojson' },
    ],
    peakYear: 1200,
    members: {
      core: ['MA'],
      partial: ['ES', 'PT', 'DZ', 'TN', 'LY', 'MR', 'ML'],
    },
    capitals: [{ name: 'Marrakesh', coordinates: [-7.9811, 31.6295] }],
    // attested: the Almoravid black standard
    commons: 'Black standard of the Almoravids.svg',
    blurb:
      'Two successive Berber reform movements ruled from Marrakesh, at their widest joining Iberia and the Maghreb to the edge of the Sahara under one authority. The defeat at Las Navas de Tolosa in 1212 began the unravelling; the Marinids took what remained.',
  },
  {
    id: 'aksum',
    name: 'Kingdom of Aksum',
    answerAliases: ['Aksum', 'Axum', 'Aksumite Empire', 'Axumite Empire'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 100, name: ['Axum'] },
      { source: 'basemaps', year: 200, name: ['Axum'] },
      { source: 'basemaps', year: 300, name: ['Axum'] },
      { source: 'basemaps', year: 500, name: ['Axum'] },
      { source: 'basemaps', year: 700, name: ['Axum'] },
    ],
    peakYear: 500,
    members: {
      core: ['ET', 'ER'],
      partial: ['SD', 'SS', 'DJ', 'YE', 'SA'],
    },
    capitals: [{ name: 'Aksum', coordinates: [38.7167, 14.1211] }],
    // hand-drawn after Aksumite coinage: cross-in-disc with wheat stalks
    commons: 'Aksumite coin device (hand-drawn).svg',
    blurb:
      'A Red Sea trading state that minted its own gold coinage, raised monolithic stelae, and adopted Christianity in the fourth century — at times ruling both shores of the strait. Its ports declined as trade routes shifted after the seventh century, and the centre moved inland.',
  },
  {
    id: 'kanem-bornu',
    name: 'Kanem–Bornu Empire',
    answerAliases: ['Kanem', 'Bornu', 'Kanem Empire', 'Bornu Empire', 'Kanem-Bornu'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 900, name: ['Kanem'] },
      { source: 'basemaps', year: 1100, name: ['Kanem'] },
      { source: 'basemaps', year: 1200, name: ['Kanem'] },
      { source: 'basemaps', year: 1400, name: ['Bornu-Kanem'] },
      { source: 'basemaps', year: 1600, name: ['Bornu-Kanem'] },
    ],
    peakYear: 1600,
    members: {
      // aid: all three flagged <0.3 — a Lake Chad polity against three huge
      // Saharan states. TD (Kanem heartland) and NG (Bornu, the 1600 seat)
      // kept core; NE's share is a border strip, demoted.
      core: ['TD', 'NG'],
      partial: ['NE', 'CM', 'LY'],
    },
    capitals: [
      { name: 'Njimi', coordinates: [15.2, 13.8], to: 1400 },
      { name: 'Ngazargamu', coordinates: [11.9, 12.95], from: 1400 },
    ],
    commons: 'Flag of the Kanem-Bornu Empire.svg',
    blurb:
      'A dynasty that ruled around Lake Chad for roughly a thousand years, shifting its seat from Kanem east of the lake to Bornu west of it in the fourteenth century. It taxed the central Saharan road to Tripoli and reached a second height under Idris Alooma around 1600.',
  },
  {
    id: 'benin-empire',
    name: 'Benin Empire',
    answerAliases: ['Benin', 'Kingdom of Benin', 'Edo Empire', 'Edo Kingdom'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1400, name: ['Benin'] },
      { source: 'basemaps', year: 1500, name: ['Benin'] },
      { source: 'basemaps', year: 1600, name: ['Benin'] },
      { source: 'basemaps', year: 1700, name: ['Benin'] },
      { source: 'basemaps', year: 1880, name: ['Benin'] },
    ],
    peakYear: 1600,
    members: {
      // aid: NG flagged <0.3 — a forest kingdom in one corner of modern
      // Nigeria; the polity is nowhere else, keeping core.
      core: ['NG'],
      partial: ['BJ'],
    },
    capitals: [{ name: 'Benin City', coordinates: [5.6258, 6.335] }],
    commons: 'Flag of the Benin Empire.svg',
    blurb:
      'An Edo kingdom in the forest of modern southern Nigeria — not the later republic — whose capital was ringed by earthworks among the largest ever dug, and whose court cast the famous brass plaques. A British expedition burned the city in 1897 and carried the bronzes off.',
  },
  {
    id: 'ashanti-empire',
    name: 'Ashanti Empire',
    answerAliases: ['Ashanti', 'Asante', 'Asante Empire', 'Ashanti Kingdom', 'Asanteman'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1715, name: ['Asante'] },
      { source: 'basemaps', year: 1783, name: ['Asante'] },
      { source: 'basemaps', year: 1800, name: ['Asante'] },
      { source: 'basemaps', year: 1815, name: ['Asante'] },
      { source: 'basemaps', year: 1880, name: ['Asante'] },
    ],
    peakYear: 1815,
    members: {
      core: ['GH'],
      partial: ['CI', 'TG'],
    },
    capitals: [{ name: 'Kumasi', coordinates: [-1.6244, 6.6885] }],
    commons: 'Flag of Ashanti.svg',
    blurb:
      'A union of Akan states sworn around the Golden Stool at Kumasi, grown rich on gold and kola and fielding armies that beat the British more than once. Five Anglo-Ashanti wars ended in annexation in 1902; the stool itself was never surrendered.',
  },
  {
    id: 'mamluk-sultanate',
    name: 'Mamluk Sultanate',
    answerAliases: ['Mamluks', 'Mameluke Sultanate', 'Mamelukes', 'Mamluk Egypt'],
    region: 'africa',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 1279, name: ['Mamluke Sultanate'] },
      { source: 'basemaps', year: 1300, name: ['Mamluke Sultanate'] },
      { source: 'basemaps', year: 1400, name: ['Mamluke Sultanate'] },
      { source: 'basemaps', year: 1492, name: ['Mamluke Sultanate'] },
      { source: 'basemaps', year: 1500, name: ['Mamluke Sultanate'] },
    ],
    peakYear: 1300,
    members: {
      // aid: SY flagged <0.3 — the 1300 snapshot pushes the Ilkhanid frontier
      // deep into the Syrian steppe; Damascus, Aleppo and the settled west
      // were Mamluk throughout the sultanate, keeping core.
      core: ['EG', 'IL', 'PS', 'LB', 'JO', 'SY'],
      partial: ['SA', 'LY', 'SD', 'TR'],
    },
    capitals: [{ name: 'Cairo', coordinates: [31.2357, 30.0444] }],
    commons: 'Mameluke Flag.svg',
    blurb:
      'A regime of slave-soldiers who overthrew their masters, stopped the Mongols at Ain Jalut in 1260, and expelled the last Crusader states. From Cairo they ruled Egypt and Syria until Ottoman artillery ended the sultanate in 1517.',
  },

  // --- South America ------------------------------------------------------------
  {
    id: 'gran-colombia',
    name: 'Gran Colombia',
    answerAliases: ['Great Colombia', 'Republic of Colombia (1819)'],
    region: 'south-america',
    tier: 'icon',
    keyframes: [
      { source: 'handmade', year: 1819, file: 'gran-colombia-1819.geojson' },
      { source: 'handmade', year: 1822, file: 'gran-colombia-1822.geojson' },
      { source: 'handmade', year: 1826, file: 'gran-colombia-1826.geojson' },
      { source: 'handmade', year: 1830, file: 'gran-colombia-1830.geojson' },
    ],
    peakYear: 1826,
    members: {
      core: ['CO', 'VE', 'EC', 'PA'],
      partial: ['PE', 'GY', 'BR'],
    },
    capitals: [{ name: 'Bogotá', coordinates: [-74.0721, 4.711] }],
    commons: 'Flag of the Gran Colombia.svg',
    blurb:
      'The republic proclaimed at Angostura in 1819 came to span modern Colombia, Venezuela, Ecuador and Panama. It held together for barely a decade before Venezuela and Ecuador withdrew, and it dissolved in 1831.',
  },
  {
    id: 'inca-empire',
    name: 'Inca Empire',
    answerAliases: ['Tawantinsuyu', 'Incan Empire', 'Inka Empire'],
    region: 'south-america',
    tier: 'icon',
    keyframes: [
      // Snapshots name the Inca only from 1500 — the Cusco rise and the
      // Vilcabamba rump are hand-traced.
      { source: 'handmade', year: 1438, file: 'inca-empire-1438.geojson' },
      { source: 'basemaps', year: 1500, name: ['Inca Empire'] },
      { source: 'basemaps', year: 1530, name: ['Inca Empire'] },
      { source: 'handmade', year: 1572, file: 'inca-empire-1572.geojson' },
    ],
    peakYear: 1530,
    members: {
      // aid: BO flagged <0.3 peak overlap — the extent misses Bolivia's eastern
      // lowlands, but highland Collasuyu was unambiguously Inca; keeping core.
      core: ['PE', 'EC', 'BO'],
      partial: ['CL', 'AR', 'CO'],
    },
    capitals: [{ name: 'Cusco', coordinates: [-71.9675, -13.5319] }],
    commons: 'Suntur Paucar.svg',
    blurb:
      'From Cusco a road network of some 40,000 kilometres bound the Andes from southern Colombia to central Chile, administered without writing or the wheel. Smallpox, civil war and the Spanish arrival broke the state within a decade of its widest extent; the last stronghold at Vilcabamba fell in 1572.',
  },
  {
    id: 'wari-empire',
    name: 'Wari Empire',
    answerAliases: ['Huari Empire', 'Wari', 'Huari'],
    region: 'south-america',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 600, name: ['Huari Empire'] },
      { source: 'basemaps', year: 700, name: ['Huari Empire'] },
      { source: 'basemaps', year: 800, name: ['Huari Empire'] },
      { source: 'basemaps', year: 900, name: ['Huari Empire'] },
      { source: 'basemaps', year: 1000, name: ['Huari Empire'] },
    ],
    peakYear: 800,
    members: {
      core: ['PE'],
      partial: ['BO', 'CL'],
    },
    capitals: [{ name: 'Wari', coordinates: [-74.1667, -13.0667] }],
    // hand-drawn after a museum textile photograph; emblematic, not a flag
    commons: 'Wari textile reconstruction (hand-drawn).svg',
    blurb:
      'Centuries before the Inca, planned administrative cities and terraced hillsides spread from a capital near modern Ayacucho across highland and coastal Peru. The state came apart around 1000, leaving roads and provincial centres the Inca later built upon.',
  },
  {
    id: 'tiwanaku',
    name: 'Tiwanaku',
    answerAliases: ['Tiahuanaco', 'Tiwanaku Empire', 'Tiahuanaco Empire'],
    region: 'south-america',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 600, name: ['Tiahuanaco Empire'] },
      { source: 'basemaps', year: 700, name: ['Tiahuanaco Empire'] },
      { source: 'basemaps', year: 800, name: ['Tiahuanaco Empire'] },
      { source: 'basemaps', year: 900, name: ['Tiahuanaco Empire'] },
      { source: 'basemaps', year: 1000, name: ['Tiahuanaco Empire'] },
    ],
    peakYear: 800,
    members: {
      // aid: BO flagged <0.3 peak overlap — the polity is the Bolivian
      // altiplano (the capital is in Bolivia); the lowlands drag coverage down.
      core: ['BO'],
      partial: ['PE', 'CL'],
    },
    capitals: [{ name: 'Tiwanaku', coordinates: [-68.6733, -16.5544] }],
    commons: 'Flag of Tiahuanacu, Bolivia.svg',
    blurb:
      'A ceremonial city on the shore of Lake Titicaca, nearly four kilometres above the sea, anchored colonies and caravan routes across the southern Andes for half a millennium. The centre was abandoned around 1000, possibly after a long drought.',
  },
  {
    id: 'portuguese-brazil',
    name: 'Portuguese Brazil',
    answerAliases: ['Colonial Brazil', 'Brazil', 'Viceroyalty of Brazil'],
    region: 'south-america',
    tier: 'icon',
    keyframes: [
      { source: 'handmade', year: 1560, file: 'portuguese-brazil-1560.geojson' },
      { source: 'basemaps', year: 1650, name: ['Portuguese Brazil'] },
      { source: 'basemaps', year: 1700, name: ['Portuguese Brazil'] },
      { source: 'basemaps', year: 1783, name: ['Vice-Royalty of Brazil'] },
      { source: 'basemaps', year: 1800, name: ['Vice-Royalty of Brazil'] },
    ],
    peakYear: 1800,
    members: {
      core: ['BR'],
      partial: ['UY'],
    },
    capitals: [
      { name: 'Salvador', coordinates: [-38.5108, -12.9714], to: 1763 },
      { name: 'Rio de Janeiro', coordinates: [-43.1729, -22.9068], from: 1763 },
    ],
    commons: 'Flag of the Kingdom of Brazil (1822).svg',
    blurb:
      'Three centuries of bandeirante expeditions, cattle trails and gold strikes pushed the colony from a string of coastal captaincies to roughly half a continent, far past the Tordesillas line. The court moved to Rio de Janeiro in 1808, and the colony left the empire as an independent monarchy in 1822.',
  },

  // --- North America ------------------------------------------------------------
  {
    id: 'aztec-empire',
    name: 'Aztec Empire',
    answerAliases: ['Aztecs', 'Mexica Empire', 'Triple Alliance', 'Aztec Triple Alliance'],
    region: 'north-america',
    tier: 'icon',
    keyframes: [
      { source: 'handmade', year: 1428, file: 'aztec-empire-1428.geojson' },
      { source: 'handmade', year: 1440, file: 'aztec-empire-1440.geojson' },
      { source: 'basemaps', year: 1492, name: ['Mexihcah (Triple Alliance)'] },
      { source: 'basemaps', year: 1500, name: ['Aztec Empire'] },
    ],
    peakYear: 1500,
    members: {
      core: ['MX'],
      partial: ['GT'],
    },
    capitals: [{ name: 'Tenochtitlan', coordinates: [-99.1332, 19.4326] }],
    // hand-drawn after a Codex Mendoza warrior shield: the xicalcoliuhqui stepped fret
    commons: 'Codex Mendoza chimalli (hand-drawn).svg',
    blurb:
      'A tribute network run from an island city of causeways and floating gardens, extracting cacao, quetzal feathers and captives from central Mexico to the Pacific coast. Tenochtitlan fell to a Spanish-Tlaxcalan siege in 1521, two years after first contact.',
  },
  {
    id: 'maya-city-states',
    name: 'Maya City-States',
    answerAliases: ['Maya', 'Mayan Empire', 'Maya civilization', 'Mayans'],
    region: 'north-america',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 300, name: ['Maya chiefdoms and states'] },
      { source: 'basemaps', year: 500, name: ['Maya states'] },
      { source: 'basemaps', year: 600, name: ['Maya states'] },
      { source: 'basemaps', year: 700, name: ['Maya states'] },
      { source: 'basemaps', year: 800, name: ['Maya city-states'] },
      { source: 'basemaps', year: 900, name: ['Maya city-states'] },
    ],
    peakYear: 700,
    members: {
      core: ['GT', 'BZ'],
      partial: ['MX', 'HN', 'SV'],
    },
    capitals: [
      { name: 'Tikal', coordinates: [-89.6237, 17.2221], to: 900 },
      { name: 'Chichén Itzá', coordinates: [-88.5686, 20.6843], from: 800 },
    ],
    commons: 'Flag of the Mayan People.svg',
    blurb:
      'Never one empire but a lattice of rival kingdoms — Tikal, Calakmul, Copán — sharing a script, a calendar and a ballgame across the Yucatán lowlands. The southern cities were abandoned to the forest during the ninth century; the north carried on for centuries more.',
  },
  {
    id: 'toltec-empire',
    name: 'Toltec Empire',
    answerAliases: ['Toltecs', 'Tollan'],
    region: 'north-america',
    tier: 'deep-cut',
    keyframes: [
      { source: 'basemaps', year: 900, name: ['Toltec Empire'] },
      { source: 'basemaps', year: 1000, name: ['Toltec Empire'] },
      { source: 'basemaps', year: 1100, name: ['Toltec Empire'] },
      { source: 'handmade', year: 1150, file: 'toltec-empire-1150.geojson' },
    ],
    peakYear: 1000,
    members: {
      core: ['MX'],
      partial: [],
    },
    capitals: [{ name: 'Tula', coordinates: [-99.3396, 20.0645] }],
    commons: 'Toltec Emblem.svg',
    blurb:
      'The warrior-columned city of Tula dominated central Mexico between Teotihuacan’s fall and the Aztec rise. Tula burned around 1150, and later Aztec kings claimed Toltec descent to legitimize their own rule.',
  },
  {
    id: 'new-spain',
    name: 'New Spain',
    answerAliases: ['Viceroyalty of New Spain', 'Spanish Mexico', 'Nueva España'],
    region: 'north-america',
    tier: 'icon',
    keyframes: [
      { source: 'basemaps', year: 1530, name: ['Vice Royalty of New Spain'] },
      { source: 'basemaps', year: 1600, name: ['Vice Royalty of New Spain'] },
      { source: 'basemaps', year: 1700, name: ['Vice-Royalty of New Spain'] },
      { source: 'basemaps', year: 1783, name: ['Vice-Royalty of New Spain'] },
      { source: 'basemaps', year: 1800, name: ['Vice-Royalty of New Spain'] },
    ],
    peakYear: 1783,
    members: {
      // aid: CU/DO flagged <0.3 — the Caribbean captaincies-general were only
      // nominally under the viceroy and the extent omits them; demoted.
      core: ['MX', 'GT', 'SV', 'HN', 'NI', 'CR'],
      partial: ['US', 'BZ', 'PH', 'CU', 'DO'],
    },
    capitals: [{ name: 'Mexico City', coordinates: [-99.1332, 19.4326] }],
    commons: 'Flag of Cross of Burgundy.svg',
    blurb:
      'The viceroyalty governed from the rebuilt Aztec capital stretched from Central America to California, its silver shipped through Veracruz and, via the Manila galleon, across the Pacific. It came apart in the independence wars of 1810–1821.',
  },
  {
    id: 'new-france',
    name: 'New France',
    answerAliases: ['French Canada', 'Nouvelle-France', 'French colonial empire in North America'],
    region: 'north-america',
    tier: 'icon',
    keyframes: [
      // Basemaps only name New France at 1650/1700 — the founding strip and
      // the pre-Utrecht maximum are hand-traced.
      { source: 'handmade', year: 1608, file: 'new-france-1608.geojson' },
      { source: 'basemaps', year: 1650, name: ['New France'] },
      { source: 'basemaps', year: 1700, name: ['New France'] },
      { source: 'handmade', year: 1712, file: 'new-france-1712.geojson' },
    ],
    peakYear: 1712,
    members: {
      // aid: CA flagged <0.3 — the colony was the settled south (St Lawrence,
      // Great Lakes, Acadia); the Arctic landmass drags coverage down.
      core: ['CA'],
      partial: ['US'],
    },
    capitals: [{ name: 'Quebec', coordinates: [-71.2082, 46.8139] }],
    commons: 'Royal flag of France.svg',
    blurb:
      'A fur-trade corridor along the St Lawrence that fanned out through the Great Lakes and down the Mississippi to the Gulf, claiming half a continent with a settler population smaller than one English colony. Utrecht trimmed it in 1713 and the fall of Quebec ended it in 1760.',
  },
  {
    id: 'us-expansion',
    name: 'United States',
    answerAliases: ['USA', 'United States of America', 'America'],
    region: 'north-america',
    tier: 'icon',
    keyframes: [
      // Growth-only arc, peak = final frame — deliberate exception: the story
      // is the expansion itself, not a dissolution.
      { source: 'basemaps', year: 1783, name: ['United States of America'] },
      { source: 'basemaps', year: 1800, name: ['United States of America'] },
      { source: 'basemaps', year: 1815, name: ['United States'] },
      { source: 'basemaps', year: 1880, name: ['United States of America'] },
      { source: 'cshapes', year: 1912, date: '1912-02-15', gwcode: [2] },
      { source: 'cshapes', year: 1959, date: '1959-08-22', gwcode: [2] },
    ],
    peakYear: 1959,
    members: {
      core: ['US'],
      partial: ['PH', 'CU'],
    },
    capitals: [
      { name: 'Philadelphia', coordinates: [-75.1652, 39.9526], to: 1800 },
      { name: 'Washington', coordinates: [-77.0369, 38.9072], from: 1800 },
    ],
    commons: 'Betsy Ross flag.svg',
    blurb:
      'Thirteen Atlantic states bought, annexed and conquered their way west — Louisiana in 1803, Texas and the Mexican cession by 1848, Alaska by purchase in 1867 — reaching the present fifty states in 1959. The frame here stops at the borders; the overseas holdings came and mostly went.',
  },
]
