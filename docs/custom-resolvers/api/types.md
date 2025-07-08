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

### `DependencyStates`

```typescript
type DependencyStates = {
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

### `ResolverPlugin<T>`

```typescript
interface ResolverPlugin<T = unknown> {
  readonly name: string;
  readonly dependencies?: readonly D[];
  
  initialize(): T;
  update(
    currentState: T,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
    dependencies: DependencyStates
  ): T;
  
  resolve(
    state: T,
    dependencies: DependencyStates
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

A basic map of some results. May represent entites, entity properties, or arbitrary synthetic attributes.

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
  [propertyId: string]: ResolverPlugin<any>;
}
```

Configuration object mapping property IDs to their resolver plugins.

## Built-in Plugin Types

### `LastWriteWinsPlugin`

```typescript
class LastWriteWinsPlugin extends ResolverPlugin<LastWriteWinsState> {
  // ...
}

interface LastWriteWinsState {
  value?: PropertyTypes;
  timestamp: number;
}
```

### `FirstWriteWinsPlugin`

```typescript
class FirstWriteWinsPlugin extends ResolverPlugin<FirstWriteWinsState> {
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

class ConcatenationPlugin extends ResolverPlugin<ConcatenationState> {
  
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

class MajorityVotePlugin extends ResolverPlugin<MajorityVoteState> {
  
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
  T extends ResolverPlugin<any> ? D : never;
```

### `PluginState<T>`

Extracts the state type from a plugin type.

```typescript
type PluginState<T> = 
  T extends ResolverPlugin<infer S> ? S : never;
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
class CounterPlugin extends ResolverPlugin<CounterState> {
  readonly dependencies = ['incrementBy', 'resetThreshold'] as const;
  
  initialize(): CounterState {
    return { count: 0 };
  }
  
  update(
    state: CounterState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: DependencyStates
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
