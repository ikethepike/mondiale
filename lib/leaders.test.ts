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
      leaderHintFacts({ name: 'Anna Example', party: 'Green Party', sinceYear: 2021 })
    ).toEqual(['Green Party', 'in office since 2021'])
  })

  it('skips missing fields and never leaks the office', () => {
    expect(leaderHintFacts({ name: 'Anna Example', office: 'President of Examplia' })).toEqual([])
    expect(leaderHintFacts({ name: 'Anna Example', sinceYear: 2019 })).toEqual([
      'in office since 2019',
    ])
  })
})
