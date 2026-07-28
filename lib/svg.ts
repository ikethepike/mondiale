/**
 * The one trust boundary for third-party SVG (flags from the dataset,
 * Commons-sourced empire flags): parse, verify the root, strip anything
 * executable. Stricter than v-html; every component that puts foreign SVG
 * markup into the DOM MUST route through here.
 */
export const sanitizeSvg = (
  markup: string,
  options: {
    /** Drop width/height so the art scales to its host ('keep' leaves them). */
    sizing?: 'scale' | 'keep'
    /** preserveAspectRatio to stamp when scaling (contain by default). */
    fit?: 'contain' | 'cover'
    /** Synthesize a viewBox from width/height when the file has none —
     *  stripping dimensions without one crops the art instead of scaling it. */
    synthesizeViewBox?: boolean
  } = {}
): SVGElement | undefined => {
  if (typeof window === 'undefined') return undefined

  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const svg = parsed.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg') return undefined

  svg.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  if (options.synthesizeViewBox && !svg.getAttribute('viewBox')) {
    const width = Number.parseFloat(svg.getAttribute('width') ?? '')
    const height = Number.parseFloat(svg.getAttribute('height') ?? '')
    if (width > 0 && height > 0) svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  if (options.sizing !== 'keep') {
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute(
      'preserveAspectRatio',
      options.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
    )
  }

  return svg as unknown as SVGElement
}
