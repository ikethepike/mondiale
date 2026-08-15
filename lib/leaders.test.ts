import { describe, expect, it } from 'vitest'
import { leaderHintFacts, partyLabel, politicalLeader, titlecaseLeader } from './leaders'
import type { ISOCountryCode } from '~~/types/geography.types'

describe('titlecaseLeader', () => {
  it('softens the factbook surname caps', () => {
    expect(titlecaseLeader('Vladimir Vladimirovich PUTIN')).toBe('Vladimir Vladimirovich Putin')
    expect(titlecaseLeader('Giorgia MELONI')).toBe('Giorgia Meloni')
  })

  it('titlecases each hyphen/apostrophe segment', () => {
    expect(titlecaseLeader('Karin KELLER-SUTTER')).toBe('Karin Keller-Sutter')
    expect(titlecaseLeader("Sean O'NEILL")).toBe("Sean O'Neill")
  })

  it('leaves regnal numerals uppercase', () => {
    expect(titlecaseLeader('Leo XIV')).toBe('Leo XIV')
    expect(titlecaseLeader('CHARLES III')).toBe('Charles III')
  })

  it('leaves mixed-case words and particles alone', () => {
    expect(titlecaseLeader('Mohammed bin ZAYID Al Nuhayyan')).toBe('Mohammed bin Zayid Al Nuhayyan')
    expect(titlecaseLeader('Emmanuel Macron')).toBe('Emmanuel Macron')
  })
})

describe('partyLabel', () => {
  // Printing "independent" invites the reader to conclude a leader has no
  // party behind them — false for Zelenskyy, whose Servant of the People
  // holds 254 seats. Saying nothing is the honest answer.
  it("drops Wikidata's partyless stand-in and leaves real parties alone", () => {
    expect(partyLabel('independent politician')).toBeUndefined()
    expect(partyLabel('Labour Party')).toBe('Labour Party')
  })
})

describe('leaderHintFacts', () => {
  it('surfaces party and tenure start, in that order', () => {
    expect(
      leaderHintFacts({ name: 'Anna Example', party: 'Green Party', sinceYear: 2021 }, 'DE')
    ).toEqual(['Green Party', 'in office since 2021'])
  })

  it('skips missing fields and never leaks the office', () => {
    expect(
      leaderHintFacts({ name: 'Anna Example', office: 'President of Examplia' }, 'DE')
    ).toEqual([])
    expect(leaderHintFacts({ name: 'Anna Example', sinceYear: 2019 }, 'DE')).toEqual([
      'in office since 2019',
    ])
  })

  it('drops a party that names its own country', () => {
    expect(
      leaderHintFacts(
        {
          name: 'Bassirou Diomaye Faye',
          party: 'African Patriots of Senegal for Work, Ethics and Fraternity',
          sinceYear: 2024,
        },
        'SN'
      )
    ).toEqual(['in office since 2024'])
    expect(
      leaderHintFacts({ name: 'Paul Biya', party: "Cameroon People's Democratic Movement" }, 'CM')
    ).toEqual([])
    expect(
      leaderHintFacts({ name: 'Patrick Herminie', party: 'United Seychelles Party' }, 'SC')
    ).toEqual([])
  })

  it('drops a party that names its own people — demonyms included', () => {
    expect(
      leaderHintFacts({ name: 'Denis Sassou-Nguesso', party: 'Congolese Party of Labour' }, 'CG')
    ).toEqual([])
    expect(leaderHintFacts({ name: 'Anna Example', party: "Swiss People's Party" }, 'CH')).toEqual(
      []
    )
    expect(
      leaderHintFacts({ name: 'Pedro Sánchez', party: "Spanish Socialist Workers' Party" }, 'ES')
    ).toEqual([])
  })

  it("keeps a party that merely shares its country's region or ideology", () => {
    expect(leaderHintFacts({ name: 'Anna Example', party: 'Renaissance' }, 'FR')).toEqual([
      'Renaissance',
    ])
    expect(leaderHintFacts({ name: 'Anna Example', party: 'Labour Party' }, 'GB')).toEqual([
      'Labour Party',
    ])
  })
})

describe('politicalLeader', () => {
  it('names the office that actually governs, not the grander title', () => {
    // Each of these has a president or monarch AND a prime minister, and the
    // one who governs differs in every case. Before `executivePower` was
    // consulted these were decided by matching the factbook's phrasing and
    // falling back to title regexes, which got all seven wrong.
    const governs: [string, string][] = [
      ['EG', 'Abdel Fattah el-Sisi'], // president governs; Madbouly is his PM
      ['MY', 'Anwar Ibrahim'], // the Agong is ceremonial
      ['PT', 'Luís Montenegro'], // premier-led semi-presidential republic
      ['LI', 'Brigitte Haas'], // the Prince is head of state, not government
      ['SZ', 'Mswati III'], // absolute monarch over a prime minister
      ['TG', 'Faure Essozimna Gnassingbé'], // holds the premiership post-2024
      ['SL', 'Julius Maada Bio'], // executive president; Sengeh is his chief minister
    ]
    for (const [isoCode, name] of governs) {
      expect(politicalLeader(isoCode as ISOCountryCode)?.name, isoCode).toBe(name)
    }
  })

  it('still answers for a collective executive', () => {
    // Switzerland's Federal Council governs as a body, so `executivePower` is
    // `collective` and names nobody. Returning undefined would drop the
    // country from every mode that shows a leader.
    expect(politicalLeader('CH' as ISOCountryCode)).toBeTruthy()
  })

  it('never returns a leader without a portrait when one is required', () => {
    for (const isoCode of ['DE', 'FR', 'BR', 'JP'] as ISOCountryCode[]) {
      const leader = politicalLeader(isoCode, { requireImage: true })
      if (leader) expect(leader.image, isoCode).toBeTruthy()
    }
  })
})
