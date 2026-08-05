/**
 * Emit large generated datasets as `JSON.parse("…")` instead of an object
 * literal. V8 has a fast path for JSON strings and — unlike a literal — keeps
 * no bytecode or constant-pool metadata for the data: importing the same
 * countries dataset measured +14MB RSS as JSON.parse vs +29MB as a literal
 * (issue #110). Every generator writing a dataset over ~100KB should emit
 * through this.
 */
export const jsonParseLiteral = (value: unknown): string =>
  `JSON.parse(${JSON.stringify(JSON.stringify(value))})`
