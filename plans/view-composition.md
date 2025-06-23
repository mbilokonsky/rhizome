# View Composition with Combined State

## Overview

This document outlines the design for composing multiple lossy views using a combined state approach. This pattern allows different resolvers to work on their own parts of the state while sharing the same underlying delta stream.

## Core Concept

The combined state approach involves:
1. Creating a parent resolver that manages multiple child resolvers
2. Each child resolver maintains its own state
3. The parent coordinates the initialization, reduction, and resolution of child states
4. The final result combines the outputs of all child resolvers

## Implementation Pattern

### 1. Base Interfaces

```typescript
interface CombinedState {
  [resolverKey: string]: unknown;
}

interface CombinedResult {
  [resolverKey: string]: unknown;
}

class CombinedResolver<State extends CombinedState, Result extends CombinedResult> 
  extends Lossy<State, Result> {
  
  private resolvers: {
    [key: string]: {
      instance: Lossy<any, any>;
      initializer: (view: LosslessViewOne) => any;
      reducer: (state: any, view: LosslessViewOne) => any;
      resolver: (state: any) => any;
    };
  } = {};
}
```

### 2. Registering Resolvers

```typescript
registerResolver<T, U>(
  key: string, 
  resolver: Lossy<T, U>,
  options?: {
    // Optional: Transform the view before passing to the child resolver
    viewTransformer?: (view: LosslessViewOne) => LosslessViewOne;
    // Optional: Transform the result after resolution
    resultTransformer?: (result: U) => unknown;
  }
) {
  this.resolvers[key] = {
    instance: resolver,
    initializer: (view) => {
      const transformedView = options?.viewTransformer?.(view) ?? view;
      return resolver.initializer(transformedView);
    },
    reducer: (state, view) => {
      const transformedView = options?.viewTransformer?.(view) ?? view;
      return resolver.reducer(state, transformedView);
    },
    resolver: (state) => {
      const result = resolver.resolver(state);
      return options?.resultTransformer?.(result) ?? result;
    }
  };
}
```

### 3. Core Methods

```typescript
initializer(view: LosslessViewOne): State {
  const state = {} as State;
  
  for (const [key, { initializer }] of Object.entries(this.resolvers)) {
    state[key] = initializer(view);
  }
  
  return state;
}

reducer(state: State, view: LosslessViewOne): State {
  const newState = { ...state };
  
  for (const [key, { reducer }] of Object.entries(this.resolvers)) {
    newState[key] = reducer(state[key], view);
  }
  
  return newState;
}

resolver(state: State): Result {
  const result = {} as Result;
  
  for (const [key, { resolver }] of Object.entries(this.resolvers)) {
    result[key] = resolver(state[key]);
  }
  
  return result;
}
```

## Example: Relationship Graph with Multiple Resolvers

```typescript
class RelationshipGraphResolver extends CombinedResolver<
  {
    entities: EntityState;
    relationships: RelationshipState;
    metadata: MetadataState;
  },
  {
    graph: GraphResult;
    stats: StatsResult;
    metadata: MetadataResult;
  }
> {
  constructor(lossless: Lossless) {
    super(lossless);
    
    // Register entity resolver
    this.registerResolver('entities', new EntityResolver(lossless));
    
    // Register relationship resolver
    this.registerResolver(
      'relationships',
      new RelationshipResolver(lossless),
      {
        // Only process relationship deltas
        viewTransformer: view => ({
          ...view,
          propertyDeltas: Object.fromEntries(
            Object.entries(view.propertyDeltas)
              .filter(([key]) => key.startsWith('_rel_'))
          )
        })
      }
    );
    
    // Register metadata resolver
    this.registerResolver('metadata', new MetadataResolver(lossless));
  }
  
  // Override resolver to combine results
  resolver(state: any) {
    const results = super.resolver(state);
    
    return {
      nodes: results.entities,
      edges: results.relationships,
      stats: results.stats,
      metadata: results.metadata
    };
  }
}
```

## Benefits

1. **Separation of Concerns**: Each resolver handles a specific aspect of the data
2. **Reusability**: Resolvers can be reused in different combinations
3. **Maintainability**: Changes to one resolver don't affect others
4. **Testability**: Each resolver can be tested in isolation
5. **Flexibility**: Easy to add, remove, or modify resolvers

## Performance Considerations

1. **Memory Usage**: Combined state increases memory usage
2. **Processing Overhead**: Each delta is processed by all resolvers
3. **Optimization**: Use view transformers to filter deltas early

## Next Steps

1. Implement the base `CombinedResolver` class
2. Refactor `RelationshipGraphResolver` to use this pattern
3. Add tests for the composition behavior
4. Document common patterns and best practices
5. Consider adding middleware support for cross-cutting concerns
