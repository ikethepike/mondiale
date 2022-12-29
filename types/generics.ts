export type ExcludesNull = <T>(x: T | null) => x is T
export type ExcludesFalse = <T>(x: T | false) => x is T
export type ExcludesUndefined = <T>(x: T | undefined) => x is T
