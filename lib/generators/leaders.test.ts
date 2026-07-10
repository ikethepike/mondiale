import { describe, expect, it } from 'vitest'
import {
  officeNames,
  politicalLeaderOf,
  preferWikidata,
  wikidataRoleFor,
  type CiaLeader,
} from './leaders'

/** Real rows from the CIA's world-leaders payload. */
const rows = (...pairs: [string, string][]): CiaLeader[] =>
  pairs.map(([title, name]) => ({ title, name }))

const leaderName = (isoCode: string, leaders: CiaLeader[]) =>
  politicalLeaderOf(isoCode, leaders)?.name

describe('officeNames', () => {
  it('splits conjoined offices on & and ;', () => {
    expect(officeNames('King & Prime Min.')).toContain('prime min.')
    expect(officeNames('Prime Min.;  Min. for Infrastructure')).toContain('prime min.')
  })

  it('never splits a scoped office on its comma', () => {
    // "Premier, Cabinet" is North Korea's cabinet premier, not the premier.
    expect(officeNames('Premier, Cabinet')).not.toContain('premier')
    expect(officeNames('Pres., Central Bank')).not.toContain('pres.')
  })

  it('keeps the pre-comma head when a national scope follows', () => {
    expect(officeNames('Pres., Swiss Confederation')).toContain('pres.')
    expect(officeNames('Supreme Pontiff, Roman Catholic Church')).toContain('supreme pontiff')
  })

  it('keeps the pre-comma head when more offices follow', () => {
    const names = officeNames('President of the Republic, Head of Government, Head of State')
    expect(names).toContain('president of the republic')
  })

  it('strips a leading qualifier', () => {
    expect(officeNames('Acting Pres.')).toContain('pres.')
    expect(officeNames('Transition Pres.')).toContain('pres.')
  })
})

describe('politicalLeaderOf — title matching', () => {
  it('matches titles exactly, never by prefix', () => {
    // Armenia's payload leads with a chief of staff; Azerbaijan with a rep.
    expect(
      leaderName('AM', rows(["Prime Minister's Chief of Staff", 'Arayik Harutyunyan'], ['Prime Min.', 'Nikol Pashinyan']))
    ).toBe('Nikol Pashinyan')
    expect(
      leaderName('AZ', rows(["President's Representative", 'Mukhtar Babayev'], ['Pres.', 'Ilham Aliyev']))
    ).toBe('Ilham Aliyev')
  })

  it('strips parentheticals from the name', () => {
    expect(
      leaderName('AF', rows(['Overall Taliban Leader', 'HAYBATULLAH Akhundzada (Acting)']))
    ).toBe('HAYBATULLAH Akhundzada')
  })
})

describe('politicalLeaderOf — de facto executive outranks the ceremonial office', () => {
  it('picks Kim Jong Un over the SAC premier', () => {
    const kp = rows(
      ['President, State Affairs Commission (SAC)', 'KIM Jong Un'],
      ['Premier, Cabinet', 'KIM Tok Hun']
    )
    expect(leaderName('KP', kp)).toBe('KIM Jong Un')
  })

  it('picks the Supreme Leader over the president', () => {
    const ir = rows(['Supreme Leader', 'Ali Hoseini-KHAMENEI'], ['Pres.', 'Masud PEZESHKIAN'])
    expect(leaderName('IR', ir)).toBe('Ali Hoseini-KHAMENEI')
  })
})

