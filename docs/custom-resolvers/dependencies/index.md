# Plugin Dependencies

## Overview

The Custom Resolver system provides a powerful dependency management system that allows plugins to depend on the resolved values of other properties. This enables complex resolution strategies where the value of one property can influence how another property is resolved.

## Key Concepts

1. **Dependency Declaration**: Plugins declare their dependencies using the `dependencies` property
2. **Type Safety**: Dependencies are type-checked at compile time
3. **Automatic Resolution**: The system resolves dependencies in the correct order
4. **Cycle Detection**: Circular dependencies are detected and reported

## How It Works

1. **Dependency Graph**: The system builds a directed acyclic graph (DAG) of plugin dependencies
2. **Topological Sort**: Plugins are processed in an order that respects their dependencies
3. **Dependency Injection**: Required dependencies are automatically injected into plugin methods
4. **Lazy Resolution**: Dependencies are only resolved when needed

## Example

```typescript
class TotalPricePlugin extends ResolverPlugin<TotalState> {
  readonly dependencies = ['price', 'tax'] as const;
  
  initialize(): TotalState {
    return { total: 0 };
  }
  
  update(
    state: TotalState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: DependencyStates
  ): TotalState {
    const price = deps.price as number;
    const tax = deps.tax as number;
    return { total: price + tax };
  }
  
  resolve(state: TotalState): number {
    return state.total;
  }
}
```

## Best Practices

1. **Minimal Dependencies**: Only declare dependencies that are actually needed
2. **Acyclic Dependencies**: Keep the dependency graph acyclic
3. **Document Dependencies**: Clearly document what each dependency is used for
4. **Handle Missing Dependencies**: Gracefully handle cases where dependencies might be undefined

## Next Steps

- Learn about [Type-Safe Dependencies](./type-safety.md)
- Understand [Dependency Resolution](./dependency-resolution.md)