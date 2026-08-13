/**
 * The pure wikitext parsers behind the elections generator.
 *
 * Split out of `create-elections-file.ts` so they can be TESTED. That file runs
 * its whole pipeline at import time (top-level await over ~70 network reads),
 * so a test importing it would fetch Wikipedia rather than assert on a string.
 * Nothing here touches the network, the filesystem or the clock.
 *
 * Every rule encoded below was learned from a specific article that broke:
 * Poland's `}}}}` run, its bicameral `| module =` wrapper, Canada's colour
 * templates, Nepal's parenthetical factions. The tests beside this file pin
 * those cases so a tidy-up cannot quietly undo them.
 */

/**
 * The template starting at `index`, brace-balanced. The cursor advances by two
 * over every `{{`/`}}` so an overlapping run like `}}}}` is counted once per
 * pair rather than once per position.
 */
export const templateAt = (text: string, index: number): string => {
  let depth = 0
  let cursor = index
  while (cursor < text.length - 1) {
    const pair = text.slice(cursor, cursor + 2)
    if (pair === '{{') {
      depth += 1
      cursor += 2
      continue
    }
    if (pair === '}}') {
      depth -= 1
      cursor += 2
      if (depth === 0) return text.slice(index, cursor)
      continue
    }
    cursor += 1
  }
  return text.slice(index)
}

/** `|key = value` pairs at depth 1 of ONE template — nested templates and
 *  wikilinks keep their own pipes. */
export const templateFields = (block: string): Record<string, string> => {
  const body = block.slice(2, -2)
  const fields: Record<string, string> = {}
  let depth = 0
  let link = 0
  let buffer = ''
  let cursor = 0

  const flush = () => {
    const split = buffer.indexOf('=')
    if (split > 0)
      fields[buffer.slice(0, split).trim().toLowerCase()] = buffer.slice(split + 1).trim()
    buffer = ''
  }

  while (cursor < body.length) {
    const pair = body.slice(cursor, cursor + 2)
    if (pair === '{{' || pair === '}}' || pair === '[[' || pair === ']]') {
      if (pair === '{{') depth += 1
      else if (pair === '}}') depth -= 1
      else if (pair === '[[') link += 1
      else link -= 1
      buffer += pair
      cursor += 2
      continue
    }
    if (body[cursor] === '|' && depth === 0 && link === 0) {
      flush()
      cursor += 1
      continue
    }
    buffer += body[cursor]
    cursor += 1
  }
  flush()
  return fields
}

/** Every election infobox, preferring the EMBEDDED ones — a bicameral article
 *  puts each chamber in its own `| module = {{… embed = yes …}}`. */
export const electionBoxes = (text: string): string[] => {
  const blocks: string[] = []
  const pattern = /\{\{\s*Infobox\s+(?:legislative\s+)?election/gi
  for (const match of text.matchAll(pattern)) blocks.push(templateAt(text, match.index))
  const embedded = blocks.filter(block => /\|\s*embed\s*=\s*yes/i.test(block.slice(0, 400)))
  return embedded.length ? embedded : blocks
}

export const plainText = (value: string): string =>
  value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/'''/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // Some articles name the party through a colour template rather than in
    // prose — Canada's is `{{Canadian party colour|CA|Liberal|name}}`, where
    // the party is a positional argument. Stripping the template outright
    // would drop the only name the infobox carries, so keep its longest word.
    .replace(/\{\{[^{}]*\}\}/g, template => {
      const parts = template
        .slice(2, -2)
        .split('|')
        .slice(1)
        .map(part => part.trim())
        .filter(part => part && !/^(name|short|abbrev|colou?r)$/i.test(part) && part.length > 2)
      return parts.sort((a, b) => b.length - a.length)[0] ?? ''
    })
    // A trailing parenthetical is usually a disambiguator — "(Sweden)",
    // "(2020)" — and stripping it is right. But for some rosters it IS the
    // party's identity: Nepal seats three "Communist Party of Nepal (…)"
    // blocs, which collapse into one repeated name without it. So a
    // parenthetical is kept only when it names a FACTION: more than one word,
    // and not a country or a year.
    .replace(/\s*\(([^)]*)\)/g, (_match, inner: string) => {
      const words = inner.trim().split(/\s+/)
      const isFaction = words.length > 1 && !/^\d{4}$/.test(inner.trim())
      return isFaction ? ` (${inner.trim()})` : ''
    })
    .replace(/\s+/g, ' ')
    .trim()
