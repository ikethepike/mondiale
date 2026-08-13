import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { ATLAS_TARGET_LINKS, hasAtlasChain } from '~~/lib/atlas-chain'
import { EVENTS } from '~~/data/events.gen'
import { FAR_FLUNG } from '~~/data/far-flung.gen'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { CHRONICLE_TUNING, chronicleSolution, isChronicleOrdered } from '~~/lib/chronicle'
import { mentionsCountry } from '~~/lib/country'
import { scriptoriumAnswers } from '~~/lib/scriptorium'
import { wrongTokenFor } from '~~/lib/use-gate-challenge'
import { readFileSync } from 'node:fs'
import { countryLedBy } from '~~/lib/leaders'
import { governedOutsideFamily, governingParty, partiesOf } from '~~/lib/parties'
import { processReplacements } from '~~/lib/values'
import {
  individualChallengeAccessors,
  individualChallengeVariants,
} from '~~/types/challenges/individual-challenge.type'
import { ORGANIZATION_FACTS, OrganizationVector } from '~~/types/organization.type'

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
})

describe('getIndividualChallenge (gate accessors)', () => {
  it('deals a valid challenge for every gate accessor', async () => {
    for (const accessorId of individualChallengeAccessors) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const dealt = await getIndividualChallenge({
          accessorId,
          difficulty: 'normal',
          variant: 'world',
        })
        expect(dealt._type).toBe('individual-challenge')
        expect(dealt.id).toBe(accessorId)
        expect(dealt.country in COUNTRIES).toBe(true)
        expect(individualChallengeVariants).toContain(dealt.variant)
      }
    }
  })

  it('keeps the find fallback answerable on the themed gates', async () => {
    // The find phrasing quotes the country's leader/currency, so the dealt
    // subject must actually carry one.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    for (let attempt = 0; attempt < 25; attempt++) {
      const leaderGate = await getIndividualChallenge({ accessorId: 'government.leader' })
      expect(COUNTRIES[leaderGate.country].government.leader).toBeTruthy()

      const currencyGate = await getIndividualChallenge({ accessorId: 'currency' })
      expect(COUNTRIES[currencyGate.country].currency).toBeTruthy()
    }
  })

  it('fills the {leader} and {currency} phrasing tokens', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    const leaderGate = await getIndividualChallenge({ accessorId: 'government.leader' })
    const leaderQuestion = processReplacements(
      'Which country is led by {leader}?',
      leaderGate.country
    )
    expect(leaderQuestion).not.toContain('{leader}')
    expect(leaderQuestion.length).toBeGreaterThan('Which country is led by ?'.length)

    const currencyGate = await getIndividualChallenge({ accessorId: 'currency' })
    const currencyQuestion = processReplacements(
      'Which country spends the {currency}?',
      currencyGate.country
    )
    expect(currencyQuestion).not.toContain('{currency}')
    expect(currencyQuestion.length).toBeGreaterThan('Which country spends the ?'.length)
  })
})

describe('dealLeaderPortrait (via forced variant)', () => {
  it('never offers two countries the pictured leader leads', async () => {
    // Shared leaders are real: Charles III reigns over 14 realms and Macron
    // co-rules Andorra — a portrait's decoys must all be led by someone else.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'leader-portrait'
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'government.leader' })
      if (dealt.variant !== 'leader-portrait' || !dealt.options || !dealt.portrait) continue
      const led = dealt.options.filter(isoCode => countryLedBy(isoCode, dealt.portrait!.name))
      expect(led).toEqual([dealt.country])
    }
  })
})

