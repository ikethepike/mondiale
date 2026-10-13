import { describe, expect, it } from 'vitest'
import { infoboxLogo, logoFileName } from './wikitext'

/**
 * Every string below is the VERBATIM `|logo=` value from the named article,
 * captured from the live API. The two that the old raw-value read failed on
 * (Britain, Algeria) are the reason this parser exists — both wrap a perfectly
 * good filename in markup, and both were reported as "no logo" for it.
 */
describe('logoFileName', () => {
  it('unwraps the markup real party infoboxes put around a filename', () => {
    // Liberal Democrats (UK) — a noinclude wrapper AND an escaped-pipe argument.
    expect(
      logoFileName('<noinclude>Liberal Democrats logo.svg{{!}}class=skin-invert</noinclude>')
    ).toBe('Liberal Democrats logo.svg')
    // Democratic National Rally (Algeria) — File: prefix plus the same argument.
    expect(logoFileName('File:Democratic National Rally logo.png{{!}}class=skin-invert')).toBe(
      'Democratic National Rally logo.png'
    )
    // Democratic Alliance (South Africa) — a bare File: prefix.
    expect(logoFileName('File:Democratic Alliance (SA) logo.svg')).toBe(
      'Democratic Alliance (SA) logo.svg'
    )
    // uMkhonto weSizwe — parentheses in the name itself must survive.
    expect(logoFileName('File:Logo of the uMkhonto we Sizwe (political party).png')).toBe(
      'Logo of the uMkhonto we Sizwe (political party).png'
    )
    // Prosperity Party (Ethiopia), Fidesz, CDU — already clean, must not break.
    expect(logoFileName('Prosperity Party logo.svg')).toBe('Prosperity Party logo.svg')
    expect(logoFileName('Fidesz 2015.svg')).toBe('Fidesz 2015.svg')
    expect(logoFileName('CDU Logo 2023.svg')).toBe('CDU Logo 2023.svg')
  })

  it('takes the filename out of a full File link, not its arguments', () => {
    expect(logoFileName('[[File:Arbeiderpartiet.png|thumb|250px|alt=logo]]')).toBe(
      'Arbeiderpartiet.png'
    )
  })

  it('refuses a value that is not an image filename', () => {
    // A size, a stray template, an empty field: all "no logo here", not a guess.
    expect(logoFileName('225')).toBeUndefined()
    expect(logoFileName('')).toBeUndefined()
    expect(logoFileName('{{Infobox}}')).toBeUndefined()
    expect(logoFileName('see the party website')).toBeUndefined()
  })
})

describe('infoboxLogo', () => {
  it('reads the field from an infobox and ignores a size beside it', () => {
    const text =
      '{{Infobox political party\n| name = X\n| logo = Fidesz 2015.svg\n| logo_size = 150px\n}}'
    expect(infoboxLogo(text)).toBe('Fidesz 2015.svg')
  })

  it('falls through to the other spellings a party infobox uses', () => {
    expect(infoboxLogo('{{Infobox\n| logo_image = A logo.png\n}}')).toBe('A logo.png')
    expect(infoboxLogo('{{Infobox\n| party_logo = B logo.svg\n}}')).toBe('B logo.svg')
  })

  it('does not read the word logo out of prose or another field', () => {
    // The field must start its own line — "the logo = " inside a sentence is
    // not a field, and a caption mentioning a logo is not one either.
    expect(infoboxLogo('The party changed its logo = twice in 1990.')).toBeUndefined()
    expect(infoboxLogo('| caption = Their logo.svg was redrawn\n')).toBeUndefined()
  })

  it('skips a field whose value is not a file and keeps looking', () => {
    const text = '{{Infobox\n| logo = 200px\n| logo_image = Real logo.svg\n}}'
    expect(infoboxLogo(text)).toBe('Real logo.svg')
  })
})
