declare module 'bun:test' {
  export const describe: (name: string, fn: () => void) => void
  export const test: (name: string, fn: () => void | Promise<void>) => void
  export const expect: <T>(actual: T) => {
    toBe: (expected: T) => void
    toEqual: (expected: T) => void
    toBeTruthy: () => void
    toBeFalsy: () => void
    toBeUndefined: () => void
    toBeNull: () => void
    toContain: (expected: any) => void
    toHaveLength: (expected: number) => void
    toThrow: () => void
    toBeInstanceOf: (expected: any) => void
  }
  export const beforeAll: (fn: () => void | Promise<void>) => void
  export const afterAll: (fn: () => void | Promise<void>) => void
  export const beforeEach: (fn: () => void | Promise<void>) => void
  export const afterEach: (fn: () => void | Promise<void>) => void
}
