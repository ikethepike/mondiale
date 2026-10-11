/**
 * Source as the contract scrapes read it: code with every comment blanked, so
 * a commented-out guard never passes for one and prose never trips a rule.
 * Shared by lib/contract-census.test.ts and scripts/contract-audit.ts.
 */

/** What may precede a `/` that opens a regex literal rather than dividing. */
const REGEX_CONTEXT =
  /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(return|typeof|case|do|else|in|of|void|yield|await))\s*$/

/** Script source with every comment blanked — strings, templates and regex
 *  literals kept whole, newlines kept so line-bound scrapes still line up. */
export const stripScriptComments = (source: string): string => {
  let out = ''
  let at = 0
  let depth = 0
  const templates: number[] = []
  const templateBody = () => {
    const start = at
    while (at < source.length && source[at] !== '`') {
      if (source[at] === '\\') at += 2
      else if (source[at] === '$' && source[at + 1] === '{') {
        at += 2
        templates.push(depth)
        out += source.slice(start, at)
        return
      } else at++
    }
    out += source.slice(start, ++at)
  }
  while (at < source.length) {
    const char = source[at]!
    const next = source[at + 1]
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', at)
      at = end === -1 ? source.length : end
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', at + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(at, stop).replace(/[^\n]/g, '')
      at = stop
    } else if (char === '/' && REGEX_CONTEXT.test(out.slice(-40))) {
      const start = at++
      let inClass = false
      while (at < source.length && source[at] !== '\n') {
        if (source[at] === '\\') at++
        else if (source[at] === '[') inClass = true
        else if (source[at] === ']') inClass = false
        else if (source[at] === '/' && !inClass) break
        at++
      }
      out += source.slice(start, ++at)
    } else if (char === "'" || char === '"') {
      const start = at++
      while (at < source.length && source[at] !== char && source[at] !== '\n') {
        at += source[at] === '\\' ? 2 : 1
      }
      out += source.slice(start, ++at)
    } else if (char === '`') {
      out += char
      at++
      templateBody()
    } else if (char === '}' && templates.at(-1) === depth) {
      templates.pop()
      out += char
      at++
      templateBody()
    } else {
      if (char === '{') depth++
      if (char === '}') depth--
      out += char
      at++
    }
  }
  return out
}

/** A `.vue` file's scripts stripped as script, its template losing only `<!-- -->`;
 *  YAML loses its `#` lines; prose (markdown) is all content. */
export const stripComments = (file: string, source: string): string =>
  /\.ya?ml$/.test(file)
    ? source.replace(/^\s*#.*$/gm, '')
    : file.endsWith('.md')
      ? source
      : file.endsWith('.vue')
        ? source
            .replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ''))
            .replace(
              /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g,
              (_, open: string, body: string, close: string) =>
                `${open}${stripScriptComments(body)}${close}`
            )
        : stripScriptComments(source)
