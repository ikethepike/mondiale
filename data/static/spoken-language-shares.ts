/**
 * Speaker shares for the languages a country's Factbook language prose NAMES
 * but cannot size — Malaysia lists "Chinese (Cantonese, Mandarin, …)" with no
 * figure, so no share threshold can ever reach it. Each share is the matching
 * group's own figure from the same Factbook entry's "Ethnic groups", quoted in
 * `basis`; `generators/lib/languages.test.ts` holds every row to that quote and
 * to the language prose naming the language. Applied by create-countries-file.ts
 * under the same `SPOKEN_SHARE_THRESHOLD` as the parsed shares.
 */
export const SPOKEN_LANGUAGE_SHARES: {
  [isoCode: string]: { language: string; share: number; basis: string }[]
} = {
  BJ: [{ language: 'Yoruba', share: 12, basis: 'Yoruba and related 12%' }],
  BN: [{ language: 'Chinese', share: 9.6, basis: 'Chinese 9.6%' }],
  GM: [{ language: 'Wolof', share: 12.9, basis: 'Wolof 12.9%' }],
  MY: [
    { language: 'Chinese', share: 20.6, basis: 'Chinese 20.6%' },
    { language: 'Tamil', share: 6, basis: 'Indian 6%' },
  ],
  NE: [{ language: 'Hausa', share: 53.1, basis: 'Hausa 53.1%' }],
  NG: [
    { language: 'Hausa', share: 30, basis: 'Hausa 30%' },
    { language: 'Yoruba', share: 15.5, basis: 'Yoruba 15.5%' },
    { language: 'Igbo', share: 15.2, basis: 'Igbo (Ibo) 15.2%' },
  ],
  SN: [{ language: 'Wolof', share: 39.7, basis: 'Wolof 39.7%' }],
  SY: [{ language: 'Kurdish', share: 10, basis: 'Kurd ~10%' }],
  TG: [{ language: 'Ewe', share: 42.4, basis: 'Adja-Ewe/Mina 42.4%' }],
  TR: [{ language: 'Kurdish', share: 19, basis: 'Kurdish 19%' }],
}
