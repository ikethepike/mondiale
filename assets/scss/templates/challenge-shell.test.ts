import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * The shell owns the challenge column, and every view's stage is a `> .stage`
 * or `> section` inside it. That reach is the trap: `.challenge-shell >
 * section:not(…)` is worth (0,2,1), more than the `.race-stage[data-v-x]` a
 * Vue-scoped view rule compiles to — so the shell's clip silently outweighed
 * the `overflow-y: auto` four stages declared for themselves, and everything
 * below their fold was unreachable by drag or wheel (a programmatic scrollTop
 * still moved, which is what made it read as a stage that scrolls).
 *
 * Nothing on screen says which rule won, so these pin it: the clip stays
 * beatable, and the header keeps its own height.
 */

const shellPath = fileURLToPath(new URL('./_challenge-shell.scss', import.meta.url))
const css = compile(shellPath, {
  loadPaths: [fileURLToPath(new URL('..', import.meta.url))],
}).css

/** Flat (selector, body) pairs, reaching into `@media` wrappers. */
const rules = (source: string): { selector: string; body: string }[] => {
  const found: { selector: string; body: string }[] = []
  const walk = (text: string) => {
    let head = ''
    for (let index = 0; index < text.length; index++) {
      const character = text[index]
      if (character !== '{') {
        head += character
        continue
      }
      let depth = 1
      let block = ''
      while (++index < text.length && depth > 0) {
        if (text[index] === '{') depth++
        else if (text[index] === '}' && --depth === 0) break
        block += text[index]
      }
      const selector = head.trim()
      head = ''
      // An at-rule wraps more rules; anything else is a declaration block.
      if (selector.startsWith('@')) walk(block)
      else found.push({ selector, body: block })
    }
  }
  walk(source)
  return found
}

/** `:where()` contributes nothing — the point of using it. */
const stripWhere = (selector: string) => {
  let out = ''
  for (let index = 0; index < selector.length; index++) {
    if (!selector.startsWith(':where(', index)) {
      out += selector[index]
      continue
    }
    let depth = 0
    for (index += 6; index < selector.length; index++) {
      if (selector[index] === '(') depth++
      else if (selector[index] === ')' && --depth === 0) break
    }
  }
  return out
}

/** Class-level units and element names — the two columns that decide here. */
const specificity = (selector: string) => {
  const bare = stripWhere(selector)
  return {
    classes: (bare.match(/[.#[]/g) ?? []).length,
    elements: (bare.match(/(^|[\s>+~(])[a-z][a-z0-9-]*/g) ?? []).length,
  }
}

describe('challenge shell', () => {
  // What a view's own `.race-stage { overflow-y: auto }` is worth once Vue
  // scopes it: one class plus one attribute, no element.
  const SCOPED_VIEW_RULE = { classes: 2, elements: 0 }

  it('lets a stage overrule the shell on its own overflow', () => {
    const clips = rules(css).filter(
      rule =>
        /\.challenge-shell\s*>/.test(rule.selector) &&
        /(^|[\s(,])(\.stage|section)/.test(rule.selector) &&
        /\boverflow\b/.test(rule.body)
    )
    expect(clips.length).toBeGreaterThan(0)

    for (const clip of clips) {
      const weight = specificity(clip.selector)
      expect(
        weight.classes < SCOPED_VIEW_RULE.classes ||
          (weight.classes === SCOPED_VIEW_RULE.classes &&
            weight.elements < SCOPED_VIEW_RULE.elements),
        `${clip.selector} outweighs a view's scoped stage rule, so a stage that scrolls its own content is clipped instead`
      ).toBe(true)
    }
  })

  it('holds the header at its own height', () => {
    // `min-height: 0` on every child lets the flex column shrink the header
    // below its content, and a header has no scroller: the overflow — a tall
    // verdict dossier — paints over the stage's first row.
    const header = rules(css).find(rule => /\.challenge-shell\s*>\s*header$/.test(rule.selector))
    expect(header?.body).toMatch(/flex:\s*none/)
  })

  it('keeps every stage clipped by default', () => {
    // The permissive selector is only about who WINS; unclaimed stages must
    // still not grow the document.
    expect(readFileSync(shellPath, 'utf8')).toMatch(/overflow:\s*hidden/)
  })
})
