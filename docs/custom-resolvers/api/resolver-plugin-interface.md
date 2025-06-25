# ResolverPlugin Interface

## Overview

The `ResolverPlugin` interface defines the contract that all resolver plugins must implement. It provides type-safe access to plugin state and dependencies.

## Interface Definition

```typescript
interface ResolverPlugin<T = unknown, D extends string = never> {
  /**
   * Unique identifier for the plugin
   */
  readonly name: string;

  /**
   * Array of property IDs this plugin depends on
   * @default []
   */
  readonly dependencies?: readonly D[];

  /**
   * Initializes the plugin's state
   * @returns Initial state object
   */
  initialize(): T;

  /**
   * Processes a new value and updates the plugin's state
   * @param currentState Current plugin state
   * @param newValue New value to process
   * @param delta Delta information
   * @param dependencies Resolved states of all declared dependencies
   * @returns Updated plugin state
   */
  update(
    currentState: T,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
    dependencies: DependencyStates
  ): T;

  /**
   * Resolves the final value from the current state
   * @param state Current plugin state
   * @param dependencies Resolved states of all declared dependencies
   * @returns Resolved value or undefined if no value should be set
   */
  resolve(
    state: T,
    dependencies: DependencyStates
  ): PropertyTypes | undefined;
}
```

## Type Parameters

| Parameter | Description |
|-----------|-------------|
| `T` | Type of the plugin's internal state |
| `D` | Union type of dependency names (must extend `string`) |

## Methods

### `initialize()`

Initializes the plugin's internal state. Called once when the resolver is created.

**Returns:** `T` - The initial state object

### `update(currentState, newValue, delta, dependencies)`

Processes a new value and updates the plugin's state.

**Parameters:**
- `currentState: T` - Current plugin state
- `newValue: PropertyTypes` - New value to process
- `delta: CollapsedDelta` - Delta information
- `dependencies: DependencyStates` - Resolved states of all declared dependencies

**Returns:** `T` - Updated plugin state

### `resolve(state, dependencies)`

Resolves the final value from the current state.

**Parameters:**
- `state: T` - Current plugin state
- `dependencies: DependencyStates` - Resolved states of all declared dependencies

**Returns:** `PropertyTypes | undefined` - Resolved value or undefined if no value should be set

## Example Implementation

```typescript
class CounterPlugin extends ResolverPlugin<CounterState> {
  
  initialize(): CounterState {
    return { count: 0 };
  }
  
  update(
    state: CounterState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    _deps: {}
  ): CounterState {
    return { count: state.count + 1 };
  }
  
  resolve(state: CounterState): number {
    return state.count;
  }
}
```

## Best Practices

1. **Immutability**: Always return new state objects instead of mutating
2. **Purity**: Keep methods pure and side-effect free
3. **Error Handling**: Handle unexpected input gracefully
4. **Documentation**: Document expected types and behavior

## Common Patterns

### Accessing Dependencies

```typescript
class PriceCalculator extends ResolverPlugin<PriceState, 'basePrice' | 'taxRate'> {
  readonly dependencies = ['basePrice', 'taxRate'] as const;
  
  update(
    _state: PriceState,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: DependencyStates,
  ): PriceState {
    const basePrice = deps.basePrice as number;
    const taxRate = deps.taxRate as number;
    return { total: basePrice * (1 + taxRate) };
  }
  
  // ...
}
```

### Optional Dependencies

```typescript
class OptionalDepPlugin extends ResolverPlugin<State, 'required' | 'optional?'> {
  readonly dependencies = ['required', 'optional?'] as const;
  
  update(
    state: State,
    _newValue: unknown,
    _delta: CollapsedDelta,
    deps: any,
  ): State {
    const required = deps.required as number; // Always present
    const optional = deps['optional?'] as number | undefined; // Might be undefined
    
    // ...
  }
  
  // ...
}
```

## Related

- [Creating Custom Plugins](../plugins/creating-plugins.md)
- [Type-Safe Dependencies](../dependencies/type-safety.md)
- [CustomResolver Class](./custom-resolver-class.md)
