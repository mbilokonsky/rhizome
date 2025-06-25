# Dependency Resolution

## Overview

The Custom Resolver system includes a robust dependency resolution mechanism that ensures plugins are processed in the correct order based on their dependencies. This document explains how the resolution process works and how to work with complex dependency graphs.

## How Dependency Resolution Works

1. **Graph Construction**: The system builds a directed graph of plugin dependencies during initialization.
2. **Cycle Detection**: The graph is checked for cycles to prevent infinite loops.
3. **Topological Sort**: Plugins are ordered such that all dependencies are processed before the plugins that depend on them.
4. **State Resolution**: During processing, each plugin receives the resolved states of its dependencies.

## Example: Resolving Dependencies

Consider the following plugin configuration:

```typescript
const resolver = new CustomResolver(view, {
  basePrice: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  taxRate: new LastWriteWinsPlugin(),
  tax: new TaxCalculatorPlugin(),      // Depends on basePrice and taxRate
  total: new TotalPricePlugin()        // Depends on basePrice, discount, and tax
});
```

The system will automatically determine the correct processing order:

1. `basePrice`, `discount`, `taxRate` (no dependencies)
2. `tax` (depends on basePrice and taxRate)
3. `total` (depends on basePrice, discount, and tax)

## Handling Circular Dependencies

Circular dependencies are detected during initialization and will result in an error. For example:

```typescript
// This will throw an error during initialization
const resolver = new CustomResolver(view, {
  a: new SomePlugin({ deps: ['b'] }),
  b: new SomePlugin({ deps: ['a'] })  // Circular dependency!
});
```

## Advanced Dependency Patterns

### Optional Dependencies

To make a dependency optional, mark it with a `?` suffix:

```typescript
class MyPlugin extends ResolverPlugin<MyState, 'required' | 'optional?'> {
  readonly dependencies = ['required', 'optional?'] as const;
  
  // ...
}
```

### Dynamic Dependencies

For plugins that need to determine dependencies at runtime, you can implement a custom resolver:

```typescript
class DynamicDepsPlugin extends ResolverPlugin<DynamicState> {
  
  getDependencies(config: any): string[] {
    // Determine dependencies based on config
    return ['always'];
  }
  
  // ...
}
```

## Debugging Dependency Issues

### Common Issues

1. **Missing Dependencies**: Ensure all required dependencies are declared
2. **Type Mismatches**: Verify that dependency types match expected types
3. **Circular Dependencies**: Break circular references in your dependency graph

### Debugging Tools

1. **Dependency Graph**: Use `resolver.getDependencyGraph()` to inspect the dependency graph
2. **Processing Order**: Check `resolver.getProcessingOrder()` to see the resolved execution order
3. **Logging**: Enable debug logging to track dependency resolution

## Performance Considerations

1. **Dependency Depth**: Deep dependency chains can impact performance
2. **Graph Complexity**: Complex graphs take longer to process
3. **Caching**: The system caches resolved dependencies for performance

## Best Practices

1. **Minimize Dependencies**: Only depend on what you need
2. **Keep Graphs Shallow**: Prefer wide, shallow dependency graphs over deep ones
3. **Document Dependencies**: Clearly document all plugin dependencies
4. **Test Edge Cases**: Test with missing or invalid dependencies
5. **Monitor Performance**: Keep an eye on resolution time for large graphs
