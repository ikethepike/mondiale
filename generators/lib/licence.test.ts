import { describe, expect, it } from 'vitest'
import { classifyLicence, PUBLISH_FAIR_USE, type ExtMetadata } from './licence'

/**
 * This rule decides what we PUBLISH on our own domain, so it is pinned without
 * the network. Every licence string below was read off a real file during the
 * party-logo sweep: 41 of 52 seated party logos came back fair-use, 1 came back
 * public domain, and the difference is the whole point of the gate.
 */

const strip = (html: string) => html.replace(/<[^>]*>/g, '').trim()
const shorten = (credit: string) => credit
const meta = (fields: ExtMetadata): ExtMetadata => fields

describe('classifyLicence', () => {
  it('accepts the free licences we may re-host', () => {
    // South Africa's Democratic Alliance mark is "PD" and lives on en.wikipedia
    // rather than Commons — the case that showed a hosting probe refuses free
    // files.
    for (const value of [
      'PD',
      'CC0',
      'Public domain',
      'CC BY 4.0',
      'CC BY-SA 3.0',
      'CC BY-SA 4.0',
      'GFDL',
    ]) {
      expect(classifyLicence(meta({ LicenseShortName: { value } }), strip, shorten).free, value).toBe(
        true
      )
    }
  })

  it('refuses a fair-use file however its licence reads', () => {
    // A fair-use rationale is the uploader's defence, not a licence grant to us.
    const fairUse = classifyLicence(
      meta({ LicenseShortName: { value: 'Fair use' }, NonFree: { value: 'true' } }),
      strip,
      shorten
    )
    expect(fairUse.free).toBe(false)
    expect(fairUse.nonFree).toBe(true)
    // The flag wins even under a free-looking licence string.
    expect(
      classifyLicence(
        meta({ LicenseShortName: { value: 'CC BY 4.0' }, NonFree: { value: 'true' } }),
        strip,
        shorten
      ).free
    ).toBe(false)
  })

  it('refuses NonCommercial and NoDerivatives, which read free but are not', () => {
    // "Attribution-NonCommercial 3.0" starts exactly like a CC BY licence and
    // forbids precisely what a published app does with it.
    for (const value of [
      'CC BY-NC 4.0',
      'CC BY-NC-SA 3.0',
      'CC BY-ND 4.0',
      'Attribution-NonCommercial 3.0',
    ]) {
      expect(classifyLicence(meta({ LicenseShortName: { value } }), strip, shorten).free, value).toBe(
        false
      )
    }
  })

  it('treats an unknown or missing licence as not free', () => {
    // The safe direction: an unrecognised licence costs a logo, where guessing
    // it free would publish a mark we have no right to.
    for (const value of ['All rights reserved', 'Trademarked', 'Copyrighted free use?']) {
      expect(classifyLicence(meta({ LicenseShortName: { value } }), strip, shorten).free, value).toBe(
        false
      )
    }
    expect(classifyLicence(meta({}), strip, shorten).free).toBe(false)
    expect(classifyLicence(undefined, strip, shorten).free).toBe(false)
  })

  it('separates what the licence says from what we choose to publish', () => {
    // `free` is a fact about the file; `publishable` is this app's policy on it.
    // A fair-use party emblem is not freely licensed, and the app ships it
    // anyway — a free educational atlas naming a party by its own mark.
    const fairUse = classifyLicence(
      meta({ LicenseShortName: { value: 'Fair use' }, NonFree: { value: 'true' } }),
      strip,
      shorten
    )
    expect(fairUse.free).toBe(false)
    expect(fairUse.publishable).toBe(PUBLISH_FAIR_USE)

    // A free file is publishable whatever the switch says.
    const pd = classifyLicence(meta({ LicenseShortName: { value: 'PD' } }), strip, shorten)
    expect(pd.free).toBe(true)
    expect(pd.publishable).toBe(true)
  })

  it('never publishes a licence that refuses in its own terms', () => {
    // NonCommercial and NoDerivatives are the rights-holder saying no, which no
    // fair-use argument answers — refused whether or not the switch is on.
    for (const value of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'Attribution-NonCommercial 3.0']) {
      const nc = classifyLicence(
        meta({ LicenseShortName: { value }, NonFree: { value: 'true' } }),
        strip,
        shorten
      )
      expect(nc.free, value).toBe(false)
      expect(nc.publishable, value).toBe(false)
    }
  })

  it('reads bare "Attribution" as the free CC licence it is', () => {
    // Brazil's PSOL mark carries it, and it was being refused as unrecognised.
    const attribution = classifyLicence(
      meta({ LicenseShortName: { value: 'Attribution' } }),
      strip,
      shorten
    )
    expect(attribution.free).toBe(true)
    expect(attribution.publishable).toBe(true)
  })

  it('carries the credit and restrictions rather than judging on them', () => {
    const classified = classifyLicence(
      meta({
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        Artist: { value: '<a href="/wiki/User:X">Jane Doe</a>' },
        Restrictions: { value: 'trademarked' },
      }),
      strip,
      shorten
    )
    // CC BY-SA is free to re-host and REQUIRES naming the author, so the credit
    // is what makes the logo publishable — not a reason to drop it.
    expect(classified.credit).toBe('Jane Doe')
    expect(classified.license).toBe('CC BY-SA 4.0')
    expect(classified.restrictions).toBe('trademarked')
    expect(classified.free).toBe(true)
  })
})
