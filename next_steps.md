# Phase 4: Delta Patterns & Query Traversal - Implementation Plan

## Overview

Phase 4 recognizes that in Rhizome, **deltas ARE relationships**. Instead of adding a relationship layer on top of deltas, we're creating tools to work with delta patterns more effectively. This phase focuses on formalizing common delta patterns, building query conveniences for traversing these patterns, and creating specialized resolvers that interpret deltas as familiar relational concepts.

## Core Insights

1. **Deltas are relationships**: Every delta with pointers already expresses relationships
2. **Patterns, not structure**: We're recognizing patterns in how deltas connect entities
3. **Perspective-driven**: Different views/resolvers can interpret the same deltas differently
4. **No single truth**: Competing deltas are resolved by application-level view resolvers
5. **Time-aware**: All queries are inherently temporal, showing different relationships at different times

## Current State ✅

- **All tests passing**: 21/21 suites, 183/183 tests (100%)
- **Delta system**: Fully functional with pointers expressing relationships
- **Negation system**: Can invalidate deltas (and thus relationships)
- **Query system**: Basic traversal of hyperviews
- **Schema system**: Can describe entity structures
- **Resolver system**: Application-level interpretation of deltas

## Implementation Plan

### Step 1: Delta Pattern Recognition

**Goal**: Formalize common patterns of deltas that represent familiar relationships

**Tasks**:
1. Create `src/patterns/delta-patterns.ts`:
   - Define patterns for common relationship types
   - Create pattern matching utilities
   - Document pattern conventions

2. Common patterns to recognize:
   ```typescript
   // One-to-one: A delta pointing from A to B with unique constraint
   const AuthorshipPattern = {
     name: 'authorship',
     match: (delta) => 
       delta.pointers.some(p => p.targetContext === 'author') &&
       delta.pointers.some(p => p.targetContext === 'post'),
     interpret: (delta) => ({
       post: delta.pointers.find(p => p.targetContext === 'post').target,
       author: delta.pointers.find(p => p.targetContext === 'author').target
     })
   };

   // One-to-many: Multiple deltas pointing from many Bs to one A
   const PostsByAuthorPattern = {
     name: 'posts-by-author',
     query: (authorId) => ({
       pointers: { 
         some: { 
           target: authorId, 
           targetContext: 'author' 
         }
       }
     })
   };
   ```

3. Pattern validation:
   - Ensure deltas match expected patterns
   - Provide clear feedback when patterns are violated
   - Allow flexible pattern definitions

### Step 2: Query Pattern Traversal

**Goal**: Make it easy to traverse delta patterns in queries

**Tasks**:
1. Extend `QueryEngine` with pattern-aware methods:
   ```typescript
   // Find all deltas that establish a certain relationship
   queryEngine.findRelationships('authorship', {
     author: 'user-123'
   });

   // Traverse relationships in time
   queryEngine.findRelationships('authorship', {
     author: 'user-123',
     asOf: timestamp // Time-travel query
   });
   ```

2. Create traversal helpers:
   ```typescript
   // Follow a chain of relationships
   queryEngine.traverse({
     start: 'user-123',
     follow: [
       { pattern: 'authorship', direction: 'from' },
       { pattern: 'comments', direction: 'to' }
     ],
     includeNegated: false // Perspective choice
   });
   ```

3. Multi-perspective queries:
   ```typescript
   // Different views of the same deltas
   queryEngine.query('Post', {}, {
     perspectives: {
       published: { includeNegated: false },
       draft: { includeNegated: true },
       historical: { asOf: timestamp }
     }
   });
   ```

### Step 3: Pattern-Aware Resolvers

**Goal**: Create resolvers that interpret delta patterns as familiar concepts

**Tasks**:
1. Create `src/views/resolvers/pattern-resolver.ts`:
   ```typescript
   class PatternResolver {
     // Interpret deltas matching certain patterns
     resolveWithPatterns(entityId, patterns) {
       const deltas = this.hyperview.getDeltasForEntity(entityId);
       
       return {
         entity: entityId,
         relationships: patterns.map(pattern => ({
           type: pattern.name,
           targets: deltas
             .filter(pattern.match)
             .map(pattern.interpret)
         }))
       };
     }
   }
   ```

2. Specialized pattern resolvers:
   - `ReferenceResolver`: Follows pointer patterns
   - `TemporalResolver`: Shows relationships over time
   - `CompetingValueResolver`: Handles multiple values for same relationship

3. Resolver composition:
   ```typescript
   // Stack resolvers for different perspectives
   const publishedView = new ResolverStack([
     new NegationFilter(),
     new TemporalResolver({ until: now }),
     new LastWriteWins()
   ]);
   ```

### Step 4: Delta Pattern Validation

