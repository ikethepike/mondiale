import type { VintageRegionId, VintageUnitSpec } from '../../types/vintage.types'

/**
 * Vintage's curated history: what each CShapes unit was called and whose wash
 * it wore, era by era. CShapes files colonies under their modern names (the
 * Gold Coast is "Ghana" from 1886) and records no ruler at all, so every name
 * and every wash on a Vintage map comes from here. An era runs from the
 * Dec-31 map of its `from` year, the year the change happened.
 */

const ind = (from: number, name: string) => ({ from, name, sovereign: true })
const empire = (from: number, name: string, wash: VintageUnitSpec['eras'][number]['wash']) => ({
  from,
  name,
  wash,
  sovereign: true,
})
const ruled = (from: number, name: string, wash: VintageUnitSpec['eras'][number]['wash']) => ({
  from,
  name,
  wash,
  sovereign: false,
})

export const VINTAGE_UNITS: Record<number, VintageUnitSpec> = {
  // --- Africa ---------------------------------------------------------------
  402: { iso: 'CV', eras: [ruled(1886, 'Cape Verde', 'pt'), ind(1975, 'Cape Verde')] },
  404: { iso: 'GW', eras: [ruled(1886, 'Portuguese Guinea', 'pt'), ind(1974, 'Guinea-Bissau')] },
  411: { iso: 'GQ', eras: [ruled(1886, 'Spanish Guinea', 'es'), ind(1968, 'Equatorial Guinea')] },
  420: { iso: 'GM', eras: [ruled(1886, 'Gambia', 'gb'), ind(1965, 'The Gambia')] },
  430: { eras: [ruled(1886, 'French West Africa', 'fr')] },
  432: {
    iso: 'ML',
    eras: [
      ruled(1886, 'Upper Senegal and Niger', 'fr'),
      ruled(1920, 'French Sudan', 'fr'),
      ruled(1959, 'Mali Federation', 'fr'),
      ind(1960, 'Mali'),
    ],
  },
  433: { iso: 'SN', eras: [ruled(1886, 'Senegal', 'fr'), ind(1960, 'Senegal')] },
  434: {
    iso: 'BJ',
    eras: [ruled(1886, 'Dahomey', 'fr'), ind(1960, 'Dahomey'), ind(1975, 'Benin')],
  },
  435: { iso: 'MR', eras: [ruled(1886, 'Mauritania', 'fr'), ind(1960, 'Mauritania')] },
  436: { iso: 'NE', eras: [ruled(1886, 'Niger', 'fr'), ind(1960, 'Niger')] },
  437: {
    iso: 'CI',
    eras: [ruled(1886, 'Ivory Coast', 'fr'), ind(1960, 'Ivory Coast'), ind(1985, "Côte d'Ivoire")],
  },
  438: { iso: 'GN', eras: [ruled(1886, 'French Guinea', 'fr'), ind(1958, 'Guinea')] },
  439: {
    iso: 'BF',
    eras: [ruled(1886, 'Upper Volta', 'fr'), ind(1960, 'Upper Volta'), ind(1984, 'Burkina Faso')],
  },
  450: { iso: 'LR', eras: [ind(1886, 'Liberia')] },
  451: { iso: 'SL', eras: [ruled(1886, 'Sierra Leone', 'gb'), ind(1961, 'Sierra Leone')] },
  452: { iso: 'GH', eras: [ruled(1886, 'Gold Coast', 'gb'), ind(1957, 'Ghana')] },
  460: { eras: [ruled(1886, 'Togoland', 'de'), ruled(1914, 'Togoland', 'contested')] },
  461: { iso: 'TG', eras: [ruled(1886, 'French Togoland', 'fr'), ind(1960, 'Togo')] },
  462: { eras: [ruled(1886, 'British Togoland', 'gb')] },
  470: { eras: [ruled(1886, 'Kamerun', 'de'), ruled(1916, 'Kamerun', 'contested')] },
  471: { iso: 'CM', eras: [ruled(1886, 'French Cameroons', 'fr'), ind(1960, 'Cameroon')] },
  472: { eras: [ruled(1886, 'British Cameroons', 'gb')] },
  475: { iso: 'NG', eras: [ruled(1886, 'Nigeria', 'gb'), ind(1960, 'Nigeria')] },
  4781: { eras: [ruled(1886, 'Lagos', 'gb')] },
  4782: { eras: [ruled(1886, 'Oil Rivers', 'gb')] },
  4783: { eras: [ruled(1886, 'Southern Nigeria', 'gb')] },
  4784: { eras: [ruled(1886, 'Northern Nigeria', 'gb')] },
  481: { iso: 'GA', eras: [ruled(1886, 'Gabon', 'fr'), ind(1960, 'Gabon')] },
  482: {
    iso: 'CF',
    eras: [
      ruled(1886, 'Ubangi-Shari', 'fr'),
      ind(1960, 'Central African Republic'),
      ind(1976, 'Central African Empire'),
      ind(1979, 'Central African Republic'),
    ],
  },
  483: { iso: 'TD', eras: [ruled(1886, 'Chad', 'fr'), ind(1960, 'Chad')] },
  484: {
    iso: 'CG',
    eras: [
      ruled(1886, 'Middle Congo', 'fr'),
      ind(1960, 'Congo-Brazzaville'),
      ind(1970, "People's Republic of the Congo"),
      ind(1991, 'Republic of the Congo'),
    ],
  },
  490: {
    iso: 'CD',
    eras: [
      ruled(1886, 'Congo Free State', 'be'),
      ruled(1908, 'Belgian Congo', 'be'),
      ind(1960, 'Congo-Léopoldville'),
      ind(1966, 'Congo-Kinshasa'),
      ind(1971, 'Zaire'),
      ind(1997, 'DR Congo'),
    ],
  },
  500: { iso: 'UG', eras: [ruled(1886, 'Uganda', 'gb'), ind(1962, 'Uganda')] },
  501: {
    iso: 'KE',
    eras: [
      ruled(1886, 'British East Africa', 'gb'),
      ruled(1920, 'Kenya Colony', 'gb'),
      ind(1963, 'Kenya'),
    ],
  },
  510: {
    iso: 'TZ',
    eras: [
      ruled(1886, 'German East Africa', 'de'),
      ruled(1916, 'German East Africa', 'contested'),
      ruled(1920, 'Tanganyika', 'gb'),
      ind(1961, 'Tanganyika'),
      ind(1964, 'Tanzania'),
    ],
  },
  511: { eras: [ruled(1886, 'Zanzibar', 'gb'), ind(1963, 'Zanzibar')] },
  515: { eras: [ruled(1886, 'Ruanda-Urundi', 'be')] },
  516: { iso: 'BI', eras: [ind(1886, 'Burundi')] },
  517: { iso: 'RW', eras: [ind(1886, 'Rwanda')] },
  520: { iso: 'SO', eras: [ind(1886, 'Somalia')] },
  521: { eras: [ruled(1886, 'British Somaliland', 'gb')] },
  5200: {
    eras: [
      ruled(1886, 'Italian Somaliland', 'it'),
      ruled(1941, 'Italian Somaliland', 'gb'),
      ruled(1950, 'Italian Somaliland', 'it'),
    ],
  },
  522: {
    iso: 'DJ',
    eras: [
      ruled(1886, 'French Somaliland', 'fr'),
      ruled(1967, 'Afars and Issas', 'fr'),
      ind(1977, 'Djibouti'),
    ],
  },
  530: {
    iso: 'ET',
    eras: [ind(1886, 'Ethiopia'), ruled(1936, 'Italian East Africa', 'it'), ind(1941, 'Ethiopia')],
  },
  531: {
    iso: 'ER',
    eras: [ruled(1886, 'Eritrea', 'it'), ruled(1941, 'Eritrea', 'gb'), ind(1993, 'Eritrea')],
  },
  540: { iso: 'AO', eras: [ruled(1886, 'Angola', 'pt'), ind(1975, 'Angola')] },
  541: { iso: 'MZ', eras: [ruled(1886, 'Mozambique', 'pt'), ind(1975, 'Mozambique')] },
  550: { eras: [ruled(1886, 'Rhodesia and Nyasaland', 'gb')] },
  551: { iso: 'ZM', eras: [ruled(1886, 'Northern Rhodesia', 'gb'), ind(1964, 'Zambia')] },
  5518: { eras: [ruled(1886, 'North-Eastern Rhodesia', 'gb')] },
  5519: { eras: [ruled(1886, 'North-Western Rhodesia', 'gb')] },
  552: {
    iso: 'ZW',
    eras: [
      ruled(1886, 'Southern Rhodesia', 'gb'),
      ruled(1965, 'Rhodesia', 'contested'),
      ruled(1979, 'Zimbabwe Rhodesia', 'contested'),
      ind(1980, 'Zimbabwe'),
    ],
  },
  553: { iso: 'MW', eras: [ruled(1886, 'Nyasaland', 'gb'), ind(1964, 'Malawi')] },
  560: {
    iso: 'ZA',
    eras: [
      ruled(1886, 'Union of South Africa', 'gb'),
      ind(1931, 'Union of South Africa'),
      ind(1961, 'South Africa'),
    ],
  },
  561: { eras: [ruled(1886, 'Cape Colony', 'gb')] },
  562: { eras: [ruled(1886, 'Natal', 'gb')] },
  563: { eras: [ind(1886, 'Transvaal'), ruled(1900, 'Transvaal', 'gb')] },
  564: { eras: [ind(1886, 'Orange Free State'), ruled(1900, 'Orange River Colony', 'gb')] },
  565: {
    iso: 'NA',
    eras: [
      ruled(1886, 'German South West Africa', 'de'),
      ruled(1915, 'South West Africa', 'za'),
      ind(1990, 'Namibia'),
    ],
  },
  5612: { eras: [ruled(1886, 'British Bechuanaland', 'gb')] },
  570: { iso: 'LS', eras: [ruled(1886, 'Basutoland', 'gb'), ind(1966, 'Lesotho')] },
  571: { iso: 'BW', eras: [ruled(1886, 'Bechuanaland', 'gb'), ind(1966, 'Botswana')] },
  572: {
    iso: 'SZ',
    eras: [ruled(1886, 'Swaziland', 'gb'), ind(1968, 'Swaziland'), ind(2018, 'Eswatini')],
  },
  580: {
    iso: 'MG',
    eras: [
      ruled(1886, 'Madagascar', 'fr'),
      ruled(1958, 'Malagasy Republic', 'fr'),
      ind(1960, 'Malagasy Republic'),
      ind(1975, 'Madagascar'),
    ],
  },
  581: { iso: 'KM', eras: [ruled(1886, 'Comoros', 'fr'), ind(1975, 'Comoros')] },
  585: { eras: [ruled(1886, 'Réunion', 'fr')] },
  590: { iso: 'MU', eras: [ruled(1886, 'Mauritius', 'gb'), ind(1968, 'Mauritius')] },
  600: {
    iso: 'MA',
    eras: [ind(1886, 'Morocco'), ruled(1912, 'French Morocco', 'fr'), ind(1956, 'Morocco')],
  },
  602: { eras: [ruled(1886, 'Spanish Morocco', 'es')] },
  6021: { eras: [ruled(1886, 'Cape Juby', 'es')] },
  609: { eras: [ruled(1886, 'Spanish Sahara', 'es'), ruled(1975, 'Western Sahara', 'contested')] },
  610: { eras: [ruled(1886, 'Spanish West Africa', 'es')] },
  615: { iso: 'DZ', eras: [ruled(1886, 'Algeria', 'fr'), ind(1962, 'Algeria')] },
  616: { iso: 'TN', eras: [ruled(1886, 'Tunisia', 'fr'), ind(1956, 'Tunisia')] },
  620: {
    iso: 'LY',
    eras: [ruled(1886, 'Italian Libya', 'it'), ruled(1943, 'Libya', 'gb'), ind(1951, 'Libya')],
  },
  625: { iso: 'SD', eras: [ruled(1886, 'Anglo-Egyptian Sudan', 'gb'), ind(1956, 'Sudan')] },
  626: { iso: 'SS', eras: [ind(1886, 'South Sudan')] },
  651: {
    iso: 'EG',
    eras: [
      ruled(1886, 'Egypt', 'gb'),
      ind(1922, 'Egypt'),
      ind(1958, 'United Arab Republic'),
      ind(1971, 'Egypt'),
    ],
  },

  // --- Europe ---------------------------------------------------------------
  200: { iso: 'GB', eras: [ind(1886, 'United Kingdom')] },
  205: { iso: 'IE', eras: [ind(1886, 'Irish Free State'), ind(1937, 'Ireland')] },
  210: { iso: 'NL', eras: [ind(1886, 'Netherlands')] },
  211: { iso: 'BE', eras: [ind(1886, 'Belgium')] },
  212: { iso: 'LU', eras: [ind(1886, 'Luxembourg')] },
  220: { iso: 'FR', eras: [ind(1886, 'France')] },
  225: { iso: 'CH', eras: [ind(1886, 'Switzerland')] },
  230: { iso: 'ES', eras: [ind(1886, 'Spain')] },
  235: { iso: 'PT', eras: [ind(1886, 'Portugal')] },
  255: { iso: 'DE', eras: [empire(1886, 'German Empire', 'de'), ind(1918, 'Germany')] },
  260: {
    iso: 'DE',
    eras: [
      ruled(1886, 'Allied-occupied Germany', 'contested'),
      ind(1949, 'West Germany'),
      ind(1990, 'Germany'),
    ],
  },
  265: { eras: [ruled(1886, 'Soviet zone', 'contested'), ind(1949, 'East Germany')] },
  290: { iso: 'PL', eras: [ind(1886, 'Poland')] },
  291: { eras: [{ from: 1886, name: 'Free City of Danzig', sovereign: false }] },
  300: { eras: [empire(1886, 'Austria-Hungary', 'at-hu')] },
  305: { iso: 'AT', eras: [ind(1886, 'Austria')] },
  310: { iso: 'HU', eras: [ind(1886, 'Hungary')] },
  315: { iso: 'CZ', eras: [ind(1886, 'Czechoslovakia')] },
  316: { iso: 'CZ', eras: [ind(1886, 'Czech Republic')] },
  317: { iso: 'SK', eras: [ind(1886, 'Slovakia')] },
  325: { iso: 'IT', eras: [ind(1886, 'Italy')] },
  338: { iso: 'MT', eras: [ruled(1886, 'Malta', 'gb'), ind(1964, 'Malta')] },
  339: {
    iso: 'AL',
    eras: [ind(1886, 'Albania'), ruled(1939, 'Albania', 'it'), ind(1944, 'Albania')],
  },
  340: { iso: 'RS', eras: [ind(1886, 'Serbia')] },
  341: { iso: 'ME', eras: [ind(1886, 'Montenegro')] },
  343: { iso: 'MK', eras: [ind(1886, 'Macedonia'), ind(2019, 'North Macedonia')] },
  344: { iso: 'HR', eras: [ind(1886, 'Croatia')] },
  345: {
    eras: [
      ind(1886, 'Kingdom of Serbs, Croats and Slovenes'),
      ind(1929, 'Yugoslavia'),
      ind(2003, 'Serbia and Montenegro'),
    ],
  },
  346: { iso: 'BA', eras: [ind(1886, 'Bosnia and Herzegovina')] },
  347: { iso: 'XK', eras: [ind(1886, 'Kosovo')] },
  349: { iso: 'SI', eras: [ind(1886, 'Slovenia')] },
  350: { iso: 'GR', eras: [ind(1886, 'Greece')] },
  352: { iso: 'CY', eras: [ruled(1886, 'Cyprus', 'gb'), ind(1960, 'Cyprus')] },
  355: { iso: 'BG', eras: [ruled(1886, 'Bulgaria', 'tr'), ind(1908, 'Bulgaria')] },
  359: { iso: 'MD', eras: [ind(1886, 'Moldova')] },
  360: { iso: 'RO', eras: [ind(1886, 'Romania')] },
  365: {
    iso: 'RU',
    eras: [
      empire(1886, 'Russian Empire', 'ru'),
      ind(1917, 'Soviet Russia'),
      empire(1922, 'Soviet Union', 'su'),
      ind(1991, 'Russia'),
    ],
  },
  366: { iso: 'EE', eras: [ind(1886, 'Estonia')] },
  367: { iso: 'LV', eras: [ind(1886, 'Latvia')] },
  368: { iso: 'LT', eras: [ind(1886, 'Lithuania')] },
  369: { iso: 'UA', eras: [ind(1886, 'Ukraine')] },
  370: { iso: 'BY', eras: [ind(1886, 'Belarus')] },
  371: { iso: 'AM', eras: [ind(1886, 'Armenia')] },
  372: { iso: 'GE', eras: [ind(1886, 'Georgia')] },
  373: { iso: 'AZ', eras: [ind(1886, 'Azerbaijan')] },
  375: { iso: 'FI', eras: [ind(1886, 'Finland')] },
  380: { iso: 'SE', eras: [ind(1886, 'Sweden–Norway'), ind(1905, 'Sweden')] },
  385: { iso: 'NO', eras: [ind(1886, 'Norway')] },
  390: { iso: 'DK', eras: [ind(1886, 'Denmark')] },
  395: { iso: 'IS', eras: [ruled(1886, 'Iceland', 'dk'), ind(1918, 'Iceland')] },
  640: { iso: 'TR', eras: [empire(1886, 'Ottoman Empire', 'tr'), ind(1923, 'Turkey')] },
  3461: { eras: [ruled(1886, 'Bosnia', 'at-hu')] },
  3462: { eras: [ruled(1886, 'Herzegovina', 'at-hu')] },
}

export interface VintageRegionSpec {
  /** Units this region names, washes and deals on; every other unit in the
   *  clip is context — it bounds borders but is never drawn as a subject. */
  owns: (gwcode: number) => boolean
  /** [west, south, east, north] in degrees. */
  frame: [number, number, number, number]
  clip: [number, number, number, number]
  pointBudget: number
}

export const VINTAGE_REGION_SPECS: Record<VintageRegionId, VintageRegionSpec> = {
  africa: {
    owns: gwcode =>
      (gwcode >= 400 && gwcode <= 626) || gwcode === 651 || (gwcode >= 4000 && gwcode < 6270),
    frame: [-20, -36, 54, 38],
    clip: [-42, -50, 78, 50],
    pointBudget: 8500,
  },
  europe: {
    owns: gwcode =>
      (gwcode >= 200 && gwcode < 400) || gwcode === 640 || (gwcode >= 2000 && gwcode < 4000),
    frame: [-12, 34, 44, 71],
    clip: [-45, 20, 82, 80],
    pointBudget: 11000,
  },
}
