import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * The ladder is in em so a reader's larger default text gets the layout for
 * the room it actually has. One px media query (or `$rung + 1`, which adds a
 * whole em to an em token) and that view silently keeps its desk layout while
 * its rem content outgrows the window.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const STYLED = ['components', 'layouts', 'pages', 'assets']

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = `${dir}/${entry.name}`
    if (entry.isDirectory()) return walk(relative)
    return /\.(vue|scss)$/.test(entry.name) ? [relative] : []
  })

const files = STYLED.flatMap(walk).filter(file => !file.startsWith('pages/test'))
const offenders = (pattern: RegExp) =>
  files.filter(file => pattern.test(fs.readFileSync(path.join(ROOT, file), 'utf8')))

describe('breakpoints', () => {
  it('keeps every rung in em', () => {
    const { css } = compileString(
      `@use 'breakpoints' as *;
      a { rungs: $phone $tablet $tablet-wide $laptop $desktop $short $low $tall $wall above($tablet); }
      @media #{$short-landscape}, #{$laptop-window} { b { c: d } }`,
      { loadPaths: [fileURLToPath(new URL('.', import.meta.url))] }
    )
    expect(css).not.toMatch(/\dpx/)
    expect(css).toMatch(/40em/)
  })

  it('never writes a media query in px', () => {
    expect(offenders(/@media[^{]*\d+(\.\d+)?px/)).toEqual([])
  })

  it('steps past a rung through above(), never + 1', () => {
    expect(
      offenders(/\$(phone|tablet|tablet-wide|laptop|desktop|short|low|tall|wall)\s*\+\s*1\b/)
    ).toEqual([])
  })
})
