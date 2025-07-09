# Views and Resolvers

## Core Concepts

### Views

A `View` (previously known as `Lossy`) is a derived, computed representation of your data that provides efficient access to resolved values. It's built on top of the `Hyperview` (previously `Hyperview`) storage layer, which maintains the complete history of all deltas.

```typescript
// Basic View implementation
export abstract class View<Accumulator, Result = Accumulator> {
  // Core methods
  abstract reducer(acc: Accumulator, cur: HyperviewOne): Accumulator;
  resolver?(acc: Accumulator, entityIds: DomainEntityID[]): Result;
  
  // Built-in functionality
  resolve(entityIds?: DomainEntityID[]): Result | undefined;
}
```

### Hyperview

`Hyperview` (previously `Hyperview`) maintains the complete, immutable history of all deltas and provides the foundation for building derived views.

```typescript
// Basic Hyperview usage
const hyperview = new Hyperview(rhizomeNode);
const view = new MyCustomView(hyperview);
const result = view.resolve(['entity1', 'entity2']);
```

## Creating Custom Resolvers

### Basic Resolver Pattern

1. **Define your accumulator type**: This holds the state of your view
2. **Implement the reducer**: Pure function that updates the accumulator
3. **Optionally implement resolver**: Transforms the accumulator into the final result

```typescript
class CountResolver extends View<number> {
  reducer(acc: number, view: HyperviewOne): number {
    return acc + Object.keys(view.propertyDeltas).length;
  }
  
  initializer() { return 0; }
}
```

### Custom Resolver with Dependencies

Resolvers can depend on other resolvers using the `CustomResolver` system:

```typescript
// Define resolver plugins
const resolver = new CustomResolver(hyperview, {
  totalItems: new CountPlugin(),
  average: new AveragePlugin()
});

// Get resolved values
const result = resolver.resolve(['entity1', 'entity2']);
```

## Built-in Resolvers

### Last Write Wins

Keeps the most recent value based on timestamp:

```typescript
const resolver = new CustomResolver(hyperview, {
  status: new LastWriteWinsPlugin()
});
```

### First Write Wins

Keeps the first value that was written:

```typescript
const resolver = new CustomResolver(hyperview, {
  initialStatus: new FirstWriteWinsPlugin()
});
```

### Aggregation Resolvers

Built-in aggregators for common operations:

- `SumPlugin`: Sum of numeric values
- `AveragePlugin`: Average of numeric values
- `CountPlugin`: Count of values
- `MinPlugin`: Minimum value
- `MaxPlugin`: Maximum value

## Advanced Topics

### Performance Considerations

1. **Efficient Reducers**: Keep reducers pure and fast
2. **Selective Updates**: Only process changed entities
3. **Memoization**: Cache expensive computations

### Common Patterns

1. **Derived Properties**: Calculate values based on other properties
2. **State Machines**: Track state transitions over time
3. **Validation**: Enforce data consistency rules

## Best Practices

1. **Keep Reducers Pure**: Avoid side effects in reducers
2. **Use Strong Typing**: Leverage TypeScript for type safety
3. **Handle Edge Cases**: Consider empty states and error conditions
4. **Profile Performance**: Monitor and optimize hot paths

## Examples

### Simple Counter

```typescript
class CounterView extends View<number> {
  reducer(acc: number, view: HyperviewOne): number {
    return acc + view.propertyDeltas['increment']?.length || 0;
  }
  
  initializer() { return 0; }
}
```

### Running Average

```typescript
class RunningAverageView extends View<{sum: number, count: number}, number> {
  reducer(acc: {sum: number, count: number}, view: HyperviewOne): {sum: number, count: number} {
    const value = // extract value from view
    return {
      sum: acc.sum + value,
      count: acc.count + 1
    };
  }
  
  resolver(acc: {sum: number, count: number}): number {
    return acc.count > 0 ? acc.sum / acc.count : 0;
  }
  
  initializer() { return {sum: 0, count: 0}; }
}
```
