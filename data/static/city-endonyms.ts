/**
 * Hand-maintained local spellings for major cities whose GeoNames canonical
 * name is an English exonym. The cities15000 dump's alternatenames carry no
 * language tags, so ranking heuristics can't reliably surface the endonym —
 * exactly the names a local player will type ("Wien", "Moskva"). Keyed by
 * ISO 3166-1 alpha-2 → canonical GeoNames name. Merged (deduped on the
 * matcher's normalized form) ahead of ranked variants in create-cities.ts.
 */
export const CITY_ENDONYMS: { [isoCode: string]: { [canonicalName: string]: string[] } } = {
  AT: { Vienna: ['Wien'] },
  BE: { Brussels: ['Bruxelles', 'Brussel'], Antwerp: ['Antwerpen'], Ghent: ['Gent'] },
  CH: { Geneva: ['Genève'], Zurich: ['Zürich'], Lucerne: ['Luzern'] },
  CZ: { Prague: ['Praha'] },
  DE: { Munich: ['München'], Cologne: ['Köln'], Nuremberg: ['Nürnberg'] },
  DK: { Copenhagen: ['København'] },
  EG: { Cairo: ['Al Qahirah'], Alexandria: ['Al Iskandariyah'] },
  ES: { Seville: ['Sevilla'] },
  FI: { Helsinki: ['Helsingfors'], Tampere: ['Tammerfors'] },
  GR: { Athens: ['Athina'], 'Thessaloníki': ['Saloniki'] },
  IT: {
    Rome: ['Roma'],
    Milan: ['Milano'],
    Naples: ['Napoli'],
    Turin: ['Torino'],
    Florence: ['Firenze'],
    Venice: ['Venezia'],
    Genoa: ['Genova'],
  },
  MA: { Casablanca: ['Dar el Beida'], Marrakesh: ['Marrakech'] },
  NL: { 'The Hague': ['Den Haag', "'s-Gravenhage"] },
  // ASCII spellings (Krakow, Lodz) need no entries — the matcher folds
  // diacritics; listing them here would displace the real name from display
  PL: { Warsaw: ['Warszawa'] },
  PT: { Lisbon: ['Lisboa'], Porto: ['Oporto'] },
  RO: { Bucharest: ['București', 'Bucuresti'] },
  RS: { Belgrade: ['Beograd'] },
  RU: { Moscow: ['Moskva'], 'Saint Petersburg': ['Sankt-Peterburg', 'St Petersburg'] },
  SE: { Gothenburg: ['Göteborg'] },
  UA: { Kyiv: ['Kiev'], Odesa: ['Odessa'] },
}
