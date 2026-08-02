import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'

/**
 * Guards the curated lyric walls. These files are hand-written rather than
 * generated, so nothing else checks them — and the two failure modes both ship
 * silently: a wall that names its own country, and a translation with no
 * recorded origin.
 *
 * Format: public/anthems/lyrics/readme-anthems.md
 */
const DIRECTORY = 'public/anthems/lyrics'

const files = readdirSync(DIRECTORY).filter(name => name.endsWith('-anthem.json'))
const entries = files.map(
  name => [name, JSON.parse(readFileSync(`${DIRECTORY}/${name}`, 'utf8')) as AnthemLyrics] as const
)

const SCRIPT_RANGES: { [script: string]: RegExp } = {
  Cyrillic: /[Ѐ-ӿ]/,
  Greek: /[Ͱ-Ͽ]/,
  Arabic: /[؀-ۿ]/,
  Hebrew: /[֐-׿]/,
  CJK: /[぀-ヿ一-鿿]/,
  Thai: /[฀-๿]/,
  Devanagari: /[ऀ-ॿ]/,
  Ethiopic: /[ሀ-፿]/,
  Hangul: /[가-힯]/,
}

describe('anthem lyric walls', () => {
  it('ships at least one curated wall', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('names the file after the country it holds', () => {
    const mismatched = entries.filter(([name, lyrics]) => !name.startsWith(`${lyrics.isoCode}-`))
    expect(mismatched.map(([name]) => name)).toEqual([])
  })

  it('records where both the original and the translation came from', () => {
    // A translation carries its own rights even when the original is free, so
    // an unattributed English column is a licensing gap, not a cosmetic one.
    const unsourced = entries.filter(
      ([, l]) =>
        !l.sources?.local?.licence ||
        !l.sources?.english?.licence ||
        !l.sources?.english?.author?.trim()
    )
    expect(unsourced.map(([name]) => name)).toEqual([])
  })

  it('pairs every local line with a translated one', () => {
    // The reveal cross-fades line-for-line; a mismatch swaps some lines early.
    const ragged = entries.flatMap(([name, l]) =>
      l.verses
        .map((verse, index) => ({ name, index, a: verse.local.length, b: verse.english.length }))
        .filter(v => v.a !== v.b)
    )
    expect(ragged.map(v => `${v.name} verse ${v.index + 1}: ${v.a} vs ${v.b}`)).toEqual([])
  })

  it('writes each verse in the script it claims', () => {
    // The wrong-block trap: extracting an article's English translation instead
    // of its local verse. A script assertion catches it; a line count does not.
    const wrongScript = entries.filter(([, l]) => {
      const range = SCRIPT_RANGES[l.language.script]
      if (!range) return false
      return !l.verses.some(verse => verse.local.some(line => range.test(line)))
    })
    expect(wrongScript.map(([name, l]) => `${name}: no ${l.language.script}`)).toEqual([])
  })

  it('masks the country it belongs to, in both columns', () => {
    // The wall is a hint. A verse that prints its own country's name unmasked
    // hands over the answer the round is asking for.
    //
    // Asserted as "no name survives outside [[…]]" rather than "something is
    // masked": plenty of anthems never name their country at all — Kimigayo,
    // Lupang Hinirang and İstiklâl Marşı among them — so an unmarked file is
    // only a bug when a name is actually sitting there in the open.
    const leaks = entries.flatMap(([file, lyrics]) => {
      const name = COUNTRIES[lyrics.isoCode]?.name
      const terms = [name?.english, name?.local].filter((t): t is string => Boolean(t))
      if (!terms.length) return []

      // Strip the masked spans, then look for a name in what is left on show.
      const exposed = lyrics.verses
        .flatMap(verse => [...verse.local, ...verse.english])
        .map(line => line.replace(/\[\[.+?\]\]/g, ''))
        .join('\n')

      // Bantu and Romance forms glue the name to a prefix or suffix
      // ("weZimbabwe", "Abanyarwanda", "Congolais"), so the name is matched
      // anywhere inside a word rather than only on word boundaries.
      //
      // No lookbehind here. An earlier version skipped a match whose preceding
      // character was lowercase, meaning to ignore "sireland" — but with the
      // `i` flag that also swallowed every ordinary occurrence sitting after a
      // lowercase letter, and Ireland's own anthem leaked past a green test.
      // Over-reporting a prefixed word is a curation nudge; under-reporting is
      // a spoiled round.
      return terms
        .filter(term =>
          new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu').test(exposed)
        )
        .map(term => `${file}: "${term}" left unmasked`)
    })
    expect(leaks).toEqual([])
  })

  it('leaves no empty lines to render as gaps in the wall', () => {
    const empty = entries.filter(([, l]) =>
      l.verses.some(verse => [...verse.local, ...verse.english].some(line => !line.trim()))
    )
    expect(empty.map(([name]) => name)).toEqual([])
  })
})
