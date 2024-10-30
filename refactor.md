# Mondiale Game Refactoring Plan

## Project Overview

Mondiale is a game built to highlight similarities between countries through facts and statistics. The game uses a board-based system with challenges related to various country statistics.

## Core Architecture

### State Management

Location: `store/game.store.ts`
Issues:

- Empty actions object needs implementation
- Lack of proper error handling for socket events
- Type safety improvements needed for undefined checks
- Missing validation for state updates

Recommendations:

- Implement proper actions for state mutations
- Add error handling middleware for socket events
- Strengthen type safety with proper null checks
- Add state validation middleware

### Game Mechanics

#### Game Flow (`types/game.types.ts`)

Issues:

- Complex game state management
- Scattered validation logic
- No clear separation between game phases
- Palette values mixed with game types
- Limited type validation for game configuration

Recommendations:

- Create dedicated GamePhase type and state machine
- Centralize validation in a dedicated service
- Separate color/styling types from game logic
- Implement comprehensive type guards
- Add runtime validation decorators

#### Challenge System

Issues:

- Mixed challenge types (Individual, Group, Final)
- Complex challenge state management
- Scattered challenge validation
- No clear progression system

Recommendations:

- Create unified challenge interface
- Implement challenge factory pattern
- Centralize challenge validation
- Add challenge progression system
- Implement challenge difficulty scaling

### Event System

#### Server Events

Location: `lib/events/server/*.ts`
Issues:

- Inconsistent error handling in handlers
- No retry mechanism for failed operations
- Direct Redis operations in handlers
- Missing event validation
- No event logging system

Recommendations:

- Implement consistent error handling
- Add retry mechanism for critical operations
- Create data access layer
- Add event validation middleware
- Implement comprehensive logging

#### Client Events (`lib/events/client-side.ts`)

Issues:

- Insufficient error handling
- Type safety concerns
- Manual validation of event targets
- Complex accessor pattern validation

Recommendations:

- Implement proper error handling middleware
- Strengthen type definitions
- Create dedicated validation utilities
- Simplify accessor pattern validation

### Component Structure

#### Board Component (`components/Board.vue`)

Issues:

- Hardcoded values (100 tiles, 5 columns)
- Mixed styling concerns
- Duplicate CSS styles
- No TypeScript interfaces for props
- Hardcoded player progress data

Recommendations:

- Extract configuration to constants
- Implement proper component composition
- Separate styling into dedicated files
- Add proper TypeScript interfaces
- Make player progress data dynamic

#### Game Views

Location: `components/view/*`
Issues:

- Duplicate logic across view components
- Inconsistent styling patterns
- Mixed responsibilities in components

Recommendations:

- Create shared view utilities
- Standardize styling approach
- Separate business logic from presentation

### Data Management

#### Game Data Flow

Issues:

- Complex state updates
- No clear data immutability pattern
- Missing optimistic updates
- Inefficient data synchronization

Recommendations:

- Implement immutable state updates
- Add optimistic update handling
- Improve data synchronization
- Add state persistence layer

#### Country Data (`data/countries.gen.ts`)

Issues:

- Generated file structure needs improvement
- Missing type safety in generation
- No validation for country data
- No caching strategy

Recommendations:

- Improve generation structure
- Add type safety to generation
- Implement data validation
- Add efficient caching

## Technical Improvements

### Type System Enhancements

Issues:

- Missing utility types
- Incomplete type guards
- No generic error types
- Limited type inference

Recommendations:

- Add comprehensive utility types
- Implement thorough type guards
- Create error type hierarchy
- Improve type inference

### Performance Optimizations

Issues:

- Large bundle size
- Unoptimized state updates
- No code splitting
- Missing performance monitoring

Recommendations:

- Implement code splitting
- Optimize state updates
- Add lazy loading
- Implement performance monitoring

### Testing Infrastructure

Issues:

- Missing unit tests
- No integration tests
- No E2E testing
- No test utilities

Recommendations:

- Add comprehensive unit tests
- Implement integration tests
- Set up E2E testing
- Create test utilities

## Implementation Priority

1. High Priority

   - Implement proper state management actions
   - Add comprehensive error handling
   - Strengthen type safety
   - Set up testing infrastructure
   - Implement game phase management
   - Add proper event validation

2. Medium Priority

   - Refactor component structure
   - Improve event system
   - Optimize build system
   - Add documentation
   - Implement challenge progression
   - Add performance monitoring

3. Low Priority
   - Optimize performance
   - Add advanced features
   - Improve developer experience
   - Implement additional game variants

## Next Steps

1. Create detailed implementation plans for each area
2. Set up proper testing infrastructure
3. Implement high-priority improvements
4. Review and validate changes
5. Document all improvements

## Migration Strategy

1. Phase 1: Core Infrastructure

   - Set up testing framework
   - Implement proper type system
   - Add state management improvements

2. Phase 2: Game Logic

   - Implement game phase management
   - Refactor challenge system
   - Add proper validation

3. Phase 3: UI/UX

   - Refactor components
   - Implement proper styling
   - Add performance optimizations

4. Phase 4: Quality Assurance
   - Add comprehensive tests
   - Implement monitoring
   - Document changes
