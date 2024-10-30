# Game Mechanics Refactoring

## Current Issues

### Challenge System (`lib/challenges.ts`)

- Complex challenge configuration
- Mixed concerns in challenge handling
- Limited type safety
- No clear separation between challenge types

## Proposed Solutions

### 1. Challenge Factory Pattern

```typescript
interface ChallengeFactory {
  createGroupChallenge(config: GroupChallengeConfig): GroupChallenge
  createIndividualChallenge(config: IndividualChallengeConfig): IndividualChallenge
  createFinalChallenge(config: FinalChallengeConfig): FinalChallenge
}
```

### 2. Challenge State Machine

```typescript
enum ChallengePhase {
  SETUP = 'setup',
  ACTIVE = 'active',
  SCORING = 'scoring',
  COMPLETE = 'complete',
}

interface ChallengeStateMachine {
  transition(to: ChallengePhase): void
  canTransition(from: ChallengePhase, to: ChallengePhase): boolean
}
```

### 3. Scoring System

```typescript
interface ScoringStrategy {
  calculateScore(submission: ChallengeSubmission): Score
  validateSubmission(submission: ChallengeSubmission): boolean
}
```

## Implementation Plan

1. Implement challenge factories
2. Create state machines
3. Refactor scoring system
4. Add validation
5. Implement progression system
6. Add difficulty scaling

## Testing Strategy

```typescript
describe('ChallengeSystem', () => {
  describe('Challenge Creation', () => {
    it('should create valid challenges', () => {
      // Test implementation
    })
  })

  describe('Scoring', () => {
    it('should calculate scores correctly', () => {
      // Test implementation
    })
  })
})
```
