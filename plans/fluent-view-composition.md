# Fluent API for View Composition

## Overview

This document outlines a fluent API for declaring and composing lossy views in a declarative and type-safe manner. The API is designed to make it easy to create complex view compositions with minimal boilerplate.

## Core Concepts

1. **View Composition**: Combining multiple resolvers to create a unified view
2. **Fluent Builder Pattern**: Method chaining for declarative configuration
3. **Type Safety**: Leveraging TypeScript's type system for better developer experience
4. **Extensibility**: Easy to add new composition patterns and resolvers

## API Design

### 1. Base Builder

```typescript
import { Lossless } from '../lossless';

type ViewTransformer = (view: LosslessViewOne) => LosslessViewOne;
type ResultTransformer<T, R> = (result: T) => R;

class ViewCompositionBuilder {
  private resolvers: Array<{
    key: string;
    resolver: Lossy<any, any>;
    viewTransformer?: ViewTransformer;
    resultTransformer?: (result: any) => any;
  }> = [];

  constructor(private readonly lossless: Lossless) {}

  // Start building a new composition
  static create(lossless: Lossless): ViewCompositionBuilder {
    return new ViewCompositionBuilder(lossless);
  }

  // Add a resolver to the composition
  withResolver<T, R>(
    key: string,
    resolver: Lossy<T, R>,
    options: {
      view?: ViewTransformer;
      result?: ResultTransformer<R, any>;
    } = {}
  ): this {
    this.resolvers.push({
      key,
      resolver,
      viewTransformer: options.view,
      resultTransformer: options.result,
    });
    return this;
  }

  // Build the final composition
  build<T extends Record<string, any>>(): Lossy<Record<string, any>, T> {
    // Implementation that creates a combined resolver
    return new CombinedResolver(this.lossless, this.resolvers);
  }
}
```

### 2. Example Usage: Relationship Graph

```typescript
const relationshipGraph = ViewCompositionBuilder
  .create(lossless)
  .withResolver('entities', new EntityResolver(), {
    view: view => ({
      ...view,
      propertyDeltas: Object.fromEntries(
        Object.entries(view.propertyDeltas).filter(([k]) => !k.startsWith('_rel_'))
      )
    })
  })
  .withResolver('relationships', new RelationshipResolver(), {
    view: view => ({
      ...view,
      propertyDeltas: Object.fromEntries(
        Object.entries(view.propertyDeltas).filter(([k]) => k.startsWith('_rel_'))
      )
    })
  })
  .withResolver('stats', new StatsCollector())
  .withResolver('metadata', new MetadataResolver(), {
    result: (metadata) => ({
      ...metadata,
      generatedAt: new Date().toISOString()
    })
  })
  .build<{
    entities: EntityMap;
    relationships: RelationshipMap;
    stats: Stats;
    metadata: Metadata;
  }>();
```

### 3. Advanced Composition

```typescript
// Nested composition
const userProfile = ViewCompositionBuilder
  .create(lossless)
  .withResolver('basicInfo', new BasicInfoResolver())
  .withResolver('activity', ViewCompositionBuilder
    .create(lossless)
    .withResolver('recentPosts', new RecentPostsResolver())
    .withResolver('notifications', new NotificationsResolver())
    .build()
  )
  .withResolver('recommendations', new RecommendationsResolver())
  .build<{
    basicInfo: UserBasicInfo;
    activity: {
      recentPosts: Post[];
      notifications: Notification[];
    };
    recommendations: Recommendation[];
  }>();
```

## Implementation Details

### CombinedResolver Implementation

```typescript
class CombinedResolver<State extends Record<string, any>, Result> 
  extends Lossy<State, Result> {
  
  constructor(
    private readonly lossless: Lossless,
    private readonly resolvers: Array<{
      key: string;
      resolver: Lossy<any, any>;
      viewTransformer?: ViewTransformer;
      resultTransformer?: (result: any) => any;
    }>
  ) {
    super(lossless);
  }

  initializer(view: LosslessViewOne): State {
    return this.resolvers.reduce((state, { key, resolver, viewTransformer }) => {
      const transformedView = viewTransformer ? viewTransformer(view) : view;
      return {
        ...state,
        [key]: resolver.initializer(transformedView)
      };
    }, {} as State);
  }

  reducer(state: State, view: LosslessViewOne): State {
    return this.resolvers.reduce((newState, { key, resolver, viewTransformer }) => {
      const transformedView = viewTransformer ? viewTransformer(view) : view;
      return {
        ...newState,
        [key]: resolver.reducer(state[key], transformedView)
      };
    }, { ...state });
  }

  resolver(state: State): Result {
    return this.resolvers.reduce((result, { key, resolver, resultTransformer }) => {
      const resolved = resolver.resolver(state[key]);
      return {
        ...result,
        [key]: resultTransformer ? resultTransformer(resolved) : resolved
      };
    }, {} as Result);
  }
}
```

## Benefits

1. **Readability**: Clear, declarative syntax
2. **Type Safety**: Full TypeScript support with proper type inference
3. **Composability**: Easy to combine and nest resolvers
4. **Maintainability**: Isolated concerns and transformations
5. **Flexibility**: Custom view and result transformations

## Next Steps

1. Implement the base `ViewCompositionBuilder` and `CombinedResolver`
2. Add support for common patterns (filtering, mapping, etc.)
3. Create documentation with examples
4. Refactor existing resolvers to use the new composition API
5. Add performance optimizations (memoization, lazy evaluation)
