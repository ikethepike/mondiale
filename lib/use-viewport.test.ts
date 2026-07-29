import { describe, expect, it } from 'vitest'
import { keyboardOverlap, listScrollTop } from './use-viewport'

describe('listScrollTop', () => {
  it('scrolls up to an item above the view', () => {
    expect(listScrollTop(100, 200, 40, 30)).toBe(40)
  })

  it('scrolls down just enough for an item below the view', () => {
    expect(listScrollTop(0, 200, 250, 30)).toBe(80)
  })

  it('leaves the scroll alone when the item is already visible', () => {
    expect(listScrollTop(50, 200, 100, 30)).toBe(50)
  })

  it('pins a taller-than-view item to its top edge', () => {
    expect(listScrollTop(0, 100, 150, 300)).toBe(150)
  })
})

describe('keyboardOverlap', () => {
  it('reads the keyboard on iOS Safari, where the layout viewport keeps its height', () => {
    expect(keyboardOverlap(844, 490)).toBe(354)
  })

  it('is unaffected by the caret-chasing pan — offsetTop is not an input', () => {
    // Mid-pan Safari reports the same heights; the old formula subtracted
    // offsetTop (≈ keyboard height) and read ~0 on exactly these frames
    expect(keyboardOverlap(844, 490)).toBe(354)
  })

  it('reads 0 with the keyboard down', () => {
    expect(keyboardOverlap(844, 844)).toBe(0)
  })

  it('reads 0 on Android, where resizes-content shrinks the layout viewport too', () => {
    expect(keyboardOverlap(490, 490)).toBe(0)
  })

  it('does not mistake a pinch-zoomed viewport for a keyboard', () => {
    expect(keyboardOverlap(844, 422, 2)).toBe(0)
  })

  it('rounds sub-pixel viewport heights sanely', () => {
    expect(keyboardOverlap(844, 489.6)).toBe(354)
  })

  it('never goes negative', () => {
    expect(keyboardOverlap(490, 844)).toBe(0)
  })
})
