/**
 * Unmask's dealer and portrait sources, loaded everywhere except a production
 * client build — the same fold as `loadVintageAnswers`, so no face or subject
 * is ever fetchable from the browser.
 */
export const loadUnmaskAnswers = async () => {
  if (!import.meta.client || import.meta.dev || import.meta.env.HARNESS_ANSWERS)
    return await import('./events/server/unmask-deal')
  return undefined
}