describe('politicalLeaderOf — role selection', () => {
  const withBoth = (president: string, primeMinister: string) =>
    rows(['Pres.', president], ['Prime Min.', primeMinister])

  it('picks the president in president-led states', () => {
    expect(leaderName('RU', withBoth('Vladimir PUTIN', 'Mikhail MISHUSTIN'))).toBe('Vladimir PUTIN')
    expect(leaderName('UA', withBoth('Volodymyr ZELENSKYY', 'Yuliya SVYRYDENKO'))).toBe('Volodymyr ZELENSKYY')
    expect(leaderName('FR', withBoth('Emmanuel MACRON', 'Sebastian LECORNU'))).toBe('Emmanuel MACRON')
    expect(leaderName('EG', withBoth('Abdelfattah ELSISI', 'Mostafa MADBOULY'))).toBe('Abdelfattah ELSISI')
    expect(leaderName('BY', withBoth('Alyaksandr LUKASHENKA', 'Alyaksandr TURCHYN'))).toBe('Alyaksandr LUKASHENKA')
    // The prime ministership changed twice in a year; the president leads regardless.
    expect(leaderName('KR', withBoth('LEE Jae Myung', 'KIM Min-seok'))).toBe('LEE Jae Myung')
  })

  it('picks the prime minister in parliamentary states', () => {
    expect(leaderName('SI', withBoth('Natasa PIRC MUSAR', 'Janez Jansa'))).toBe('Janez Jansa')
    expect(leaderName('FI', withBoth('Alexander STUBB', 'Petteri ORPO'))).toBe('Petteri ORPO')
    expect(leaderName('GR', withBoth('Konstantinos TASOULAS', 'Kyriakos MITSOTAKIS'))).toBe('Kyriakos MITSOTAKIS')
  })

  it('picks the prime minister when the head of state is a monarch or governor-general', () => {
    expect(leaderName('BE', rows(['King', 'PHILIPPE'], ['Prime Min.', 'Bart DE WEVER']))).toBe('Bart DE WEVER')
    expect(leaderName('CA', rows(['Governor Gen.', 'Mary SIMON'], ['Prime Min.', 'Mark CARNEY']))).toBe('Mark CARNEY')
    expect(leaderName('JP', rows(['Emperor', 'NARUHITO'], ['Prime Min.', 'TAKAICHI Sanae']))).toBe('TAKAICHI Sanae')
  })

  it('treats the three corrected countries as parliamentary', () => {
    // Their presidents are ceremonial; the previous allowlist had them wrong.
    expect(leaderName('CV', withBoth('Jose Maria Pereira NEVES', 'Francisco CARVALHO'))).toBe('Francisco CARVALHO')
    expect(leaderName('SK', withBoth('Peter PELLEGRINI', 'Robert FICO'))).toBe('Robert FICO')
    expect(leaderName('XK', withBoth('Vjosa OSMANI-Sadriu', 'Albin KURTI'))).toBe('Albin KURTI')
  })

  it('reads a head-of-government title however the CIA styles it', () => {
    // Found by the drift warning: each of these resolved to a ceremonial head
    // of state because the title did not match exactly.
    expect(leaderName('ES', rows(['King', 'FELIPE VI'], ['Pres. of the Govt.', 'Pedro SANCHEZ']))).toBe('Pedro SANCHEZ')
    expect(leaderName('GB', rows(['King', 'CHARLES III'], ['Prime Minister, First Lord of the Treasury', 'Keir STARMER']))).toBe('Keir STARMER')
    expect(leaderName('IE', rows(['Pres.', 'Catherine CONNOLLY'], ['Taoiseach (Prime Min.)', 'Micheal MARTIN']))).toBe('Micheal MARTIN')
    expect(leaderName('DM', rows(['Pres.', 'Sylvanie BURTON'], ['Prime Min. and Min. for Investment & Governance', 'Roosevelt SKERRIT']))).toBe('Roosevelt SKERRIT')
    expect(leaderName('KN', rows(['Governor Gen.', 'Marcella A. LIBURD'], ['Prime Minister and Minister of Finance, National Security', 'Terrance DREW']))).toBe('Terrance DREW')
  })

  it('never mistakes a subordinate office for the real one', () => {
    const decoys: [string, string][] = [
      ['First Dep. Prime Min.', 'A'],
      ["Min. in the Prime Minister's Office", 'B'],
      ["Prime Minister's Chief of Staff", 'C'],
      ['Chancellor of the Exchequer', 'D'],
      ['Second Dep. Prime Min.', 'E'],
    ]
    for (const decoy of decoys) {
      // The president must survive every one of these.
      expect(leaderName('RU', rows(['Pres.', 'Vladimir PUTIN'], decoy))).toBe('Vladimir PUTIN')
    }
  })

  it('keeps semi-presidential but PM-led states on the prime minister', () => {
    expect(leaderName('AT', withBoth('Alexander VAN DER BELLEN', 'Christian STOCKER'))).toBe('Christian STOCKER')
    expect(leaderName('RO', withBoth('Nicusor DAN', 'Ilie BOLOJAN'))).toBe('Ilie BOLOJAN')
    expect(leaderName('TL', withBoth('Jose RAMOS-HORTA', 'Xanana GUSMAO'))).toBe('Xanana GUSMAO')
    expect(leaderName('MN', withBoth('Ukhnaa KHURELSUKH', 'Nyam-Osor UCHRAL'))).toBe('Nyam-Osor UCHRAL')
  })
})