describe('isCorrectIndividualAnswer', () => {
  it('accepts any country spending the shared currency on the find gate', async () => {
    const gate = { id: 'currency', country: 'FI', variant: 'find' } as const
    expect(COUNTRIES.FI.currency).toBe('EUR')
    expect(COUNTRIES.DE.currency).toBe('EUR')
    expect(isCorrectIndividualAnswer(gate, 'DE')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'FI')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'NO')).toBe(false)
  })

  it('accepts a same-currency country on money-match', async () => {
    const gate = { id: 'capital.name', country: 'FR', variant: 'money-match' } as const
    expect(isCorrectIndividualAnswer(gate, 'ES')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'CH')).toBe(false)
  })

  it('stays strict for every non-currency question', async () => {
    // Two euro countries — a shared currency must not leak into e.g. a flag
    // or higher-lower verdict.
    expect(isCorrectIndividualAnswer({ id: 'flag', country: 'FI', variant: 'find' }, 'DE')).toBe(
      false
    )
    expect(
      isCorrectIndividualAnswer({ id: 'currency', country: 'FI', variant: 'higher-lower' }, 'DE')
    ).toBe(false)
    expect(isCorrectIndividualAnswer({ id: 'flag', country: 'FI', variant: 'find' }, 'FI')).toBe(
      true
    )
  })
})

describe('dealLogoPolitics (via forced variant)', () => {
  it('deals every question kind answerably', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'logo-politics'
    const asked = new Set<string>()

    for (let attempt = 0; attempt < 120; attempt++) {
      const dealt = await getIndividualChallenge({
        accessorId: 'government.parties',
        difficulty: 'normal',
      })
      expect(dealt.variant).toBe('logo-politics')
      // The logo IS the question — a deal without one is unanswerable.
      expect(dealt.partyLogo?.image).toBeTruthy()
      // The party must belong to the country it is asked about.
      expect(partiesOf(dealt.country).map(party => party.name)).toContain(dealt.partyLogo!.name)

      // A logo naming its own country answers the question before it is
      // asked — "BÜNDNIS 90/DIE GRÜNEN" is Germany on sight. A quarter of the
      // roster fails this, so the dealer has to filter rather than hope.
      expect(
        mentionsCountry(dealt.partyLogo!.name, dealt.country),
        `${dealt.partyLogo!.name} gives away ${dealt.country}`
      ).toBe(false)

      const ask = dealt.partyLogo!.ask ?? 'origin'
      asked.add(ask)

      if (ask === 'origin') {
        expect(dealt.options).toContain(dealt.country)
        expect(dealt.options?.length).toBe(4)
      }
      if (ask === 'ruling') {
        // The claim has to match the roster, or the yes/no grades a fiction.
        const governing = governingParty(dealt.country)
        expect(dealt.partyLogo!.rules).toBe(governing?.name === dealt.partyLogo!.name)
      }
      if (ask === 'spectrum') {
        // The truth must be among the choices, or the question is unwinnable.
        expect(dealt.partyLogo!.bands).toContain(dealt.partyLogo!.band)
      }
    }

    // All three kinds have to be reachable — a kind that never deals is a
    // dead branch, and one that deals ALWAYS means the others silently broke.
    expect([...asked].sort()).toEqual(['origin', 'ruling', 'spectrum'])
  })
})

