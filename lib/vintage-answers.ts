/**
 * Vintage's answer key (the dealer and grader over `vintage-years.gen`),
 * loaded everywhere except a production client build. The guard folds to
 * `if (false)` there, so the bundler drops the chunk and no year is ever
 * fetchable from the browser; the dev harness and PR previews still get it.
 */
export const loadVintageAnswers = async () => {
  if (!import.meta.client || import.meta.dev || import.meta.env.HARNESS_ANSWERS)
    return await import('./events/server/vintage-grade')
  return undefined
}
