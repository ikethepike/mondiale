/**
 * Writing samples for the Mother Tongue round.
 *
 * The round's best hint is seeing a language WRITTEN — Devanagari, Tamil,
 * Telugu — which narrows the field hard without naming a country. Most
 * languages borrow that sample from the anthem lyric walls under
 * public/anthems/lyrics/, but six widely-spoken languages have no anthem in
 * them at all: India's anthem is Bengali, so Hindi, Marathi, Tamil and Telugu
 * are unserved; Nigeria's is English, so Hausa is; and Wales is not a country
 * on the board, so Welsh has no file.
 *
 * These fill that gap. They are ORIGINAL nonsense verse written for this
 * project — invented beasts doing impossible things, in a bouncy children's
 * rhyme register. Nothing here is translated, adapted or reworded from any
 * existing book. They are deliberately about nothing, so a sample can never
 * leak a country the way a sentence about a real place might.
 *
 * Keep them:
 *  - two lines, so the chip stays a chip
 *  - rhyming and metrical, because a limp sample reads as a broken one
 *  - free of place names, demonyms and anything geographic
 *  - genuinely in the language's own script, which is the entire hint
 *
 * NEEDS A NATIVE EYE: ta, te and ha were written at the edge of what could be
 * verified here. The rhyme and meter are the parts most likely to be off.
 */
export interface TongueSampleSeed {
  /** The language exactly as `Country.languages` spells it. */
  language: string
  /** BCP-47 tag for the `lang` attribute, so browsers pick the right font and
   *  screen readers the right voice. A display name there is not valid. */
  code: string
  /** Its writing system, for the chip's caption. */
  script: string
  /** Two lines of original nonsense verse. */
  lines: [string, string]
}

export const TONGUE_SAMPLE_SEEDS: TongueSampleSeed[] = [
  {
    language: 'Hindi',
    code: 'hi',
    script: 'Devanagari',
    // A hat-wearing elephant drinks the sea and burps out clouds.
    lines: ['टोपी वाले हाथी ने पूरा समंदर पी लिया,', 'फिर डकार में सौ बादल छोड़कर मुस्करा दिया।'],
  },
  {
    language: 'Marathi',
    code: 'mr',
    script: 'Devanagari',
    // A snail overtakes the wind, then apologises to it.
    lines: ['गोगलगायीने वाऱ्याला शर्यतीत मागे टाकले,', 'मग थांबून त्याची माफी मागत हळूच हसले।'],
  },
  {
    language: 'Tamil',
    code: 'ta',
    script: 'Tamil',
    // A cat knits a moon-hat, then complains it is too round.
    lines: ['பூனை ஒன்று நிலவுக்குத் தொப்பி பின்னியது,', 'அது ரொம்ப வட்டம் என்று முணுமுணுத்தது.'],
  },
  {
    language: 'Telugu',
    code: 'te',
    script: 'Telugu',
    // A frog swallows a cloud and hiccups rain for a week.
    lines: ['కప్ప ఒకటి మేఘాన్ని మింగేసింది,', 'వారం రోజులు ఎక్కిళ్ళలో వర్షం కురిసింది.'],
  },
  {
    language: 'Hausa',
    code: 'ha',
    script: 'Latin',
    // A goat borrows the sun, returns it late and slightly bent.
    lines: ['Akuya ta ari rana ta kai gida,', "Ta mayar da ita a makare, ta ɗan lanƙwasa."],
  },
  {
    language: 'Welsh',
    code: 'cy',
    script: 'Latin',
    // A sheep teaches the rain to spell, badly.
    lines: ['Dysgodd y ddafad i’r glaw sut i sillafu,', 'Ond mynnodd y glaw mai “gwlyb” oedd pob gair yn hollol.'],
  },
]
