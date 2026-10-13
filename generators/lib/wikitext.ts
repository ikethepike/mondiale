/**
 * The pure wikitext parsers behind the parties generator's logo read, split out
 * so they can be TESTED: nothing here touches the network, the filesystem or
 * the clock. Every wrapper they unpick was found on a real party article.
 */

/** Extensions Commons serves as images — what a `|logo=` value must end in. */
const IMAGE_FILE = /\.(?:svg|png|jpe?g|gif|webp)$/i

/**
 * The image filename in an infobox `|logo=` field, or undefined when the field
 * holds something that is not one.
 *
 * The field is a FILENAME by convention and markup by practice, and every
 * wrapper below was found on a real party article: Britain's Liberal Democrats
 * write `<noinclude>Liberal Democrats logo.svg{{!}}class=skin-invert</noinclude>`,
 * Algeria's RND `File:Democratic National Rally logo.png{{!}}class=skin-invert`,
 * South Africa's DA a plain `File:` prefix, Ethiopia's Prosperity Party a bare
 * name. Reading the raw value found six of those eight; the two that failed
 * did so on the wrapper alone, not on anything about the file.
 *
 * `{{!}}` is an escaped pipe, so everything after it is a rendering argument
 * (`class=skin-invert`, `200px`) rather than part of the name — as is anything
 * after a real pipe inside a `[[File:…|thumb]]` link.
 */
export const logoFileName = (value: string): string | undefined => {
  const file = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-z]+[^>]*>/gi, '')
    .replace(/\{\{\s*!\s*\}\}[\s\S]*$/, '')
    .replace(/\[\[\s*(?:File|Image)\s*:/i, '')
    .replace(/\|[\s\S]*$/, '')
    .replace(/[[\]]/g, '')
    .replace(/^\s*(?:File|Image)\s*:/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return IMAGE_FILE.test(file) ? file : undefined
}

/**
 * The `|logo=` value on the first infobox that carries one.
 *
 * Anchored to a line start so a `logo` appearing inside prose or another
 * field's value cannot be mistaken for the field itself, and tried in the
 * order a party infobox spells it.
 */
export const infoboxLogo = (text: string): string | undefined => {
  for (const field of ['logo', 'logo_image', 'party_logo']) {
    const match = new RegExp(`^\\s*\\|\\s*${field}\\s*=\\s*(.+)$`, 'im').exec(text)
    const file = match?.[1] ? logoFileName(match[1]) : undefined
    if (file) return file
  }
  return undefined
}
