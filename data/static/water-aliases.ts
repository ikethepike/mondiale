/**
 * Same-feature reconciliation. NE names stretches of one river differently
 * (Rhein in CH/AT, Rhine in DE/NL), which shipped them as separate features —
 * and at a Scattergories table two players could then hold the same river yet
 * both score "unique". `merge` folds those stretches into the canonical one
 * (before a river's reaches are clustered, so none falls away between them);
 * `alt` adds typeable alternates that have no NE feature of their own.
 * Both end up in the feature's `aliases` — matched, never displayed.
 * Names are POST-fix (see water-name-fixes.ts); the generator warns for any
 * entry that stops matching on an NE bump.
 */
export type WaterAliasGroup =
  | { kind: 'river'; canonical: string; merge: string[]; alt: string[] }
  | { kind: 'lake'; canonical: string; alt: string[] }

export const WATER_ALIASES: WaterAliasGroup[] = [
  { kind: 'river', canonical: 'Rhine', merge: ['Rhein'], alt: [] },
  { kind: 'river', canonical: 'Euphrates', merge: ['Al Furat', 'Firat'], alt: ['Fırat'] },
  { kind: 'river', canonical: 'Tigris', merge: ['Dicle'], alt: [] },
  { kind: 'river', canonical: 'Yellow', merge: ['Huang'], alt: ['Huang He', 'Hwang Ho'] },
  { kind: 'river', canonical: 'Yangtze', merge: ['Tongtian'], alt: ['Chang Jiang'] },
  { kind: 'river', canonical: 'Brahmaputra', merge: ['Dihang'], alt: [] },
  { kind: 'river', canonical: 'Irrawaddy', merge: ['Irrawaddy Delta'], alt: ['Ayeyarwady'] },
  { kind: 'river', canonical: 'Salween', merge: ['Nu'], alt: ['Thanlwin'] },
  {
    kind: 'river',
    canonical: 'Nile',
    merge: ['White Nile', 'Mountain Nile', 'Albert Nile', 'Victoria Nile'],
    alt: [],
  },
  { kind: 'river', canonical: 'Tajo', merge: [], alt: ['Tagus'] },
  { kind: 'river', canonical: 'Maas', merge: [], alt: ['Meuse'] },
  { kind: 'river', canonical: 'Duero', merge: [], alt: ['Douro'] },
  { kind: 'river', canonical: 'Ganges', merge: [], alt: ['Ganga'] },

  // Lakes: NE's name_en drops the generic, so LAKE_DISPLAY_NAMES restores the
  // headline and these carry the forms a player might reasonably type instead.
  { kind: 'lake', canonical: 'Lake Victoria', alt: ['Victoria', 'Nyanza'] },
  { kind: 'lake', canonical: 'Lake Peipus', alt: ['Peipus', 'Pskov', 'Pihkva'] },
  { kind: 'lake', canonical: 'Lake Nicaragua', alt: ['Nicaragua', 'Cocibolca'] },
  { kind: 'lake', canonical: 'Lake Titicaca', alt: ['Titicaca'] },
  { kind: 'lake', canonical: 'Lake Mweru', alt: ['Mweru', 'Moero'] },
  { kind: 'lake', canonical: 'Lake Uvs', alt: ['Uvs', 'Uvs Nuur', 'Uvs Nur'] },
  { kind: 'lake', canonical: 'Lake Srednye Kuyto', alt: ['Srednye Kuyto'] },
  {
    kind: 'lake',
    canonical: 'Vistula Lagoon',
    alt: ['Zalew Wislany', 'Kaliningrad Bay'],
  },
  {
    kind: 'lake',
    canonical: 'Lake General Carrera',
    alt: ['General Carrera', 'Buenos Aires', 'Lago Buenos Aires', 'General Carrera/Buenos Aires'],
  },
  { kind: 'lake', canonical: 'Lake of the Woods', alt: ['Woods'] },
  { kind: 'lake', canonical: 'Lake Chad', alt: ['Chad', 'Tchad'] },
  { kind: 'lake', canonical: 'Lake Malawi', alt: ['Malawi', 'Nyasa', 'Lake Nyasa'] },
  { kind: 'lake', canonical: 'Lake Tanganyika', alt: ['Tanganyika'] },
  { kind: 'lake', canonical: 'Lake Turkana', alt: ['Turkana', 'Rudolf', 'Lake Rudolf'] },
  { kind: 'lake', canonical: 'Lake Albert', alt: ['Albert', 'Mobutu'] },
  { kind: 'lake', canonical: 'Lake Ladoga', alt: ['Ladoga'] },
  { kind: 'lake', canonical: 'Lake Khanka', alt: ['Khanka', 'Xingkai'] },
  { kind: 'lake', canonical: 'Lake Superior', alt: ['Superior'] },
  { kind: 'lake', canonical: 'Lake Huron', alt: ['Huron'] },
  { kind: 'lake', canonical: 'Lake Erie', alt: ['Erie'] },
  { kind: 'lake', canonical: 'Lake Ontario', alt: ['Ontario'] },
  { kind: 'lake', canonical: 'Lake Saint Clair', alt: ['Saint Clair', 'St. Clair'] },
  { kind: 'lake', canonical: 'Dead Sea', alt: ['Yam ha-Melah'] },
  { kind: 'lake', canonical: 'Issyk-Kul', alt: ['Issyk Kul', 'Ysyk-Kol'] },
  { kind: 'lake', canonical: 'Khövsgöl Nuur', alt: ['Khovsgol', 'Lake Khovsgol'] },
  { kind: 'lake', canonical: 'South Aral Sea', alt: ['Aral Sea', 'Aral'] },
  { kind: 'lake', canonical: 'Lagoa Mirim', alt: ['Mirim', 'Laguna Merín'] },
  { kind: 'lake', canonical: 'Lake Saimaa', alt: ['Saimaa'] },
]

/**
 * Lakes whose NE `name` is a genuinely different English name from `name_en`
 * (not the specific plus a generic), so `lakeName`'s word-boundary rule can't
 * promote it: NE calls Lake Victoria "Nyanza" and Lake Peipus "Pihkva".
 * Resolved lake name → the headline players are shown and graded against.
 * Anything typeable but not displayed belongs in `alt` above, not here.
 */
export const LAKE_DISPLAY_NAMES: Record<string, string> = {
  Nyanza: 'Lake Victoria',
  Pihkva: 'Lake Peipus',
  Nicaragua: 'Lake Nicaragua',
  Titicaca: 'Lake Titicaca',
  Mweru: 'Lake Mweru',
  Uvs: 'Lake Uvs',
  'Ozero Srednye Kuyto': 'Lake Srednye Kuyto',
  'General Carrera/Buenos Aires': 'Lake General Carrera',
}
