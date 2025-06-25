# Creating Custom Plugins

## Overview

Custom plugins allow you to implement custom resolution logic for your specific use case. This guide walks through creating a new plugin from scratch.

## Basic Plugin Structure

A minimal plugin must implement the `ResolverPlugin` interface:

```typescript
import { ResolverPlugin } from '../resolver';

class MyPlugin implements ResolverPlugin<MyState> {
  
  initialize(): MyState {
    // Return initial state
    return { /* ... */ };
  }
  
  update(
    currentState: MyState,
    newValue: unknown,
    delta: CollapsedDelta,
    dependencies: {}
  ): MyState {
    // Update state based on new value
    return { /* updated state */ };
  }
  
  resolve(state: MyState): unknown {
    // Return the resolved value
    return /* resolved value */;
  }
}
```

## Adding Dependencies

To depend on other properties, specify the dependency types:

```typescript
class DiscountedPricePlugin implements ResolverPlugin<DiscountState, 'basePrice' | 'discount'> {
  readonly dependencies = ['basePrice', 'discount'] as const;
  
  initialize(): DiscountState {
    return { finalPrice: 0 };
  }
  
  update(
    state: DiscountState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: DependencyStates
  ): DiscountState {
    const basePrice = deps.basePrice as number;
    const discount = deps.discount as number;
    return { finalPrice: basePrice * (1 - discount) };
  }
  
  resolve(state: DiscountState): number {
    return state.finalPrice;
  }
}
```

## Best Practices

1. **Immutable State**: Always return new state objects instead of mutating
2. **Pure Functions**: Keep update and resolve methods pure and side-effect free
3. **Error Handling**: Handle unexpected input gracefully
4. **Type Safety**: Use TypeScript types to catch errors early
5. **Documentation**: Document your plugin's behavior and requirements

## Testing Your Plugin

Create tests to verify your plugin's behavior:

```typescript
describe('DiscountedPricePlugin', () => {
  let view: LosslessView;
  let resolver: CustomResolver;
  
  beforeEach(() => {
    view = new LosslessView();
    resolver = new CustomResolver(view, {
      basePrice: new LastWriteWinsPlugin(),
      discount: new LastWriteWinsPlugin(),
      finalPrice: new DiscountedPricePlugin()
    });
  });
  
  test('applies discount to base price', () => {
    // Test your plugin's behavior
  });
});
```

## Advanced Topics

### Handling Complex Dependencies

For plugins with complex dependency requirements, you can use the `dependencies` array to declare all required properties and access them in a type-safe way through the `dependencies` parameter.

### Performance Considerations

- Keep state updates minimal and efficient
- Avoid expensive computations in the update method
- Consider memoization for expensive resolve operations

### Debugging

Add logging to track state changes and resolution:

```typescript
update(currentState: MyState, newValue: unknown): MyState {
  debug('Updating with:', { currentState, newValue });
  // ...
}
```
