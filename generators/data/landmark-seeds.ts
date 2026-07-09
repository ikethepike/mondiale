import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Curated list of world-famous landmarks for the Landmark Quiz. A hand-picked
 * seed (rather than a Wikidata query) keeps the set ICONIC — recognisable
 * enough to be fair — and controllable. Each entry is a Wikidata-searchable
 * name + its ISO country; the generator resolves the Q-id (disambiguated by
 * P17 = country) and downloads its Commons photo.
 */
/**
 * Landmark categories — richer data for future modes (a "natural wonders only"
 * round, filtering, themed sets). Loose but useful:
 *  - natural:   mountains, falls, reefs, canyons, caves, deserts, lakes…
 *  - religious: temples, mosques, churches, cathedrals, shrines, monasteries
 *  - ancient:   ruins & pre-modern archaeological sites (Petra, Machu Picchu)
 *  - monument:  built icons — towers, bridges, statues, palaces, castles
 *  - urban:     districts, squares, whole old towns
 */
export type LandmarkKind = 'natural' | 'religious' | 'ancient' | 'monument' | 'urban'

export interface LandmarkSeed {
  name: string
  country: ISOCountryCode
  kind: LandmarkKind
  /**
   * Pin the exact Wikidata item, e.g. `Q243`.
   *
   * The generator otherwise resolves the Q-id by searching the name, and that
   * search falls back to its first hit when nothing matches the seed's country
   * — which quietly picks the wrong item when a name is shared. Oman has more
   * than one Sultan Qaboos Grand Mosque; the search found a different one,
   * 185km from Muscat. Both were in Oman, so the point-in-country check that
   * catches the cross-border failures could not see it.
   *
   * Set this whenever a landmark's coordinates, photo, or city look like they
   * belong to somewhere else.
   */
  qid?: string
  /**
   * Image override, for landmarks where Wikidata's auto-picked photo is the
   * wrong subject or low quality. `imageUrl` is a direct link to any image
   * file; `unsplashPhotoId` is an EXACT Unsplash photo (the code at the end of
   * its URL, e.g. `…-SvTVnah8jUk`); `unsplash` is a search query; `commons` is
   * an explicit Commons filename. Tried in that order, then the Wikidata
   * default.
   *
   * Overrides bypass the MIN_IMAGE_WIDTH check — they are hand-picked, so
   * point them at a full-resolution source, not a CDN thumbnail.
   */
  imageUrl?: string
  unsplashPhotoId?: string
  unsplash?: string
  commons?: string
}

