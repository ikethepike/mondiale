# Component Architecture Refactoring

## Current Issues

### Board Component (`components/Board.vue`)

- Hardcoded values
- Mixed styling concerns
- Duplicate CSS styles
- No TypeScript interfaces
- Hardcoded player progress

### Game Views

- Duplicate logic
- Inconsistent styling
- Mixed responsibilities

## Proposed Solutions

### 1. Board Component Structure

```typescript
// types/board.types.ts
interface BoardConfiguration {
  readonly tileCount: number
  readonly columnsCount: number
  readonly challengeTiles: Set<number>
}

// components/board/config.ts
export const BOARD_CONFIG: BoardConfiguration = {
  tileCount: 100,
  columnsCount: 5,
  challengeTiles: new Set([5, 10, 15 /* ... */]),
}
```

### 2. Component Composition

```vue
<!-- components/board/BoardTile.vue -->
<template>
  <div class="board-tile" :class="tileClasses">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
interface Props {
  position: number
  type: TileType
}
</script>
```

### 3. Styling Architecture

```scss
// styles/components/_board.scss
.board {
  &-tile {
    // Base styles
  }

  &-challenge {
    // Challenge tile styles
  }

  &-player {
    // Player tile styles
  }
}
```

## Implementation Plan

1. Create component interfaces
2. Implement composition system
3. Refactor styling
4. Add proper props
5. Create shared utilities
6. Implement view models

## Testing Strategy

```typescript
describe('Board Component', () => {
  it('should render correctly', () => {
    // Test implementation
  })

  it('should handle player movement', () => {
    // Test implementation
  })
})
```
