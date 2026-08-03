import { describe, expect, it } from 'vitest'
import { leaderHintFacts, titlecaseLeader } from './leaders'

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
