# Coding Standards

## TypeScript Guidelines

### Type Safety

```typescript
// ❌ Avoid
function processPlayer(player: any) {
  return player.score
}

// ✅ Do
interface Player {
  id: string
  score: number
  name: string
}

function processPlayer(player: Player): number {
  return player.score
}
```

### Null Handling

```typescript
// ❌ Avoid
function getPlayerName(player: Player | null): string {
  return player?.name || ''
}

// ✅ Do
function getPlayerName(player: Player | null): string {
  if (!player) {
    throw new Error('Player is required')
  }
  return player.name
}
```

### Error Handling

```typescript
// ❌ Avoid
try {
  doSomething()
} catch (e) {
  console.error(e)
}

// ✅ Do
try {
  doSomething()
} catch (error) {
  if (error instanceof GameError) {
    handleGameError(error)
  } else {
    throw error
  }
}
```

## Vue Component Guidelines

### Component Structure

```vue
<!-- ✅ Do -->
<template>
  <div :class="$style.container">
    <slot name="header"></slot>
    <main :class="$style.content">
      <component-name v-for="item in items" :key="item.id" :item="item" @update="handleUpdate" />
    </main>
  </div>
</template>

<script setup lang="ts">
interface Props {
  items: Item[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'update', value: Item): void
}>()
</script>

<style lang="scss" module>
.container {
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
}
</style>
```

### State Management

```typescript
// ❌ Avoid
const state = reactive({
  count: 0,
  items: [],
})

// ✅ Do
interface GameState {
  count: number
  items: GameItem[]
}

const state = reactive<GameState>({
  count: 0,
  items: [],
})
```

## Event Handling

### Socket Events

```typescript
// ❌ Avoid
socket.on('event', data => {
  handleData(data)
})

// ✅ Do
interface GameEvent {
  type: string
  payload: unknown
}

socket.on('event', (event: GameEvent) => {
  if (!isValidGameEvent(event)) {
    throw new InvalidEventError(event)
  }
  handleGameEvent(event)
})
```

## Testing Standards

### Unit Tests

```typescript
// ❌ Avoid
test('it works', () => {
  expect(something()).toBe(true)
})

// ✅ Do
describe('GameComponent', () => {
  describe('when initialized', () => {
    it('should set up initial state correctly', () => {
      const component = mount(GameComponent, {
        props: {
          initialState: mockGameState,
        },
      })

      expect(component.vm.state).toEqual(mockGameState)
    })
  })
})
```

## Documentation

### Function Documentation

```typescript
// ❌ Avoid
function calculateScore(points) {
  return points * 2
}

// ✅ Do
/**
 * Calculates the final score based on points earned
 * @param points - The number of points earned in the challenge
 * @returns The final calculated score
 * @throws {InvalidPointsError} When points is negative
 */
function calculateScore(points: number): number {
  if (points < 0) {
    throw new InvalidPointsError(points)
  }
  return points * 2
}
```

## File Organization

### Directory Structure

```
src/
├── components/
│   ├── base/        # Base components
│   ├── game/        # Game-specific components
│   └── shared/      # Shared components
├── lib/
│   ├── game/        # Game logic
│   ├── events/      # Event handling
│   └── utils/       # Utilities
├── types/
│   ├── game/        # Game-related types
│   └── shared/      # Shared types
└── tests/
    ├── unit/        # Unit tests
    └── integration/ # Integration tests
```

## Best Practices

1. Use TypeScript's strict mode
2. Implement proper error handling
3. Write comprehensive tests
4. Document public APIs
5. Use consistent naming conventions
6. Follow single responsibility principle
7. Implement proper validation
8. Use proper typing

## Code Review Guidelines

1. Check type safety
2. Verify error handling
3. Review test coverage
4. Validate documentation
5. Check performance impact
6. Verify accessibility
7. Review security implications

## Commit Standards

```
feat: Add new feature
fix: Fix bug
refactor: Code refactoring
docs: Update documentation
test: Add tests
chore: Update tooling
```