describe('dealOddOneOut (via forced variant)', () => {
  it('names a club the way a sentence would, not the way the enum does', async () => {
    // The gate used to read the club's formal name straight off the country's
    // membership entry, with one hardcoded exception for NATO — so it asked
    // about "Organisation for Economic Co-operation and Development" where a
    // person would say "the OECD". ORGANIZATION_FACTS is the one home for that.
    // Alliances are a hard-mode register — the other difficulties ask about
    // region and language only.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'odd-one-out'
    const shorthands = Object.values(ORGANIZATION_FACTS).map(facts => facts.shortName)
    const formal = Object.values(OrganizationVector)

    let sawOrganization = false
    for (let attempt = 0; attempt < 60; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'isoCode', difficulty: 'hard' })
      if (dealt.oddOneOut?.kind !== 'organization') continue
      sawOrganization = true
      const { value, propertyLabel } = dealt.oddOneOut
      expect(shorthands, `dealt "${value}"`).toContain(value)
      expect(propertyLabel).toBe(`Three of these are members of ${value}`)
      // A formal name reaching the prompt is the bug — but some shorthands
      // ARE the formal name ("NATO") or contain it ("the African Union"), so
      // only the ones that genuinely differ can be checked this way.
      for (const name of formal) {
        if (shorthands.some(short => short.includes(name))) continue
        expect(propertyLabel, `formal name leaked: ${name}`).not.toContain(name)
      }
    }
    expect(sawOrganization, 'no organization question was dealt — test is vacuous').toBe(true)
  })

  // Rulers: three countries governed by one political family, one that is not.
  it('asks about governments the lineup can actually be judged on', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'odd-one-out'

    let sawFamily = false
    for (let attempt = 0; attempt < 80; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'isoCode', difficulty: 'normal' })
      const shared = dealt.oddOneOut
      if (shared?.kind !== 'party-family') continue
      sawFamily = true
      const family = shared.value!

      expect(shared.propertyLabel).toBe(
        `Three of these are governed by a party of the ${family} family`
      )

      // The impostor must be a country whose government we can NAME. An
      // unidentifiable government is not an odd one out, it is a missing
      // answer, and a player could never defend picking it.
      expect(governedOutsideFamily(dealt.country, family)).toBe(true)

      // Every other country in the lineup really is of the family — otherwise
      // the question has two right answers.
      for (const isoCode of shared.countries) {
        if (isoCode === dealt.country) continue
        expect(governingParty(isoCode)?.ideologies ?? []).toContain(family)
      }

      expect(shared.countries).toContain(dealt.country)
      expect(shared.countries.length).toBe(4)
    }
    expect(sawFamily, 'no party-family question was dealt — test is vacuous').toBe(true)
  })
})

describe('atlas gate dealing', () => {
  it('deals a solvable chain for every difficulty', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'atlas'
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const dealt = await getIndividualChallenge({ accessorId: 'lexicon', difficulty })
        expect(dealt.variant).toBe('atlas')
        expect(dealt.atlas?.seed).toBe(dealt.country)
        expect(dealt.atlas?.overlaps).toBe(difficulty === 'hard')
        const target = dealt.atlas?.target ?? 0
        expect(target).toBe(ATLAS_TARGET_LINKS[difficulty])
        // The guard's promise: the target is reachable under the plain rule.
        expect(hasAtlasChain(dealt.country, target, [...ISOCountryCodes])).toBe(true)
      }
    }
  })
})

describe('scriptorium gate dealing', () => {
  it('deals a typed set-answer gate whose verdict matches lib/scriptorium', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'scriptorium'
    for (let attempt = 0; attempt < 15; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'lexicon', difficulty: 'normal' })
      expect(dealt.variant).toBe('scriptorium')
      const language = dealt.scriptorium?.language
      expect(language).toBeTruthy()
      // Always typed — an option table of different-script countries would
      // answer itself.
      expect(dealt.options).toBeUndefined()
      const answers = scriptoriumAnswers(language!)
      expect(answers).toContain(dealt.country)
      // Every official speaker wins; the give-up token never does.
      for (const isoCode of answers) {
        expect(isCorrectIndividualAnswer(dealt, isoCode)).toBe(true)
      }
      expect(isCorrectIndividualAnswer(dealt, wrongTokenFor(dealt))).toBe(false)
    }
  })
})

describe('chronicle gate dealing', () => {
  it('deals one country, spaced and gradeable through lib/chronicle', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'chronicle'
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const dealt = await getIndividualChallenge({ accessorId: 'history', difficulty })
        expect(dealt.variant).toBe('chronicle')
        const hand = dealt.chronicle?.events ?? []
        expect(hand.length).toBe(CHRONICLE_TUNING[difficulty].cards)
        for (const slug of hand) expect(EVENTS[slug]?.country).toBe(dealt.country)
        expect(isChronicleOrdered(chronicleSolution(hand))).toBe(true)
      }
    }
  })
})

