/**
 * Same-river reconciliation. NE names stretches of one river differently
 * (Rhein in CH/AT, Rhine in DE/NL), which shipped them as separate features —
 * and at a Scattergories table two players could then hold the same river yet
 * both score "unique". `merge` folds those features into the canonical one
 * (bounds-adjacency of every pair verified against the generated data);
 * `alt` adds typeable alternates that have no NE feature of their own.
 * Both end up in the feature's `aliases` — matched, never displayed.
 * Names are POST-fix (see water-name-fixes.ts); the generator warns for any
 * entry that stops matching on an NE bump.
 */
export const RIVER_ALIASES: { canonical: string; merge: string[]; alt: string[] }[] = [
  { canonical: 'Rhine', merge: ['Rhein'], alt: [] },
  { canonical: 'Euphrates', merge: ['Al Furat', 'Firat'], alt: ['Fırat'] },
  { canonical: 'Tigris', merge: ['Dicle'], alt: [] },
  { canonical: 'Yellow', merge: ['Huang'], alt: ['Huang He', 'Hwang Ho'] },
  { canonical: 'Yangtze', merge: ['Tongtian'], alt: ['Chang Jiang'] },
  { canonical: 'Brahmaputra', merge: ['Dihang'], alt: [] },
  { canonical: 'Irrawaddy', merge: ['Irrawaddy Delta'], alt: ['Ayeyarwady'] },
  { canonical: 'Salween', merge: ['Nu'], alt: ['Thanlwin'] },
  { canonical: 'Tajo', merge: [], alt: ['Tagus'] },
  { canonical: 'Maas', merge: [], alt: ['Meuse'] },
  { canonical: 'Duero', merge: [], alt: ['Douro'] },
  { canonical: 'Ganges', merge: [], alt: ['Ganga'] },
]