**Goal**: Validate that deltas follow expected patterns (without enforcing)

**Tasks**:
1. Create `src/features/pattern-validation.ts`:
   ```typescript
   // Validate but don't enforce
   validateDeltaPattern(delta, pattern) {
     const result = pattern.validate(delta);
     if (!result.valid) {
       // Emit warning, but still accept delta
       this.emit('pattern-warning', {
         delta,
         pattern: pattern.name,
         issues: result.issues
       });
     }
     return result;
   }
   ```

2. Pattern constraints as guidance:
   - Required pointer contexts
   - Expected value types
   - Cardinality suggestions
   - Temporal constraints

3. Missing information detection:
   ```typescript
   // Detect incomplete patterns
   detectMissingRelationships(entity, expectedPatterns) {
     return expectedPatterns.filter(pattern => 
       !this.hasMatchingDelta(entity, pattern)
     );
   }
   ```

### Step 5: Collection Pattern Helpers

**Goal**: Make collections work naturally with delta patterns

**Tasks**:
1. Extend collections with pattern methods:
   ```typescript
   class PatternAwareCollection extends Collection {
     // Create deltas that match patterns
     relate(from, to, pattern) {
       const delta = pattern.createDelta(from, to);
       return this.rhizomeNode.acceptDelta(delta);
     }

     // Query using patterns
     findRelated(entity, pattern) {
       return this.queryEngine.findRelationships(pattern, {
         [pattern.fromContext]: entity
       });
     }
   }
   ```

2. Pattern-based operations:
   - Batch relationship creation
   - Relationship negation helpers
   - Pattern-based cascades

### Step 6: Temporal Pattern Queries

**Goal**: Leverage time-travel for relationship history

**Tasks**:
1. Time-aware pattern queries:
   ```typescript
   // Show relationship changes over time
   queryEngine.relationshipHistory('authorship', {
     post: 'post-123',
     timeRange: { from: t1, to: t2 }
   });

   // Find when relationships were established/negated
   queryEngine.relationshipTimeline(entityId);
   ```

2. Temporal pattern analysis:
   - Relationship duration
   - Relationship conflicts over time
   - Pattern evolution

## File Structure

**New files to create**:
```
src/
├── patterns/
│   ├── delta-patterns.ts       # Pattern definitions
│   ├── pattern-matcher.ts      # Pattern matching utilities
│   └── pattern-validators.ts   # Pattern validation
├── query/
│   └── pattern-query-engine.ts # Pattern-aware queries
├── views/
│   └── resolvers/
│       ├── pattern-resolver.ts # Pattern interpretation
│       └── temporal-resolver.ts # Time-aware resolution
└── features/
    └── pattern-validation.ts   # Soft validation
```

**Files to modify**:
- `src/query/query-engine.ts` - Add pattern methods
- `src/collections/collection-abstract.ts` - Add pattern helpers
- `src/node.ts` - Wire up pattern features

## Testing Strategy

**New test files**:
- `__tests__/delta-patterns.ts` - Pattern definition and matching
- `__tests__/pattern-queries.ts` - Pattern-based traversal
- `__tests__/pattern-validation.ts` - Soft validation behavior
- `__tests__/temporal-patterns.ts` - Time-travel relationship queries
- `__tests__/competing-relationships.ts` - Multiple relationship handling

**Test scenarios**:
1. Define and match delta patterns
2. Query relationships using patterns
3. Validate deltas against patterns (warnings only)
4. Time-travel through relationship history
5. Handle competing relationship deltas
6. Detect missing relationships
7. Test pattern-based cascading negations

## Success Criteria

- [ ] Delta patterns are well-defined and matchable
- [ ] Queries can traverse relationships via delta patterns
- [ ] Pattern validation provides guidance without enforcement
- [ ] Time-travel queries work with relationships
- [ ] Competing relationships are handled gracefully
- [ ] Missing relationships are detectable
- [ ] Performance scales with pattern complexity
- [ ] Developers find patterns intuitive to use

## Key Principles to Maintain

1. **Deltas are relationships** - Never create a separate relationship system
2. **Patterns are recognition** - We're recognizing what's already there
3. **Perspective matters** - Same deltas, different interpretations
4. **No enforcement** - Validation guides but doesn't restrict
5. **Time is first-class** - All relationships exist in time
6. **Conflicts are natural** - Multiple truths coexist until resolved by views

## Next Session Tasks

1. Define core delta patterns in `delta-patterns.ts`
2. Create pattern matching utilities
3. Extend QueryEngine with pattern-aware methods
4. Write tests for pattern recognition
5. Document the delta-as-relationship philosophy

This approach embraces Rhizome's fundamental architecture where deltas ARE the relationships, making it easier to work with these patterns while respecting the system's perspective-driven, temporal nature.