describe('far-flung gate dealing', () => {
  it('stages a fragment whose owner is the answer', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'far-flung'
    for (const difficulty of ['normal', 'hard'] as const) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const dealt = await getIndividualChallenge({ accessorId: 'isoCode', difficulty })
        expect(dealt.variant).toBe('far-flung')
        const entry = FAR_FLUNG[dealt.farFlung?.slug ?? '']
        expect(entry).toBeTruthy()
        expect(dealt.country).toBe(entry.iso)
        if (difficulty === 'hard') {
          expect(dealt.options).toBeUndefined()
        } else {
          expect(dealt.options).toContain(dealt.country)
          expect(new Set(dealt.options).size).toBe(dealt.options!.length)
        }
        // Strict ISO grading, no carve-out.
        expect(isCorrectIndividualAnswer(dealt, dealt.country)).toBe(true)
        expect(isCorrectIndividualAnswer(dealt, wrongTokenFor(dealt))).toBe(false)
      }
    }
  })

  it('ships visible, blurb-safe fragments', () => {
    for (const [slug, entry] of Object.entries(FAR_FLUNG)) {
      const [, , width, height] = entry.bounds
      expect(Math.hypot(width, height), slug).toBeGreaterThan(1)
      expect(mentionsCountry(entry.blurb, entry.iso), `${slug} blurb names its owner`).toBe(false)
      expect(entry.d.startsWith('M ')).toBe(true)
    }
  })
})

/**
 * A gate that runs out of time still has to submit SOMETHING, and what it
 * submits is a token the grader must reject (`wrongTokenFor`, usually CH).
 * That token is filler, not a choice — a verdict that reads it back tells the
 * player "Sorry, you pressed: Switzerland" about a country they never touched.
 * Isaac hit this on Rulers and it spanned every gate, since the copy is shared.
 */
describe('the timeout verdict', () => {
  const shell = readFileSync(
    new URL('../components/view/ViewIndividualChallenge.vue', import.meta.url),
    'utf8'
  )

  it('answers for every variant before any branch names the pick', () => {
    const guard = shell.indexOf('if (timedOut.value)')
    const firstPickBranch = shell.indexOf('const picked = submittedCountry.value')
    expect(guard, 'the timeout guard is missing').toBeGreaterThan(-1)
    expect(guard).toBeLessThan(firstPickBranch)
  })

  it('keeps every "you pressed" line behind the guard', () => {
    // Rendered copy only — the comment above the guard says the words too.
    const guard = shell.indexOf('if (timedOut.value)')
    const rendered = [...shell.matchAll(/`Sorry, you pressed/g)].map(match => match.index ?? 0)
    expect(rendered.length).toBeGreaterThan(0)
    for (const at of rendered) expect(at).toBeGreaterThan(guard)
  })
})

/**
 * The map's SVG root carries `fill: none` inline, for its coastlines. Anything
 * this file paints INTO that root therefore has to set its own fill inline
 * too — a scoped class rule loses to an inline style, and the glyphs render
 * invisible while the chip behind them still draws. That failure looks like
 * solid black pills on the stage, which is exactly what shipped once.
 */
describe("Rulers' captions", () => {
  const map = readFileSync(new URL('../components/GameMap.vue', import.meta.url), 'utf8')

  it('sets its fills inline, where the root cannot outrank them', () => {
    expect(map).toContain("plate.style.fill = 'var(--dark-blue)'")
    expect(map).toContain("label.style.fill = 'var(--sour-milk)'")
  })

  it('uses palette tokens that exist', () => {
    const palette = readFileSync(
      new URL('../assets/scss/rules/_palette.scss', import.meta.url),
      'utf8'
    )
    // `--off-white` was invented, resolved to nothing, and the text vanished.
    for (const token of ['--dark-blue', '--sour-milk']) {
      expect(palette, `${token} is not a real token`).toContain(`${token}:`)
    }
  })
})
