/**
 * Speaker shares for the languages a country's Factbook language prose NAMES
 * but neither the share parse nor a statute-backed CLDR figure can size:
 * `unsized` where the prose gives no figure (Malaysia's "Chinese (Cantonese,
 * Mandarin, …)"), `survey` where its figures add past 100% and are skipped as a
 * can-speak survey (Belize's "Spanish 56.6%"). Each share is the matching
 * group's figure from the same entry's "Ethnic groups", quoted in `basis` — a
 * home community, not schooling. `generators/lib/languages.test.ts` holds every
 * row to that quote and that reason; `generators/vendors/cldr/create-speakers.ts`
 * reads a row ahead of every other source, and its report lists the rows CLDR
 * has since come to size, to delete.
 */
export const SPOKEN_LANGUAGE_SHARES: {
  [isoCode: string]: {
    language: string
    share: number
    basis: string
    reason: 'unsized' | 'survey'
  }[]
} = {
  AD: [{ language: 'Portuguese', share: 10, basis: 'Portuguese 10%', reason: 'survey' }],
  // Belize's figures are a can-speak survey (they add to 182%).
  BZ: [{ language: 'Spanish', share: 52.9, basis: 'Mestizo 52.9%', reason: 'survey' }],
  BJ: [{ language: 'Yoruba', share: 12, basis: 'Yoruba and related 12%', reason: 'unsized' }],
  GM: [{ language: 'Wolof', share: 12.9, basis: 'Wolof 12.9%', reason: 'unsized' }],
  MY: [
    { language: 'Chinese', share: 20.6, basis: 'Chinese 20.6%', reason: 'unsized' },
    // A proxy: Tamils are about 85% of Malaysian Indians, ≈5.1% of the
    // country — still past the threshold.
    { language: 'Tamil', share: 6, basis: 'Indian 6%', reason: 'unsized' },
  ],
  NE: [{ language: 'Hausa', share: 53.1, basis: 'Hausa 53.1%', reason: 'unsized' }],
  NG: [
    { language: 'Hausa', share: 30, basis: 'Hausa 30%', reason: 'unsized' },
    { language: 'Yoruba', share: 15.5, basis: 'Yoruba 15.5%', reason: 'unsized' },
    { language: 'Igbo', share: 15.2, basis: 'Igbo (Ibo) 15.2%', reason: 'unsized' },
  ],
  SY: [{ language: 'Kurdish', share: 10, basis: 'Kurd ~10%', reason: 'unsized' }],
  TG: [{ language: 'Ewe', share: 42.4, basis: 'Adja-Ewe/Mina 42.4%', reason: 'unsized' }],
  TR: [{ language: 'Kurdish', share: 19, basis: 'Kurdish 19%', reason: 'unsized' }],
}
