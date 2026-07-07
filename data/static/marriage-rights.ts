// Hand-maintained: year each country legalized same-sex marriage NATIONWIDE.
// Keys MUST be ISO 3166-1 alpha-2 codes (the generator looks these up by our
// ISO code — see create-countries-file.ts). A wrong code silently attributes
// the fact to a different country, so double-check the code, not just the name.
//
// Source: consensus of nationwide legalization dates. Update when a new country
// legalizes (add the ISO2 + effective year), then re-run `generate:countries`.
export const MARRIAGE_RIGHTS: {
  [isoCode: string]: {
    sameSexMarriage: boolean
    civilUnions: boolean
    yearAllowed: number
  }
} = {
  NL: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2001 },
  BE: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2003 },
  ES: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2005 },
  CA: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2005 },
  ZA: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2006 },
  NO: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2009 },
  SE: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2009 },
  PT: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2010 },
  IS: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2010 },
  AR: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2010 },
  DK: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2012 },
  BR: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2013 },
  FR: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2013 },
  UY: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2013 },
  NZ: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2013 },
  GB: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2014 },
  LU: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2015 },
  US: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2015 },
  IE: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2015 },
  CO: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2016 },
  FI: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2017 },
  MT: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2017 },
  DE: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2017 },
  AU: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2017 },
  AT: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2019 },
  TW: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2019 },
  EC: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2019 },
  CR: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2020 },
  CL: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2022 },
  CH: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2022 },
  SI: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2022 },
  CU: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2022 },
  AD: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2023 },
  EE: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2024 },
  GR: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2024 },
  LI: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2025 },
  TH: { sameSexMarriage: true, civilUnions: true, yearAllowed: 2025 },
}
