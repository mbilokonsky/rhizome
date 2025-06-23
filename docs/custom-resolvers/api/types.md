# Common Types and Interfaces

This document describes the common types and interfaces used throughout the Custom Resolver system.

## Core Types

### `PropertyID`

```typescript
type PropertyID = string;
```

Unique identifier for a property.

### `PropertyTypes`

```typescript
type PropertyTypes = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | PropertyTypes[] 
  | { [key: string]: PropertyTypes };
```

All possible property value types that can be handled by the resolver.

### `DependencyStates<D>`

```typescript
type DependencyStates<D extends string> = {
  [K in D]: unknown;
};
```

Maps dependency names to their resolved values. The actual type of each value depends on the plugin that produced it.

### `CollapsedDelta`

```typescript
interface CollapsedDelta {
  timestamp: number;
  source?: string;
  // ... other delta metadata
}
```

Represents a collapsed delta with metadata about the change.

## Plugin Types

### `ResolverPlugin<T, D>`

```typescript
interface ResolverPlugin<T = unknown, D extends string = never> {
  readonly name: string;
  readonly dependencies?: readonly D[];
  
  initialize(): T;
  update(
    currentState: T,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
    dependencies: DependencyStates<D>
  ): T;
  
  resolve(
    state: T,
    dependencies: DependencyStates<D>
  ): PropertyTypes | undefined;
}
```

The main plugin interface. See [ResolverPlugin Interface](./resolver-plugin-interface.md) for details.

## Result Types

### `EntityResult`

```typescript
interface EntityResult {
  id: string;
  properties: {
    [propertyId: string]: PropertyTypes;
  };
}
```

Represents the resolved properties for a single entity.

### `CustomResolverResult`

```typescript
interface CustomResolverResult {
  [entityId: string]: EntityResult;
}
```

Maps entity IDs to their resolved properties.

## Configuration Types

### `ResolverConfig`

```typescript
interface ResolverConfig {
  [propertyId: string]: ResolverPlugin<any, string>;
}
```

Configuration object mapping property IDs to their resolver plugins.

## Built-in Plugin Types

### `LastWriteWinsPlugin`

```typescript
class LastWriteWinsPlugin implements ResolverPlugin<LastWriteWinsState> {
  readonly name = 'last-write-wins';
  // ...
}

interface LastWriteWinsState {
  value?: PropertyTypes;
  timestamp: number;
}
```

### `FirstWriteWinsPlugin`

```typescript
class FirstWriteWinsPlugin implements ResolverPlugin<FirstWriteWinsState> {
  readonly name = 'first-write-wins';
  // ...
}

interface FirstWriteWinsState {
  value?: PropertyTypes;
  isSet: boolean;
}
```

### `ConcatenationPlugin`

```typescript
interface ConcatenationOptions {
  separator?: string;
  sort?: boolean;
}

class ConcatenationPlugin implements ResolverPlugin<ConcatenationState> {
  readonly name = 'concatenation';
  
  constructor(private options: ConcatenationOptions = {}) {
    this.options = {
      separator: options.separator || ', ',
      sort: options.sort || false
    };
  }
  // ...
}

interface ConcatenationState {
  values: Set<string>;
  separator: string;
  sort: boolean;
}
```

### `MajorityVotePlugin`

```typescript
interface MajorityVoteOptions {
  minVotes?: number;
}

class MajorityVotePlugin implements ResolverPlugin<MajorityVoteState> {
  readonly name = 'majority-vote';
  
  constructor(private options: MajorityVoteOptions = {}) {
    this.options = {
      minVotes: options.minVotes || 1
    };
  }
  // ...
}

interface MajorityVoteState {
  votes: Map<string, number>;
  minVotes: number;
}
```

## Type Utilities

### `DependencyKeys<T>`

Extracts the dependency keys from a plugin type.

```typescript
type DependencyKeys<T> = 
  T extends ResolverPlugin<any, infer D> ? D : never;
```

### `PluginState<T>`

Extracts the state type from a plugin type.

```typescript
type PluginState<T> = 
  T extends ResolverPlugin<infer S, any> ? S : never;
```

## Example: Working with Types

### Type-Safe Plugin Implementation

```typescript
// Define state and dependency types
interface CounterState {
  count: number;
}

type CounterDeps = 'incrementBy' | 'resetThreshold';

// Implement plugin with type safety
class CounterPlugin implements ResolverPlugin<CounterState, CounterDeps> {
  readonly name = 'counter' as const;
  readonly dependencies = ['incrementBy', 'resetThreshold'] as const;
  
  initialize(): CounterState {
    return { count: 0 };
  }
  
  update(
    state: CounterState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: DependencyStates<CounterDeps>
  ): CounterState {
    const increment = deps.incrementBy as number;
    const threshold = deps.resetThreshold as number;
    
    const newCount = state.count + increment;
    return {
      count: newCount >= threshold ? 0 : newCount
    };
  }
  
  resolve(state: CounterState): number {
    return state.count;
  }
}
```

## Type Assertions

When working with dependency values, you'll often need to use type assertions since they're typed as `unknown`:

```typescript
// Type assertion
const value = deps.someDependency as SomeType;

// Type guard
if (typeof deps.someDependency === 'number') {
  // deps.someDependency is now typed as number
}
```

## Best Practices

1. **Use `as const`** for string literals to get the most specific type
2. **Narrow types** when accessing dependency values
3. **Document expected types** in JSDoc comments
4. **Handle undefined** values when dependencies might be missing
5. **Use type guards** for runtime type safety when needed