describe('politicalLeaderOf — collective bodies', () => {
  it('returns undefined when no single person holds the office', () => {
    expect(politicalLeaderOf('SM', rows(['Captain Regent (Co-Head of State)', 'Alessandro CARDELLI']))).toBeUndefined()
    expect(politicalLeaderOf('BA', rows(['Presidency Member (Bosniak)', 'Denis BECIROVIC']))).toBeUndefined()
  })

  it('returns undefined when there is no recognisable office at all', () => {
    expect(politicalLeaderOf('ZZ', rows(['Min. of Agriculture', 'Someone']))).toBeUndefined()
  })

  it('ignores a vacant office, which the CIA lists with an empty name', () => {
    // Sudan's prime ministership. Without this guard the leader is "".
    const sd = rows(['Chmn., Sovereignty Council (SC)', 'Abd-al-Fattah al-BURHAN'], ['Prime Min.', ''])
    expect(politicalLeaderOf('SD', sd)).toBeUndefined()
  })

  it('never elects the head of a subsidiary body', () => {
    // Haiti's presidency is vacant; the CIA lists an electoral commissioner.
    const ht = rows(
      ['Prime Min.', 'Alix Didier FILS-AIME'],
      ['President, Provisional Electoral Commission', 'Jacques DESROSIERS']
    )
    expect(leaderName('HT', ht)).toBe('Alix Didier FILS-AIME')

    // Kyrgyzstan's cabinet chairman must not outrank the president.
    const kg = rows(['Pres.', 'Sadyr JAPAROV'], ['Chairman, Cabinet of Ministers', 'Adylbek KASYMALIYEV'])
    expect(leaderName('KG', kg)).toBe('Sadyr JAPAROV')
  })
})

describe('wikidataRoleFor', () => {
  it('mirrors the role politicalLeaderOf chose', () => {
    const withBoth = rows(['Pres.', 'A'], ['Prime Min.', 'B'])
    expect(wikidataRoleFor('KR', withBoth)).toBe('headOfState')
    expect(wikidataRoleFor('SI', withBoth)).toBe('headOfGovernment')
    expect(wikidataRoleFor('CV', withBoth)).toBe('headOfGovernment')
    expect(wikidataRoleFor('JP', rows(['Emperor', 'NARUHITO'], ['Prime Min.', 'B']))).toBe('headOfGovernment')
  })
})

describe('preferWikidata', () => {
  it('overrides when the CIA page predates the term', () => {
    expect(preferWikidata('2024-04-02', { name: 'Tarique Rahman', sinceDate: '2026-02-16' })).toBe(true)
    expect(preferWikidata('2024-10-10', { name: 'Mojtaba Khamenei', sinceDate: '2026-03-09' })).toBe(true)
    expect(preferWikidata('2022-09-21', { name: 'Francisco Carvalho', sinceDate: '2026-06-19' })).toBe(true)
  })

  it('needs a full date, not a year — Japan is the guard', () => {
    // Page 2025-05-23, term began 2025-10-21: same year, opposite verdict.
    expect(preferWikidata('2025-05-23', { name: 'Sanae Takaichi', sinceDate: '2025-10-21' })).toBe(true)
    expect(preferWikidata('2025-05-23', { name: 'Sanae Takaichi', sinceDate: undefined })).toBe(false)
  })

  it('does not reject a record for a weak office label', () => {
    // Takaichi's Wikidata office reads "party leader". Rejecting on that
    // would fall through to Japan's head of state — the Emperor.
    const takaichi = { name: 'Sanae Takaichi', description: 'Japanese politician', sinceDate: '2025-10-21' }
    expect(preferWikidata('2025-05-23', takaichi)).toBe(true)
  })

  it('rejects a record that admits it is stale', () => {
    const paetongtarn = {
      name: 'Paetongtarn Shinawatra',
      description: 'Businesswoman and former Prime Minister of Thailand',
      sinceDate: '2023-08-22',
    }
    expect(preferWikidata('2026-04-07', paetongtarn)).toBe(false)
  })

  it('rejects a collective body', () => {
    const federalCouncil = { name: 'Swiss Federal Council', sinceDate: '2026-01-01' }
    expect(preferWikidata('2025-04-30', federalCouncil)).toBe(false)
  })

  it('keeps the CIA when its page is newer than the term', () => {
    expect(preferWikidata('2026-04-07', { name: 'Paetongtarn', sinceDate: '2023-08-22' })).toBe(false)
    expect(preferWikidata('2025-09-25', { name: 'Pravind Jugnauth', sinceDate: '2017-01-23' })).toBe(false)
  })

  it('keeps the CIA when either side is missing data', () => {
    expect(preferWikidata(undefined, { name: 'X', sinceDate: '2026-01-01' })).toBe(false)
    expect(preferWikidata('2020-01-01', undefined)).toBe(false)
  })
})
