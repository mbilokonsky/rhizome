# Type-Safe Dependencies

## Overview

The Custom Resolver system leverages TypeScript's type system to provide compile-time safety for plugin dependencies. This ensures that:

1. Only declared dependencies can be accessed
2. Dependencies are properly typed
3. Refactoring is safer with compiler support
4. Common errors are caught during development

## How It Works

The `ResolverPlugin` interface uses TypeScript generics to enforce type safety:

```typescript
interface ResolverPlugin<T = unknown, D extends string = never> {
  readonly name: string;
  readonly dependencies?: readonly D[];
  
  // ... methods receive properly typed dependencies
  update(
    currentState: T,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
    dependencies: DependencyStates<D>
  ): T;
}

type DependencyStates<D extends string> = {
  [K in D]: unknown;
};
```

## Declaring Dependencies

Dependencies are declared as a readonly array of string literals:

```typescript
class MyPlugin implements ResolverPlugin<MyState, 'dep1' | 'dep2'> {
  readonly name = 'my-plugin' as const;
  readonly dependencies = ['dep1', 'dep2'] as const;
  
  // ... implementation
}
```

### Type Inference

Using `as const` with the dependencies array ensures TypeScript infers the most specific type possible:

```typescript
// Type is readonly ["dep1", "dep2"]
readonly dependencies = ['dep1', 'dep2'] as const;
```

## Accessing Dependencies

Dependencies are accessed through the `dependencies` parameter in plugin methods:

```typescript
update(
  state: MyState,
  _newValue: unknown,
  _delta: CollapsedDelta,
  deps: DependencyStates<'price' | 'tax'>
): MyState {
  // TypeScript knows price and tax are available
  const price = deps.price as number;
  const tax = deps.tax as number;
  
  // This would be a TypeScript error:
  // const unknown = deps.unknown; // Error: Property 'unknown' does not exist
  
  return { /* ... */ };
}
```

## Type Assertions

Since dependency values are typed as `unknown`, you'll need to use type assertions or type guards:

```typescript
// Using type assertion
const price = deps.price as number;

// Using type guard
if (typeof deps.price === 'number') {
  // deps.price is now typed as number
}
```

## Best Practices

1. **Use `as const`** for dependency arrays to get the most specific type
2. **Narrow types** when accessing dependency values
3. **Document expected types** of dependencies in JSDoc
4. **Handle undefined** values when dependencies might be missing

## Common Patterns

### Optional Dependencies

```typescript
class MyPlugin implements ResolverPlugin<MyState, 'required' | 'optional?'> {
  readonly name = 'my-plugin' as const;
  readonly dependencies = ['required', 'optional?'] as const;
  
  update(_state: MyState, _value: unknown, _delta: CollapsedDelta, deps: any) {
    const required = deps.required as number; // Always present
    const optional = deps['optional?'] as number | undefined; // Might be undefined
    
    // ...
  }
}
```

### Multiple Dependencies with Same Type

```typescript
type PriceDependencies = 'price1' | 'price2' | 'price3';

class PriceAggregator implements ResolverPlugin<PriceState, PriceDependencies> {
  readonly name = 'price-aggregator' as const;
  readonly dependencies: readonly PriceDependencies[] = ['price1', 'price2', 'price3'] as const;
  
  update(_state: PriceState, _value: unknown, _delta: CollapsedDelta, deps: any) {
    const prices = this.dependencies
      .map(dep => deps[dep] as number | undefined)
      .filter((p): p is number => p !== undefined);
    
    // ...
  }
}
```

## Troubleshooting

### Type Errors

- **Missing Dependencies**: Ensure all dependencies are properly declared in the type parameter
- **Incorrect Types**: Verify type assertions match the expected types
- **Readonly Arrays**: Use `readonly` and `as const` for dependency arrays

### Runtime Errors

- **Undefined Dependencies**: Check if a dependency exists before using it
- **Type Mismatches**: Validate types at runtime when necessary
- **Circular Dependencies**: Ensure your dependency graph is acyclic
