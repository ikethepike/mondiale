/**
 * MADE_COMMODITIES → HS 2022 codes, prefix-matched against BACI's HS6 product
 * column (2-digit chapter, 4-digit heading or full 6-digit subheading). Each
 * commodity reads as the RAW good the Factbook string names (tobacco = leaf,
 * not cigarettes; cotton = fibre, not fabric). Keys must exactly equal
 * MADE_COMMODITIES — gated in generators/check-exports.ts.
 */
export const COMMODITY_HS_CODES: Record<string, string[]> = {
  aircraft: ['8802'], // airplanes, helicopters and spacecraft
  aluminum: ['7601'], // unwrought aluminium
  bananas: ['0803'],
  beef: ['0201', '0202'], // bovine meat, fresh + frozen
  beer: ['2203'],
  cars: ['8703'],
  cloves: ['0907'],
  coal: ['2701'],
  cobalt: ['2605', '8105'], // cobalt ores + mattes/intermediates/unwrought
  'cocoa beans': ['1801'],
  'coconuts/brazil nuts/cashews': ['0801'], // one HS heading covers all three
  coffee: ['0901'],
  computers: ['8471'], // automatic data-processing machines
  'copper ore': ['2603'],
  corn: ['1005'],
  cotton: ['5201'], // raw cotton, not carded or combed
  'crude petroleum': ['2709'],
  'cut flowers': ['0603'],
  diamonds: ['7102'],
  electricity: ['2716'],
  fish: ['0301', '0302', '0303', '0304', '0305'], // live/fresh/frozen/fillets/cured — shellfish is its own commodity
  footwear: ['64'],
  garments: ['61', '62'], // knitted + woven apparel chapters
  gold: ['7108'], // unwrought or semi-manufactured
  'integrated circuits': ['8542'],
  'iron ore': ['2601'],
  jewelry: ['7113'],
  liquor: ['2208'], // spirits and liqueurs
  'natural gas': ['271111', '271121'], // LNG + gaseous-state — 2711 at large would pull in oil-derived LPG
  nickel: ['2604', '7501', '7502'], // ores + mattes + unwrought
  'olive oil': ['1509', '1510'],
  'packaged medicine': ['3004'], // medicaments in measured doses
  'palm oil': ['1511'],
  perfumes: ['3303'],
  platinum: ['7110'], // unwrought/semi-manufactured, incl. palladium and rhodium
  'raw sugar': ['1701'], // cane or beet sugar
  'refined copper': ['7403'],
  'refined petroleum': ['2710'],
  rice: ['1006'],
  rubber: ['4001'], // natural rubber
  shellfish: ['0306', '0307', '0308'], // crustaceans, molluscs, other aquatic invertebrates
  ships: ['8901'], // cruise ships, ferries, cargo ships, tankers
  soybeans: ['1201'],
  steel: ['72'], // iron and steel chapter
  tea: ['0902'],
  tobacco: ['2401'], // unmanufactured leaf and refuse
  'tropical fruits': ['0804'], // dates, figs, pineapples, avocados, guavas, mangoes
  'uranium and thorium ore': ['2612', '284410'], // ores + natural-uranium concentrate, where KZ/NA/NE trade actually books
  vaccines: ['300241', '300242'], // human + veterinary
  vanilla: ['0905'],
  watches: ['9101', '9102'], // wrist and pocket watches
  wheat: ['1001'],
  wine: ['2204'],
  wood: ['44'], // wood and articles of wood
  wool: ['5101', '5105'], // greasy/scoured + carded/combed tops
}