export const LANDMARK_SEEDS: LandmarkSeed[] = [
  // --- Europe ---------------------------------------------------------------
  { name: 'Eiffel Tower', country: 'FR', kind: 'monument' },
  { name: 'Arc de Triomphe', country: 'FR', kind: 'monument' },
  { name: 'Mont-Saint-Michel', country: 'FR', kind: 'monument' },
  { name: 'Louvre Pyramid', country: 'FR', kind: 'ancient' },
  { name: 'Palace of Versailles', country: 'FR', kind: 'monument' },
  { name: 'Notre-Dame de Paris', country: 'FR', kind: 'religious' },
  { name: 'Pont du Gard', country: 'FR', kind: 'monument' },
  { name: 'Colosseum', country: 'IT', kind: 'ancient' },
  { name: 'Leaning Tower of Pisa', country: 'IT', kind: 'monument' },
  { name: 'Trevi Fountain', country: 'IT', kind: 'monument' },
  { name: "St. Peter's Basilica", country: 'IT', kind: 'religious' },
  { name: 'Florence Cathedral', country: 'IT', kind: 'religious' },
  { name: 'Grand Canal Venice', country: 'IT', kind: 'urban' },
  { name: 'Pompeii', country: 'IT', kind: 'ancient' },
  { name: 'Sagrada Família', country: 'ES', kind: 'religious' },
  { name: 'Alhambra', country: 'ES', kind: 'monument' },
  { name: 'Park Güell', country: 'ES', kind: 'monument' },
  { name: 'Guggenheim Museum Bilbao', country: 'ES', kind: 'monument' },
  { name: 'Mezquita of Córdoba', country: 'ES', kind: 'religious' },
  {
    name: 'Elizabeth Tower',
    country: 'GB',
    kind: 'monument',
    unsplash: 'Big Ben Elizabeth Tower London',
  },
  { name: 'Tower Bridge', country: 'GB', kind: 'monument' },
  { name: 'Stonehenge', country: 'GB', kind: 'ancient' },
  { name: 'London Eye', country: 'GB', kind: 'monument' },
  { name: 'Buckingham Palace', country: 'GB', kind: 'monument' },
  { name: 'Edinburgh Castle', country: 'GB', kind: 'monument' },
  { name: "Giant's Causeway", country: 'GB', kind: 'natural' },
  {
    name: 'Brandenburg Gate',
    country: 'DE',
    kind: 'monument',
    unsplash: 'Brandenburg Gate Berlin',
  },
  { name: 'Neuschwanstein Castle', country: 'DE', kind: 'monument' },
  { name: 'Cologne Cathedral', country: 'DE', kind: 'religious' },
  { name: 'Reichstag building', country: 'DE', kind: 'monument' },
  { name: 'Acropolis of Athens', country: 'GR', kind: 'ancient' },
  { name: 'Parthenon', country: 'GR', kind: 'ancient' },
  { name: 'Meteora', country: 'GR', kind: 'natural' },
  { name: 'Santorini', country: 'GR', kind: 'natural' },
  { name: 'Windmills of Kinderdijk', country: 'NL', kind: 'monument' },
  { name: 'Rijksmuseum', country: 'NL', kind: 'monument' },
  { name: 'Atomium', country: 'BE', kind: 'monument' },
  { name: 'Grand-Place Brussels', country: 'BE', kind: 'urban' },
  {
    name: 'Little Mermaid statue',
    country: 'DK',
    kind: 'monument',
    unsplash: 'Little Mermaid statue Copenhagen',
  },
  { name: 'Nyhavn', country: 'DK', kind: 'urban' },
  { name: 'Matterhorn', country: 'CH', kind: 'natural' },
  { name: 'Chapel Bridge Lucerne', country: 'CH', kind: 'religious' },
  { name: 'Jungfraujoch', country: 'CH', kind: 'natural' },
  { name: 'Belém Tower', country: 'PT', kind: 'monument' },
  { name: 'Pena Palace', country: 'PT', kind: 'monument' },
  { name: "Saint Basil's Cathedral", country: 'RU', kind: 'religious' },
  { name: 'Red Square', country: 'RU', kind: 'urban' },
  { name: 'Hermitage Museum', country: 'RU', kind: 'monument' },
  { name: 'Peterhof Palace', country: 'RU', kind: 'monument' },
  { name: 'Charles Bridge', country: 'CZ', kind: 'monument' },
  { name: 'Prague Castle', country: 'CZ', kind: 'monument' },
  { name: 'Hungarian Parliament Building', country: 'HU', kind: 'monument' },
  { name: "Fisherman's Bastion", country: 'HU', kind: 'monument' },
  { name: 'Blue Mosque', country: 'TR', kind: 'religious' },
  { name: 'Hagia Sophia', country: 'TR', kind: 'religious' },
  { name: 'Cappadocia', country: 'TR', kind: 'natural' },
  {
    name: 'Pamukkale',
    country: 'TR',
    kind: 'natural',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Pamukkale_30.jpg',
  },
  { name: 'Chernobyl Nuclear Power Plant', country: 'UA', kind: 'monument' },
  { name: 'Saint Sophia Cathedral Kyiv', country: 'UA', kind: 'religious' },
  { name: 'Wawel Castle', country: 'PL', kind: 'monument' },
  { name: 'Main Market Square Kraków', country: 'PL', kind: 'urban' },
  { name: 'Bran Castle', country: 'RO', kind: 'monument' },
  {
    name: 'Palace of the Parliament',
    country: 'RO',
    kind: 'monument',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/en/1/18/Bucharest_-_Palace_of_the_Parliament_%282024%29_%282%29.jpg',
  },
  { name: 'Rila Monastery', country: 'BG', kind: 'religious' },
  // Supplied URL was a 640px thumbnail; this Commons file is 1796px.
  {
    name: 'Kravice Falls',
    country: 'BA',
    kind: 'natural',
    commons: 'Waterfalls Kravica 5, Bosnia and Herzegovina.jpg',
  },
  { name: 'Stari Most', country: 'BA', kind: 'monument' },
  { name: 'Plitvice Lakes', country: 'HR', kind: 'natural' },
  {
    name: "Diocletian's Palace",
    country: 'HR',
    kind: 'monument',
    unsplash: 'Diocletian Palace Split Croatia',
  },
  { name: 'Bled Island', country: 'SI', kind: 'natural' },
  { name: 'Cliffs of Moher', country: 'IE', kind: 'natural' },
  { name: 'Trinity College Dublin', country: 'IE', kind: 'monument' },
  {
    name: 'Blue Lagoon Iceland',
    country: 'IS',
    kind: 'natural',
    imageUrl:
      'https://res.cloudinary.com/icelandtours/g_auto,f_auto,c_auto,w_3840,q_auto:good/1200px_Blue_Lagoon_Iceland_22360145156_c606d14597.jpg',
  },
  { name: 'Gullfoss', country: 'IS', kind: 'natural' },
  { name: 'Geirangerfjord', country: 'NO', kind: 'natural' },
  { name: 'Bryggen', country: 'NO', kind: 'urban' },
  { name: 'Vasa Museum', country: 'SE', kind: 'monument', unsplash: 'Vasa ship Stockholm museum' },
  { name: 'Suomenlinna', country: 'FI', kind: 'monument' },
  {
    name: 'Gate of the Sun Toledo',
    country: 'ES',
    kind: 'monument',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Puerta_del_Sol_%28Toledo%29.jpg',
  },
  { name: 'Schönbrunn Palace', country: 'AT', kind: 'monument' },
  { name: 'Hallstatt', country: 'AT', kind: 'urban' },
  // Without the pin, the name search finds Grand Duke Henri — the man, not the palace.
  { name: "Grand Duke's Palace Luxembourg", country: 'LU', kind: 'monument', qid: 'Q1205254' },

  // --- Africa ---------------------------------------------------------------
  { name: 'Great Pyramid of Giza', country: 'EG', kind: 'ancient' },
  { name: 'Great Sphinx of Giza', country: 'EG', kind: 'ancient' },
  { name: 'Karnak', country: 'EG', kind: 'ancient' },
  { name: 'Abu Simbel temples', country: 'EG', kind: 'religious' },
  { name: 'Table Mountain', country: 'ZA', kind: 'natural' },
  { name: 'Cape of Good Hope', country: 'ZA', kind: 'natural' },
  { name: 'Robben Island', country: 'ZA', kind: 'natural' },
  { name: 'Victoria Falls', country: 'ZM', kind: 'natural' },
  { name: 'Mount Kilimanjaro', country: 'TZ', kind: 'natural' },
  { name: 'Serengeti National Park', country: 'TZ', kind: 'natural' },
  {
    name: 'Stone Town',
    country: 'TZ',
    kind: 'urban',
    imageUrl:
      'https://www.foreverafricasafari.com/wp-content/uploads/2022/08/fuerte-stone-town-zanzibar.jpg',
  },
  { name: 'Hassan II Mosque', country: 'MA', kind: 'religious' },
  { name: 'Jemaa el-Fnaa', country: 'MA', kind: 'urban' },
  { name: 'Chefchaouen', country: 'MA', kind: 'urban' },
  { name: 'Church of Saint George Lalibela', country: 'ET', kind: 'religious' },
  { name: 'Simien Mountains', country: 'ET', kind: 'natural' },
  { name: 'Great Mosque of Djenné', country: 'ML', kind: 'religious' },
  { name: 'Maasai Mara', country: 'KE', kind: 'natural' },
  { name: 'Mount Kenya', country: 'KE', kind: 'natural' },
  {
    name: 'Pyramids of Meroë',
    country: 'SD',
    kind: 'ancient',
    imageUrl:
      'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh99OfmW2N2IkDffpiZBWPTWHDZ0Gbr3ACRqUv3b63Mcbgbk6HWXANvoSh1BkEhone5xmYoK3_jektk1XxyyCnBrjB1fAvlvRf6vnx7pcZWdq9ls_ZXXByf4tYM4xKi7ltXPj1YYyUC0bLs/s1600/IMG_0040.JPG',
  },
  { name: 'Sossusvlei', country: 'NA', kind: 'natural' },
  { name: 'Okavango Delta', country: 'BW', kind: 'natural' },
  {
    name: 'Bwindi Impenetrable Forest',
    country: 'UG',
    kind: 'natural',
    unsplashPhotoId: 'SvTVnah8jUk',
  },
  { name: 'Volcanoes National Park', country: 'RW', kind: 'natural' },
  { name: 'Kirstenbosch', country: 'ZA', kind: 'natural' },
  { name: 'Carthage', country: 'TN', kind: 'ancient' },
  { name: 'El Djem Amphitheatre', country: 'TN', kind: 'ancient' },
  { name: 'Timgad', country: 'DZ', kind: 'ancient' },
  { name: 'Elmina Castle', country: 'GH', kind: 'monument' },

  // --- Asia -----------------------------------------------------------------
  { name: 'Taj Mahal', country: 'IN', kind: 'monument' },
  { name: 'India Gate', country: 'IN', kind: 'monument' },
  { name: 'Golden Temple', country: 'IN', kind: 'religious' },
  { name: 'Hawa Mahal', country: 'IN', kind: 'monument' },
  { name: 'Gateway of India', country: 'IN', kind: 'monument' },
  { name: 'Great Wall of China', country: 'CN', kind: 'ancient' },
  { name: 'Forbidden City', country: 'CN', kind: 'ancient' },
  { name: 'Terracotta Army', country: 'CN', kind: 'ancient' },
  { name: 'Temple of Heaven', country: 'CN', kind: 'religious' },
  { name: 'Leshan Giant Buddha', country: 'CN', kind: 'religious' },
  { name: 'Zhangjiajie', country: 'CN', kind: 'monument' },
  {
    name: 'Potala Palace',
    country: 'CN',
    kind: 'ancient',
    imageUrl: 'https://whc.unesco.org/uploads/thumbs/site_0707_0001-1200-630-20110920202629.jpg',
  },
  { name: 'Mount Fuji', country: 'JP', kind: 'natural' },
  { name: 'Tokyo Tower', country: 'JP', kind: 'monument' },
  { name: 'Fushimi Inari-taisha', country: 'JP', kind: 'religious' },
  { name: 'Kinkaku-ji', country: 'JP', kind: 'monument' },
  { name: 'Itsukushima Shrine', country: 'JP', kind: 'religious' },
  { name: 'Himeji Castle', country: 'JP', kind: 'monument' },
  { name: 'Petronas Towers', country: 'MY', kind: 'monument' },
  { name: 'Batu Caves', country: 'MY', kind: 'natural' },
  { name: 'Marina Bay Sands', country: 'SG', kind: 'natural' },
  { name: 'Merlion', country: 'SG', kind: 'monument' },
  { name: 'Gardens by the Bay', country: 'SG', kind: 'natural' },
  {
    name: 'Angkor Wat',
    country: 'KH',
    kind: 'ancient',
    commons: '2014-Cambodge Angkor Wat (21).jpg',
  },
  { name: 'Bayon', country: 'KH', kind: 'ancient' },
  { name: 'Grand Palace Bangkok', country: 'TH', kind: 'monument' },
  { name: 'Wat Arun', country: 'TH', kind: 'monument' },
  { name: 'Wat Rong Khun', country: 'TH', kind: 'monument' },
  { name: 'Borobudur', country: 'ID', kind: 'ancient' },
  {
    name: 'Prambanan',
    country: 'ID',
    kind: 'ancient',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/0/0b/Prambanan_Temple_Yogyakarta_Indonesia.jpg',
  },
  { name: 'Mount Bromo', country: 'ID', kind: 'natural' },
  { name: 'Gyeongbokgung', country: 'KR', kind: 'monument' },
  { name: 'N Seoul Tower', country: 'KR', kind: 'monument', unsplash: 'N Seoul Tower Namsan' },
  { name: 'Bulguksa', country: 'KR', kind: 'monument' },
  { name: 'Burj Khalifa', country: 'AE', kind: 'monument' },
  {
    name: 'Sheikh Zayed Grand Mosque',
    country: 'AE',
    kind: 'religious',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/7/7d/Sheikh_Zayed_Mosque_view.jpg',
  },
  { name: 'Burj Al Arab', country: 'AE', kind: 'monument' },
  { name: 'Palm Jumeirah', country: 'AE', kind: 'urban' },
  { name: 'Petra', country: 'JO', kind: 'ancient' },
  { name: 'Wadi Rum', country: 'JO', kind: 'monument' },
  { name: 'Registan', country: 'UZ', kind: 'ancient', qid: 'Q1373583' },
  { name: 'Ha Long Bay', country: 'VN', kind: 'natural' },
  { name: 'Hoi An Ancient Town', country: 'VN', kind: 'urban' },
  { name: 'Shwedagon Pagoda', country: 'MM', kind: 'religious' },
  { name: 'Bagan', country: 'MM', kind: 'ancient' },
  {
    name: 'Sigiriya',
    country: 'LK',
    kind: 'ancient',
    imageUrl:
      'https://www.attractionsinsrilanka.com/wp-content/uploads/2019/09/sigiriya-rock-1.jpg',
  },
  { name: 'Temple of the Tooth', country: 'LK', kind: 'religious' },
  // Supplied URL was a 452px Google thumbnail — this is the tower at 5760px.
  {
    name: 'Taipei 101',
    country: 'TW',
    kind: 'monument',
    commons: 'Taipei Taiwan Taipei-101-Tower-01.jpg',
  },
  { name: 'Masjid al-Haram', country: 'SA', kind: 'religious' },
  { name: 'Al-Masjid an-Nabawi', country: 'SA', kind: 'religious' },
  { name: 'Kaaba', country: 'SA', kind: 'religious' },
  { name: 'Museum of Islamic Art Doha', country: 'QA', kind: 'monument' },
  { name: 'Naghsh-e Jahan Square', country: 'IR', kind: 'urban' },
  {
    name: 'Persepolis',
    country: 'IR',
    kind: 'ancient',
    imageUrl:
      'https://cdn.britannica.com/94/94894-050-C40775EF/Apadana-Darius-I-Persepolis-Iran.jpg',
  },
  { name: 'Registan of Samarkand', country: 'UZ', kind: 'ancient' },
  { name: 'Boudhanath', country: 'NP', kind: 'religious' },
  { name: 'Mount Everest', country: 'NP', kind: 'natural' },
  {
    name: 'Baiterek',
    country: 'KZ',
    kind: 'monument',
    unsplash: 'Baiterek Tower Astana Kazakhstan',
  },
  { name: 'Song Kol Lake', country: 'KG', kind: 'natural' },

  // --- Oceania --------------------------------------------------------------
  { name: 'Sydney Opera House', country: 'AU', kind: 'monument' },
  { name: 'Uluru', country: 'AU', kind: 'natural' },
  { name: 'Sydney Harbour Bridge', country: 'AU', kind: 'monument' },
  {
    name: 'Great Barrier Reef',
    country: 'AU',
    kind: 'natural',
    unsplash: 'Great Barrier Reef aerial Australia',
  },
  { name: 'Twelve Apostles', country: 'AU', kind: 'natural', qid: 'Q475623' },
  { name: 'Hobbiton Movie Set', country: 'NZ', kind: 'urban' },
  { name: 'Milford Sound', country: 'NZ', kind: 'natural' },
  // Supplied URL was a 335px Google thumbnail — this is the tower at 2151px.
  {
    name: 'Sky Tower Auckland',
    country: 'NZ',
    kind: 'monument',
    commons: 'Sky Tower Auckland 01.jpg',
  },

  // --- North America --------------------------------------------------------
  { name: 'Statue of Liberty', country: 'US', kind: 'monument' },
  { name: 'Golden Gate Bridge', country: 'US', kind: 'monument' },
  { name: 'Grand Canyon', country: 'US', kind: 'natural' },
  { name: 'Mount Rushmore', country: 'US', kind: 'natural' },
  { name: 'Times Square', country: 'US', kind: 'urban' },
  { name: 'Yellowstone National Park', country: 'US', kind: 'natural' },
  { name: 'CN Tower', country: 'CA', kind: 'monument' },
  {
    name: 'Niagara Falls',
    country: 'CA',
    kind: 'natural',
    unsplash: 'Niagara Falls waterfall aerial',
  },
  { name: 'Banff National Park', country: 'CA', kind: 'natural' },
  { name: 'Château Frontenac', country: 'CA', kind: 'monument' },
  { name: 'Chichen Itza', country: 'MX', kind: 'ancient' },
  { name: 'Teotihuacan', country: 'MX', kind: 'ancient' },
  { name: 'Palenque', country: 'MX', kind: 'ancient' },
  { name: 'Cenote Ik Kil', country: 'MX', kind: 'natural' },

  // --- Central America & Caribbean -----------------------------------------
  { name: 'Panama Canal', country: 'PA', kind: 'urban' },
  { name: 'Tikal', country: 'GT', kind: 'ancient' },
  { name: 'Antigua Guatemala', country: 'GT', kind: 'urban' },
  { name: 'Arenal Volcano', country: 'CR', kind: 'natural' },
  {
    name: 'El Castillo San Salvador',
    qid: 'Q2920340', // the search finds the University of El Salvador
    country: 'CU',
    kind: 'monument',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Castillo_de_San_Salvador_de_la_Punta%2C_Havana%2C_Cuba_LCCN2010638714.tiff/lossy-page1-1280px-Castillo_de_San_Salvador_de_la_Punta%2C_Havana%2C_Cuba_LCCN2010638714.tiff.jpg',
  },
  { name: 'Old Havana', country: 'CU', kind: 'urban' },
  { name: 'Copán', country: 'HN', kind: 'ancient', unsplash: 'Copan Mayan ruins Honduras' },

  // --- South America --------------------------------------------------------
  { name: 'Machu Picchu', country: 'PE', kind: 'ancient' },
  { name: 'Nazca Lines', country: 'PE', kind: 'ancient' },
  { name: 'Rainbow Mountain Peru', country: 'PE', kind: 'natural' },
  { name: 'Christ the Redeemer', country: 'BR', kind: 'monument' },
  {
    name: 'Sugarloaf Mountain',
    country: 'BR',
    kind: 'natural',
    unsplash: 'Sugarloaf Mountain Rio de Janeiro cable car',
  },
  { name: 'Iguazu Falls', country: 'AR', kind: 'natural' },
  { name: 'Perito Moreno Glacier', country: 'AR', kind: 'natural' },
  { name: 'Obelisco de Buenos Aires', country: 'AR', kind: 'monument' },
  { name: 'Salar de Uyuni', country: 'BO', kind: 'natural' },
  { name: 'Angel Falls', country: 'VE', kind: 'natural' },
  { name: 'Easter Island', country: 'CL', kind: 'natural' },
  { name: 'Torres del Paine', country: 'CL', kind: 'natural' },
  { name: 'Valle de la Luna Chile', country: 'CL', kind: 'natural' },
  // Unpinned, the search finds Cartagena in SPAIN and its 3rd-century BC Punic wall.
  { name: 'Cartagena Walled City', country: 'CO', kind: 'urban', qid: 'Q657461' },
  { name: 'Ciudad Perdida', country: 'CO', kind: 'ancient' },
  { name: 'Galápagos Islands', country: 'EC', kind: 'natural' },
  { name: 'Middle of the World City', country: 'EC', kind: 'urban' },

  // --- Broader world spread (under-represented regions) ---------------------
  // More Africa
  { name: 'Fish River Canyon', country: 'NA', kind: 'natural' },
  { name: 'Bandiagara Escarpment', country: 'ML', kind: 'ancient' },
  { name: 'Larabanga Mosque', country: 'GH', kind: 'religious' },
  { name: 'Nyiragongo', country: 'CD', kind: 'natural' },
  { name: 'Lake Malawi', country: 'MW', kind: 'natural' },
  { name: 'Avenue of the Baobabs', country: 'MG', kind: 'natural' },
  { name: 'Kasubi Tombs', country: 'UG', kind: 'religious' },
  {
    name: 'Basilica of Our Lady of Peace',
    country: 'CI',
    kind: 'religious',
    unsplash: 'Basilica Our Lady of Peace Yamoussoukro',
  },
  { name: 'Aldabra', country: 'SC', kind: 'natural' },
  { name: 'Erg Chebbi', country: 'MA', kind: 'natural' },
  { name: 'Nile River', country: 'EG', kind: 'monument' },
  { name: 'Debre Damo', country: 'ET', kind: 'religious' },
  { name: 'Loango National Park', country: 'GA', kind: 'natural' },
  // More Middle East / Central Asia / Caucasus
  { name: 'Dome of the Rock', country: 'PS', kind: 'religious' },
  { name: 'Baalbek', country: 'LB', kind: 'ancient' },
  // Supplied URL is the same 800px file Wikidata already rejected; this one is 1600px.
  { name: 'Jeita Grotto', country: 'LB', kind: 'natural', commons: 'Jeita Grotto ITH041.jpg' },
  { name: 'Umayyad Mosque', country: 'SY', kind: 'religious' },
  { name: 'Sheikh Lotfollah Mosque', country: 'IR', kind: 'religious' },
  { name: 'Gates of Hell Darvaza', country: 'TM', kind: 'natural' },
  { name: 'Gergeti Trinity Church', country: 'GE', kind: 'religious' },
  { name: 'Tatev Monastery', country: 'AM', kind: 'religious' },
  { name: 'Maiden Tower Baku', country: 'AZ', kind: 'monument' },
  { name: 'Bagrati Cathedral', country: 'GE', kind: 'religious' },
  { name: 'Ark of Bukhara', country: 'UZ', kind: 'ancient' },
  { name: 'Charyn Canyon', country: 'KZ', kind: 'natural' },
  // More Southeast Asia / Pacific
  {
    name: 'Banaue Rice Terraces',
    country: 'PH',
    kind: 'natural',
    unsplash: 'Banaue Rice Terraces Philippines',
  },
  { name: 'Chocolate Hills', country: 'PH', kind: 'natural' },
  { name: 'Kuang Si Falls', country: 'LA', kind: 'natural' },
  { name: 'Pha That Luang', country: 'LA', kind: 'monument' },
  {
    name: 'Sultan Omar Ali Saifuddin Mosque',
    country: 'BN',
    kind: 'religious',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/7/7d/Sultan_Omar_Ali_Saifuddin_Mosque_03.jpg',
  },
  { name: 'Nan Madol', country: 'FM', kind: 'ancient' },
  { name: 'Rock Islands', country: 'PW', kind: 'natural' },
  // More Europe (east & smaller states)
  { name: 'Kotor', country: 'ME', kind: 'urban' },
  { name: 'Ohrid', country: 'MK', kind: 'urban' },
  { name: 'Gjirokastër', country: 'AL', kind: 'urban' },
  { name: 'Cesky Krumlov', country: 'CZ', kind: 'urban' },
  { name: 'Trakai Island Castle', country: 'LT', kind: 'natural' },
  { name: 'Rundale Palace', country: 'LV', kind: 'monument' },
  { name: 'Tallinn Old Town', country: 'EE', kind: 'urban' },
  { name: 'Mir Castle', country: 'BY', kind: 'monument' },
  { name: 'Palace of Culture and Science', country: 'PL', kind: 'monument' },
  { name: 'Saint-Tropez', country: 'FR', kind: 'urban' },
  { name: 'Rock of Gibraltar', country: 'GB', kind: 'natural', unsplash: 'Rock of Gibraltar' },
  { name: 'Valletta', country: 'MT', kind: 'urban' },
  { name: 'Casa Batlló', country: 'ES', kind: 'monument' },
  // More South America
  { name: 'Cotopaxi', country: 'EC', kind: 'natural' },
  {
    name: 'Los Roques',
    country: 'VE',
    kind: 'natural',
    unsplash: 'Los Roques archipelago Venezuela beach',
  },
  { name: 'Kaieteur Falls', country: 'GY', kind: 'natural' },
  { name: 'Jesuit Missions of the Guaranis', country: 'PY', kind: 'ancient' },
  { name: 'Colonia del Sacramento', country: 'UY', kind: 'urban' },
  {
    name: 'Death Road Bolivia',
    country: 'BO',
    kind: 'natural',
    commons: 'Yungas road-Death road (8264757023).jpg',
  },

  // --- Remaining European countries (at least one each) ---------------------
  { name: 'Casa de la Vall', country: 'AD', kind: 'monument' },
  { name: 'Vallnord', country: 'AD', kind: 'urban' },
  { name: "St. Peter's Square", country: 'VA', kind: 'religious' },
  {
    name: 'Sistine Chapel',
    country: 'VA',
    kind: 'religious',
    imageUrl:
      'https://www.christinascucina.com/wp-content/uploads/2018/10/fullsizeoutput_8e1d-1024x768.jpeg',
  },
  { name: 'Vaduz Castle', country: 'LI', kind: 'monument' },
  { name: 'Cricova winery', country: 'MD', kind: 'monument' },
  { name: 'Monte Carlo Casino', country: 'MC', kind: 'urban' },
  { name: "Prince's Palace of Monaco", country: 'MC', kind: 'monument' },
  { name: 'Guaita', country: 'SM', kind: 'monument' },
  { name: 'Three Towers of San Marino', country: 'SM', kind: 'urban' },
  // The name search landed 100km south of Belgrade, in open countryside.
  { name: 'Church of Saint Sava', country: 'RS', kind: 'religious', qid: 'Q330385' },
  { name: 'Petrovaradin Fortress', country: 'RS', kind: 'monument' },
  {
    name: 'Bratislava Castle',
    country: 'SK',
    kind: 'monument',
    unsplash: 'Bratislava Castle Slovakia',
  },
  { name: 'Spiš Castle', country: 'SK', kind: 'monument' },
  { name: 'Rugova Canyon', country: 'XK', kind: 'natural' },
  { name: 'Gračanica Monastery', country: 'XK', kind: 'religious' },

  // --- More natural wonders worldwide ---------------------------------------
  { name: 'Dead Sea', country: 'JO', kind: 'natural' },
  // Wikipedia's search ranking drifts: on one run "Wave Rock" resolved to the
  // new wave music genre. Pinning the item makes the lookup deterministic.
  { name: 'Wave Rock', country: 'AU', kind: 'natural', qid: 'Q1754627' },
  {
    name: 'Pink Lake Hillier',
    country: 'AU',
    kind: 'natural',
    imageUrl:
      'https://i.guim.co.uk/img/media/2a343fd41492212672d4c4e9323e44653a3824ad/0_0_4176_5315/master/4176.jpg?width=1140&dpr=2&s=none&crop=none',
  },
  { name: 'Zhangye Danxia', country: 'CN', kind: 'natural' },
  { name: 'Jiuzhaigou Valley', country: 'CN', kind: 'natural' },
  { name: 'Reed Flute Cave', country: 'CN', kind: 'natural' },
  { name: 'Trolltunga', country: 'NO', kind: 'natural' },
  { name: 'Preikestolen', country: 'NO', kind: 'natural' },
  { name: 'Vatnajökull', country: 'IS', kind: 'natural' },
  { name: 'Skógafoss', country: 'IS', kind: 'natural' },
  { name: 'Antelope Canyon', country: 'US', kind: 'natural' },
  { name: 'Dettifoss', country: 'IS', kind: 'natural', unsplash: 'Dettifoss waterfall Iceland' },
  { name: 'Marble Caves Chile Chico', country: 'CL', kind: 'natural' },
  { name: 'Mount Roraima', country: 'VE', kind: 'natural' },
  { name: 'Cano Cristales', country: 'CO', kind: 'monument' },
  { name: 'Sahara Desert', country: 'DZ', kind: 'natural' },
  {
    name: 'Namib Desert',
    qid: 'Q131377', // the article is geotagged 197km from our point
    country: 'NA',
    kind: 'natural',
    unsplash: 'Namib Desert Sossusvlei dunes Namibia',
  },
  { name: 'Lake Baikal', country: 'RU', kind: 'natural' },
  { name: 'Valley of Geysers', country: 'RU', kind: 'natural' },
  { name: 'Ngorongoro Crater', country: 'TZ', kind: 'natural' },
  { name: 'Sundarbans', country: 'BD', kind: 'natural' },
  { name: 'Phang Nga Bay', country: 'TH', kind: 'natural' },
  { name: 'Waitomo Glowworm Caves', country: 'NZ', kind: 'natural' },
  {
    name: 'Franz Josef Glacier',
    country: 'NZ',
    kind: 'natural',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Franz_josef_Glacier_LC0250.jpg',
  },
  { name: 'Aogashima', country: 'JP', kind: 'natural' },
  { name: 'Verdon Gorge', country: 'FR', kind: 'natural' },
  { name: 'Saxon Switzerland', country: 'DE', kind: 'natural' },
  { name: 'Durmitor', country: 'ME', kind: 'natural' },
  {
    name: 'Aggtelek Caves',
    country: 'HU',
    kind: 'natural',
    unsplash: 'Baradla Cave Aggtelek Hungary stalactite',
  },

  // --- Countries that previously had no landmark at all ----------------------
  // Every name below was checked against Wikidata first: it resolves to a Q-id
  // whose P17 is the seed's country, and its `page_image_free` source is at
  // least MIN_IMAGE_WIDTH (900px). Where the most famous site failed that bar
  // (low-res or no free photo) the next-best site in the same country is used.

  // Asia & Middle East
  { name: 'Paro Taktsang', country: 'BT', kind: 'religious' },
  { name: 'Ziggurat of Ur', country: 'IQ', kind: 'ancient' },
  // Wikidata's photo is a signposted doorway, not the Wall itself.
  { name: 'Western Wall', country: 'IL', kind: 'religious', unsplashPhotoId: 'd_so1tRFKJk' },
  { name: 'Badshahi Mosque', country: 'PK', kind: 'religious' },
  { name: 'Band-e Amir', country: 'AF', kind: 'natural', qid: 'Q613251' },
  { name: 'Erdene Zuu Monastery', country: 'MN', kind: 'religious' },
  { name: 'Kourion', country: 'CY', kind: 'ancient' },
  { name: 'Shibam', country: 'YE', kind: 'urban' },
  {
    // Oman has several mosques by this name; the search found one 185km from
    // Muscat, so pin the Muscat landmark itself.
    name: 'Sultan Qaboos Grand Mosque',
    country: 'OM',
    kind: 'religious',
    qid: 'Q1548443',
    unsplashPhotoId: 'plMrhMCk4bQ',
  },
  // The default photo is the modern Islamic Centre; this is the coral-stone
  // Hukuru Miskiy the seed actually names.
  {
    name: 'Malé Friday Mosque',
    country: 'MV',
    kind: 'religious',
    commons: "Male' Hukuru Miskiy 1.jpg",
  },
  {
    name: 'Qalʻat al-Bahrain',
    country: 'BH',
    kind: 'ancient',
    commons: 'Bahrain Fort March 2015.JPG',
  },
  { name: 'Kuwait Towers', country: 'KW', kind: 'monument' },
  { name: 'Fann Mountains', country: 'TJ', kind: 'natural' },
  // Supplied URL was an 800px CDN crop — this is the same range, full size.
  {
    name: 'Mount Kumgang',
    country: 'KP',
    kind: 'natural',
    commons: 'Kumgang Mountains 금강산 - North Korea (10162010144).jpg',
  },
  { name: 'Cristo Rei of Dili', country: 'TL', kind: 'monument' },

  // Africa
  // Victoria Falls is already seeded to ZM (it straddles the border, and both
  // would slugify to `victoria-falls`); Great Zimbabwe's only free photo is
  // 384px wide, so Matobo Hills carries ZW.
  { name: 'Matobo Hills', country: 'ZW', kind: 'natural' },
  { name: 'Mount Cameroon', country: 'CM', kind: 'natural' },
  { name: 'Ennedi Massif', country: 'TD', kind: 'natural' },
  // Dahlak/Bijagós resolve to satellite imagery on Wikidata — use the ports.
  { name: 'Massawa', country: 'ER', kind: 'urban' },
  { name: 'Lake Assal', country: 'DJ', kind: 'natural', commons: 'Lake Assal 1-Djibouti.jpg' },
  { name: 'Maletsunyane Falls', country: 'LS', kind: 'natural' },
  // Nouabalé-Ndoki's photo is a gorilla; Kibira's is a signboard. Both parks
  // have no free image of the *place*, so a built landmark carries the country.
  { name: 'Basilique Sainte-Anne du Congo', country: 'CG', kind: 'religious' },
  { name: 'Chutes de la Karera', country: 'BI', kind: 'natural' },
  // Supplied URL was a 733px Google thumbnail — this is the caldera at 4100px.
  {
    name: 'Mount Karthala',
    country: 'KM',
    kind: 'natural',
    commons: 'Volcan Karthala vue de la caldeira 13 08 2019.jpg',
  },
  { name: 'Pico Cão Grande', country: 'ST', kind: 'natural' },
  {
    name: 'Pico Basile',
    country: 'GQ',
    kind: 'natural',
    imageUrl:
      'https://img.atlasobscura.com/BS71nOyHxoGAX-jfYFAMkBhTi-JujomflISg29BlkmQ/rt:fit/w:1200/q:80/sm:1/scp:1/ar:1/aHR0cHM6Ly9hdGxh/cy1kZXYuczMuYW1h/em9uYXdzLmNvbS91/cGxvYWRzL3BsYWNl/X2ltYWdlcy9iZmY0/YzZlZS04OWFhLTRh/YTItYThlOC04OGJk/MWUwNjRmYjQzZmZh/MDBjZGUyMWI1MWQw/MTJfUGljbyBCYXNp/bGUuanBn.jpg',
  },
  { name: 'Le Morne Brabant', country: 'MU', kind: 'natural' },
  // The Richat Structure only reads as the "Eye of the Sahara" from orbit; its
  // free ground-level photo is anonymous desert. Chinguetti carries MR instead.
  { name: 'Chinguetti', country: 'MR', kind: 'ancient' },
  { name: 'Leptis Magna', country: 'LY', kind: 'ancient' },
  { name: 'Kalandula Falls', country: 'AO', kind: 'natural', commons: 'Kalandula Falls Pan.jpg' },
  { name: 'Ganvie', country: 'BJ', kind: 'urban' },
  { name: 'Ruins of Loropéni', country: 'BF', kind: 'ancient' },
  { name: 'Stone Circles of Senegambia', country: 'GM', kind: 'ancient' },
  { name: 'Koutammakou', country: 'TG', kind: 'urban' },
  // Bazaruto / Zuma Rock / Aïr / Dzanga / Pico do Fogo / Gorée / Bunce Island
  // all had sub-900px sources — these are the same-country stand-ins.
  { name: 'Island of Mozambique', country: 'MZ', kind: 'urban' },
  { name: 'Olumo Rock', country: 'NG', kind: 'natural', commons: 'Olumo Rock in Abeokuta.jpg' },
  { name: 'Agadez', country: 'NE', kind: 'urban' },
  // Manovo-Gounda's photo is a flock of birds; Sapo's is a pair of hippos.
  // Wildlife doesn't identify a country, so the capitals carry CF and LR.
  {
    name: 'Bangui',
    country: 'CF',
    kind: 'urban',
    imageUrl:
      'https://i.redd.it/some-photos-from-bangui-the-capita-of-caf-v0-y4c1751gm1lg1.jpg?width=1600&format=pjpg&auto=webp&s=e4a628f18a98015d5e7a36a5ff89e20c3ce9a363',
  },
  { name: 'Cidade Velha', country: 'CV', kind: 'urban' },
  { name: 'House of Slaves', country: 'SN', kind: 'monument' },
  { name: 'Freetown Cotton Tree', country: 'SL', kind: 'monument' },
  { name: 'Lobamba', country: 'SZ', kind: 'monument' },
  // Laas Geel resolves to Somaliland (Q34754), not Somalia — use Mogadishu.
  { name: 'Mogadishu Cathedral', country: 'SO', kind: 'religious' },
  { name: 'Monrovia', country: 'LR', kind: 'urban' },
  {
    name: 'Juba',
    country: 'SS',
    kind: 'urban',
    imageUrl:
      'https://i.guim.co.uk/img/media/cd43fc1f69f51b522ebac1865dcb26b911818c21/0_580_4980_2988/master/4980.jpg?width=1200&height=1200&quality=85&auto=format&fit=crop&s=c52ddf723265159af5cb3a72b5e0416c',
  },

  // Americas & Caribbean
  { name: "Nelson's Dockyard", country: 'AG', kind: 'monument' },
  { name: 'Molinere Underwater Sculpture Park', country: 'GD', kind: 'monument' },
  { name: 'Brimstone Hill Fortress', country: 'KN', kind: 'monument' },
  { name: 'Pitons', country: 'LC', kind: 'natural', qid: 'Q639487' },
  { name: 'Maracas Bay', country: 'TT', kind: 'natural' },
  { name: "Dunn's River Falls", country: 'JM', kind: 'natural' },
  { name: 'Citadelle Laferrière', country: 'HT', kind: 'monument' },
  { name: 'Colonial City of Santo Domingo', country: 'DO', kind: 'urban' },
  { name: 'Joya de Cerén', country: 'SV', kind: 'ancient' },
  { name: 'Granada, Nicaragua', country: 'NI', kind: 'urban' },
  // Great Blue Hole / Exuma / Boiling Lake / Harrison's Cave all failed the
  // image gate (Harrison's Cave also resolves to a parish, not Barbados).
  { name: 'Xunantunich', country: 'BZ', kind: 'ancient' },
  { name: 'Nassau, Bahamas', country: 'BS', kind: 'urban' },
  { name: 'Morne Trois Pitons National Park', country: 'DM', kind: 'natural' },
  { name: 'Bathsheba, Barbados', country: 'BB', kind: 'natural' },

  // Oceania
  { name: 'Mount Yasur', country: 'VU', kind: 'natural' },
  { name: 'Kokoda Track', country: 'PG', kind: 'natural' },
  { name: 'Haʻamonga ʻa Maui', country: 'TO', kind: 'ancient' },
  { name: 'Yasawa Islands', country: 'FJ', kind: 'natural' },
  {
    name: 'Kennedy Island',
    country: 'SB',
    kind: 'natural',
    commons: 'Kennedy Island, Kasolo Island, Pudding Plum.JPG',
  },

  // --- Hand-supplied images -------------------------------------------------
  // Wikidata has no usable free photo of these places (its best candidates are
  // satellite imagery, park signboards, or wildlife), so each points at an
  // explicitly chosen image instead.
  {
    name: 'Mount Nimba',
    qid: 'Q924276', // the search finds Mount Richard-Molard
    country: 'GN',
    kind: 'natural',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/4/45/Mount_Nimba_Strict_Nature_Reserve-108445.jpg',
  },
  {
    name: 'Bubaque',
    country: 'GW',
    kind: 'urban',
    imageUrl: 'https://images.trvl-media.com/place/669/aca92fb2-b4b2-49b0-aeb1-b0a44e52068b.jpg',
  },
  {
    name: 'Kiritimati',
    country: 'KI',
    kind: 'natural',
    imageUrl:
      'https://www.kiwi.com/_next/image/?url=https%3A%2F%2Fimages.kiwi.com%2Fphotos%2Foriginals%2Fkiritimati_ki.jpg&w=2560&q=10',
  },
  {
    name: 'Buada Lagoon',
    country: 'NR',
    kind: 'natural',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/64/Buada_Lagoon%2C_Nauru_2007.jpg',
  },
  // The supplied Suriname URL was an 800px CDN crop; Voltzberg is the same
  // reserve at full resolution.
  {
    name: 'Central Suriname Nature Reserve',
    country: 'SR',
    kind: 'natural',
    commons: 'Mt.VoltzbergSuriname.jpg',
  },
  {
    name: 'Funafuti',
    country: 'TV',
    kind: 'natural',
    imageUrl:
      'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/153000/153047/funafuti_oli_20230928_lrg.jpg',
  },
]
