/**
 * Two Truths' answer key (the deck, its dealer and its verdicts), loaded
 * everywhere except a production client build — the same fold as
 * `loadVintageAnswers`, so no verdict is ever fetchable from the browser.
 */
export const loadTwoTruthsAnswers = async () => {
  if (!import.meta.client || import.meta.dev || import.meta.env.HARNESS_ANSWERS)
    return await import('./events/server/two-truths-deck')
  return undefined
}
