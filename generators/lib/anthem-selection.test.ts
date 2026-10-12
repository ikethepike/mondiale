import { describe, expect, it } from 'vitest'
import {
  chooseAnthems,
  curateAnthem,
  isLabel,
  isUncuratedRawLabel,
  type AnthemRow,
} from './anthem-selection'

const GSTK = 'anthem:god-save-the-king'
const GDNZ = 'anthem:god-defend-new-zealand'
const MAWTINI = 'anthem:mawtini'
const FIDAI = 'anthem:fidai'

const godSaveTheKing = (isoCode: AnthemRow['isoCode']): AnthemRow => ({
  isoCode,
  anthem: GSTK,
  title: 'God Save the King',
  file: 'God Save The King (1930s instrumental).oga',
  composer: 'Henry Carey',
  royal: true,
})

describe('chooseAnthems', () => {
  it("takes every field from New Zealand's own anthem, not the realm's", () => {
    const chosen = chooseAnthems([
      godSaveTheKing('GB'),
      godSaveTheKing('NZ'),
      {
        isoCode: 'NZ',
        anthem: GDNZ,
        title: 'God Defend New Zealand',
        file: 'God Defend New Zealand instrumental.ogg',
        writtenYear: 1876,
      },
    ])

    expect(chosen.get('NZ')?.anthem).toEqual({
      anthem: GDNZ,
      title: 'God Defend New Zealand',
      files: ['God Defend New Zealand instrumental.ogg'],
      writtenYear: 1876,
      royal: false,
    })
    expect(chosen.get('GB')?.anthem.title).toBe('God Save the King')
    expect(chosen.get('NZ')?.passedOver).toEqual([
      { title: 'God Save the King', reason: 'royal anthem' },
    ])
  })

  it("prefers a country's own anthem over one another country also lists", () => {
    const chosen = chooseAnthems([
      { isoCode: 'IQ', anthem: MAWTINI, title: 'Mawtini', file: 'Mawtini.ogg' },
      { isoCode: 'PS', anthem: MAWTINI, title: 'Mawtini', file: 'Mawtini.ogg' },
      {
        isoCode: 'PS',
        anthem: FIDAI,
        title: "Fida'i",
        file: 'Anthem of Palestine.ogg',
        composer: 'Ali Esmaeil',
      },
    ])

    expect(chosen.get('PS')?.anthem).toMatchObject({ title: "Fida'i", composer: 'Ali Esmaeil' })
    expect(chosen.get('IQ')?.anthem.title).toBe('Mawtini')
    expect(chosen.get('PS')?.passedOver).toEqual([
      { title: 'Mawtini', reason: 'held by 2 countries' },
    ])
  })

  it('demotes a royal anthem even when no other country shares it', () => {
    const chosen = chooseAnthems([
      { isoCode: 'DK', anthem: 'Q1', title: 'Kong Christian', file: 'Kong.ogg', royal: true },
      { isoCode: 'DK', anthem: 'Q2', title: 'Der er et yndigt land', file: 'Der er.ogg' },
    ])
    expect(chosen.get('DK')?.anthem.title).toBe('Der er et yndigt land')
  })

  it('prefers an anthem with a playable recording, then the first listed', () => {
    const chosen = chooseAnthems([
      { isoCode: 'FR', anthem: 'Q1', title: 'Silent', file: 'Silent (MIDI).mid' },
      { isoCode: 'FR', anthem: 'Q2', title: 'La Marseillaise', file: 'La Marseillaise.ogg' },
      { isoCode: 'FR', anthem: 'Q3', title: 'Later', file: 'Later.ogg' },
    ])
    expect(chosen.get('FR')?.anthem.title).toBe('La Marseillaise')
  })

  it('refuses a language or a country as a composer', () => {
    const chosen = chooseAnthems([
      { isoCode: 'SC', anthem: 'a', title: 'Koste Seselwa', composer: 'Seychellois Creole' },
    ])
    expect(chosen.get('SC')?.anthem.composer).toBeUndefined()
  })

  it('skips unlabelled anthems and composers that are no name', () => {
    const chosen = chooseAnthems([
      { isoCode: 'PL', anthem: 'Q1', title: 'Q9999', file: 'Other.ogg' },
      {
        isoCode: 'PL',
        anthem: 'Q2',
        title: 'Poland Is Not Yet Lost',
        file: 'Mazurek.oga',
        composer: 'http://www.wikidata.org/.well-known/genid/ef48570fadf9bf7a',
      },
    ])
    expect(chosen.get('PL')?.anthem).toMatchObject({
      anthem: 'Q2',
      title: 'Poland Is Not Yet Lost',
    })
    expect(chosen.get('PL')?.anthem.composer).toBeUndefined()
  })
})

describe('curateAnthem', () => {
  const entry = { title: 'God Save the King', webm: '/anthems/NZ.webm', m4a: '/anthems/NZ.m4a' }

  it('lets the curated title and composer win over the harvested ones', () => {
    expect(curateAnthem('NZ', { ...entry, composer: 'Henry Carey' })).toMatchObject({
      title: 'God Defend New Zealand',
      composer: 'John Joseph Woods',
      writtenYear: 1876,
    })
  })

  it('drops a harvested field the table nulls', () => {
    const curated = curateAnthem('NL', { ...entry, composer: 'Adrianus Valerius' })
    expect('composer' in curated).toBe(false)
  })

  it('drops a composer that is an unresolved Wikidata value', () => {
    const curated = curateAnthem('PL', { ...entry, composer: 'http://www.wikidata.org/x' })
    expect('composer' in curated).toBe(false)
  })

  it('flags a descriptive label only when no override vouches for it', () => {
    expect(isUncuratedRawLabel('MR', 'National anthem of Mauritania')).toBe(true)
    expect(isUncuratedRawLabel('GD', 'Grenada National State Anthem')).toBe(true)
    expect(isUncuratedRawLabel('ZA', 'National Anthem of South Africa')).toBe(false)
    expect(isUncuratedRawLabel('JP', 'Kimigayo')).toBe(false)
  })
})

describe('isLabel', () => {
  it('refuses Q-ids, genid URLs and blanks', () => {
    expect(isLabel('Q42')).toBe(false)
    expect(isLabel('http://www.wikidata.org/.well-known/genid/abc')).toBe(false)
    expect(isLabel(' ')).toBe(false)
    expect(isLabel('Henry Carey')).toBe(true)
  })
})
