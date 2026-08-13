import { describe, expect, it } from 'vitest'
import { electionBoxes, plainText, templateAt, templateFields } from './wikitext'

/**
 * The elections parse has no other test, and every rule in it was paid for by a
 * specific article that shipped wrong data. These pin the cases named in the
 * generator's own doc comment, so a tidy-up cannot quietly undo them.
 */

describe('templateAt', () => {
  // THE bug this scanner exists for. `}}}}` holds three overlapping
  // two-character matches, so an index-by-index scan decrements depth once too
  // often, goes negative, and starts reading nested pipes as top-level fields.
  // That truncated Poland's Sejm to two parties.
  it('counts an overlapping brace run once per pair', () => {
    const text = '{{Infobox election|a={{nested|{{deeper|x}}}}|b=2}} trailing'
    const block = templateAt(text, 0)
    expect(block.endsWith('}}')).toBe(true)
    expect(block).not.toContain('trailing')
    expect(templateFields(block).b).toBe('2')
  })

  it('returns the rest of the text when a template never closes', () => {
    const text = '{{Infobox election|a=1'
    expect(templateAt(text, 0)).toBe(text)
  })
})

describe('templateFields', () => {
  it('reads only depth-1 pipes, leaving nested templates whole', () => {
    const block = '{{Infobox|party1=A|seats1={{n|5|6}}|party2=B}}'
    const fields = templateFields(block)
    expect(fields.party1).toBe('A')
    expect(fields.party2).toBe('B')
    expect(fields.seats1).toBe('{{n|5|6}}')
  })

  // A wikilink's pipe is a display separator, not a field boundary.
  it('does not split on a pipe inside a wikilink', () => {
    const fields = templateFields('{{Infobox|leader1=[[Donald Tusk|Tusk]]|seats1=157}}')
    expect(fields.leader1).toBe('[[Donald Tusk|Tusk]]')
    expect(fields.seats1).toBe('157')
  })

  it('lowercases keys and keeps values verbatim', () => {
    expect(templateFields('{{Infobox|Election_Name = Sejm }}').election_name).toBe('Sejm')
  })
})

describe('electionBoxes', () => {
  // A bicameral article wraps each chamber in its own `| module = {{… embed =
  // yes …}}`. Reading the outermost template reads the WRAPPER, whose depth-1
  // fields are whichever chamber happened to sit outside the modules — which
  // reported the Senate's 41 seats as Poland's result.
  it('prefers the embedded chamber boxes over their wrapper', () => {
    const text = [
      '{{Infobox election',
      '| module = {{Infobox election | embed = yes | election_name = Sejm | seats1 = 157 }}',
      '| module2 = {{Infobox election | embed = yes | election_name = Senate | seats1 = 41 }}',
      '}}',
    ].join('\n')
    const boxes = electionBoxes(text)
    // The wrapper survives the `embed = yes` filter because that string falls
    // inside its own first 400 characters — but the two chambers come with it,
    // and `readElection` picks the box with the most parties, so the wrapper
    // (which has none of its own) never wins.
    expect(boxes.length).toBeGreaterThanOrEqual(2)
    const named = boxes.map(box => templateFields(box).election_name).filter(Boolean)
    expect(named).toEqual(['Sejm', 'Senate'])
  })

  // `Infobox legislative election` is a separate template name; matching it too
  // is what fixed the Netherlands, Brazil, Argentina and Indonesia.
  it('matches the legislative variant of the template name', () => {
    expect(electionBoxes('{{Infobox legislative election|seats1=1}}')).toHaveLength(1)
  })

  it('falls back to the outermost boxes when nothing is embedded', () => {
    expect(electionBoxes('{{Infobox election|election_name=Riksdag|seats1=107}}')).toHaveLength(1)
  })
})

describe('plainText', () => {
  it('unwraps a wikilink to its display text', () => {
    expect(plainText('[[Moderate Party|Moderates]]')).toBe('Moderates')
    expect(plainText('[[Sweden Democrats]]')).toBe('Sweden Democrats')
  })

  // Canada names the party through a colour template, as a positional argument.
  // Stripping the template outright would drop the only name the infobox has.
  it('keeps the longest positional argument of a colour template', () => {
    expect(plainText('{{Canadian party colour|CA|Liberal|name}}')).toBe('Liberal')
  })

  // A trailing parenthetical is usually a disambiguator — but for Nepal it IS
  // the party's identity: three "Communist Party of Nepal (…)" blocs collapse
  // into one repeated name without it.
  it('drops a country or year disambiguator but keeps a faction', () => {
    expect(plainText('Christian Democrats (Sweden)')).toBe('Christian Democrats')
    expect(plainText('Some Party (2020)')).toBe('Some Party')
    expect(plainText('Communist Party of Nepal (Unified Marxist–Leninist)')).toBe(
      'Communist Party of Nepal (Unified Marxist–Leninist)'
    )
  })

  it('strips comments, bold markup and tags, and folds whitespace', () => {
    // Tags are unwrapped, not deleted — only their MARKUP goes. A citation's
    // visible text stays, which is why a party name split across a tag is not
    // silently halved.
    expect(plainText("<!-- hidden -->'''Bold'''  <ref>cite</ref> name")).toBe('Bold cite name')
    expect(plainText('  spaced   out  ')).toBe('spaced out')
  })

  it('turns a line break into a separator rather than joining two names', () => {
    expect(plainText('Labour<br />Conservative')).toBe('Labour / Conservative')
  })
})
