# State Management Refactoring

## Current Issues

### Game Store (`store/game.store.ts`)

- Empty actions object needs implementation
- Lack of proper error handling for socket events
- Type safety improvements needed for undefined checks
- Missing validation for state updates

## Proposed Solutions

### 1. State Actions Implementation

```typescript
interface GameActions {
  setGame(game: Game): void
  updatePlayerReady(playerId: string, ready: boolean): void
  clearMapState(): void
  highlightCountry(countryCode: ISOCountryCode): void
  setMapStatus(status: 'correct' | 'incorrect'): void
  setRevealCountry(countryCode: ISOCountryCode): void
}
```

### 2. Error Handling Middleware

```typescript
interface ErrorHandlingMiddleware {
  handle(error: Error): void
  retry<T>(operation: () => Promise<T>, maxRetries: number): Promise<T>
}
```

### 3. Type Safety Improvements

```typescript
interface GameState {
  readonly game: Game | null
  readonly playerId: string | null
  readonly map: GameMap
  readonly socket: Socket | null
  readonly error: string | null
}
```

### 4. State Validation

```typescript
interface StateValidator {
  validate(state: GameState): ValidationResult
  validateTransition(from: GameState, to: GameState): ValidationResult
}
```

## Implementation Plan

1. Create proper state interfaces
2. Implement action creators
3. Add validation middleware
4. Improve error handling
5. Add state persistence
6. Implement optimistic updates

## Testing Strategy

```typescript
describe('GameStore', () => {
  let store: GameStore

  beforeEach(() => {
    store = createGameStore()
  })

  it('should handle state transitions correctly', () => {
    // Test implementation
  })
})
```
