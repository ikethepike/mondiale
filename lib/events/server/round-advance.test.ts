import { describe, expect, it } from 'vitest'

/**
 * Regression cover for the freeze that stranded room
 * `construction-sitting-talk`. `composition` was dealt by the mix but had no
 * arm in the scoring switch, so it fell to `default:` — which needs a
 * `countriesPerPlayer` ranking it does not have — and threw on EVERY
 * submission. All three seats stayed in `group-challenge` with an empty
 * `groupAnswers`, and no seat was settled enough to arm the advance watchdog.
 *
 * A mode reaching the switch with no arm is unscoreable by construction, so
 * assert the two sets line up rather than waiting for a room to hang.
 */
describe('group-challenge scoring coverage', () => {
  /** Kinds that settle somewhere OTHER than the scoring switch: the ranking
   *  shape the `default:` arm exists for, the engines that score themselves,
   *  and `floor`, which is a mix-tuning constant rather than a round. */
  const SCORED_ELSEWHERE = [
    'ranking',
    'border-chain',
    'atlas',
    'heritage-hunt',
    'timeline',
    'manhunt',
    'unique-or-bust',
    'clean-sweep',
    'government',
    'floor',
  ]

  it('gives every dealable round kind a scoring arm', async () => {
    const [{ ROUND_WEIGHTS }, handler] = await Promise.all([
      import('~~/lib/round-mix'),
      import('node:fs/promises').then(fs =>
        fs.readFile(new URL('./grade-group-answer.ts', import.meta.url), 'utf8')
      ),
    ])
    const arms = new Set([...handler.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]))

    const unscoreable = Object.keys(ROUND_WEIGHTS).filter(
      kind => !arms.has(kind) && !SCORED_ELSEWHERE.includes(kind)
    )
    expect(unscoreable).toEqual([])
  })

  it('keeps the exemption list free of kinds that grew their own arm', async () => {
    const handler = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('./grade-group-answer.ts', import.meta.url), 'utf8')
    )
    const arms = new Set([...handler.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]))
    expect(SCORED_ELSEWHERE.filter(kind => arms.has(kind))).toEqual([])
  })
})

/**
 * Every round family the reveal block arms must be revivable after a
 * restart: an engine armed at the reveal with no rearm entry is a room
 * frozen the first deploy that catches it mid-round. Scraped from source,
 * the same posture as the scoring-arm coverage above.
 */
describe('rearm coverage', () => {
  it('gives every armed round family a rearm entry', async () => {
    const fs = await import('node:fs/promises')
    const [reveal, rearm] = await Promise.all([
      fs.readFile(new URL('./seat-exits.ts', import.meta.url), 'utf8'),
      fs.readFile(new URL('./rearm-round.ts', import.meta.url), 'utf8'),
    ])
    const armed = [...reveal.matchAll(/schedule([A-Z][A-Za-z]+?)(?:Timeout|Settle)\(/g)].map(
      match => match[1]
    )
    const rearms = [...rearm.matchAll(/rearm([A-Z][A-Za-z]+)\(ctx/g)].map(match => match[1])
    expect(armed.length).toBeGreaterThan(0)
    for (const family of new Set(armed)) {
      // The arm name is a fragment of its rearm ('Chain' ⊂ 'BorderChain',
      // 'Unique' ⊂ 'UniqueOrBust') — containment, not equality.
      expect(
        rearms.some(name => name.includes(family)),
        `rearm entry for ${family} (have: ${rearms.join(', ')})`
      ).toBe(true)
    }
  })
})

/**
 * The group submit rides submitOnce (latch + redelivery) — a view that
 * hand-rolls the event skips both, which is how answers got lost and seats
 * stranded before the inversion. Mechanical backstop over the view sources.
 */
describe('view submit discipline', () => {
  it('lets no view send the group submit outside submitOnce', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const viewsDir = fileURLToPath(new URL('../../../components/view/', import.meta.url))
    const entries = await fs.readdir(viewsDir)
    for (const entry of entries.filter(name => name.endsWith('.vue'))) {
      const source = await fs.readFile(path.join(viewsDir, entry), 'utf8')
      expect(
        source.includes(`'submit-group-challenge-answers'`),
        `${entry} must submit via submitOnce`
      ).toBe(false)
    }
  })
})
