# Custom Resolvers

## Overview

The `CustomResolver` class provides a flexible system for resolving property conflicts in a distributed system. This document covers the implementation details, including the support for inter-plugin dependencies.

## Current Implementation

### Core Components

1. **ResolverPlugin Interface**
   - Defines the contract for all resolver implementations
   - Key methods:
     - `initialize()`: Creates initial state
     - `update()`: Processes new values with timestamps
     - `resolve()`: Produces final value from accumulated state

2. **CustomResolver Class**
   - Manages resolution of entity properties using configured plugins
   - Implements the core resolution logic:
     - `initializer`: Creates initial state structure
     - `reducer`: Processes deltas and updates state using plugins
     - `resolver`: Produces final resolved values

3. **Built-in Plugins**
   - `LastWriteWinsPlugin`: Keeps the most recent value
   - `FirstWriteWinsPlugin`: Keeps the first value seen
   - `ConcatenationPlugin`: Combines string values with a separator
   - `MajorityVotePlugin`: Selects the most common value
   - `MinPlugin`/`MaxPlugin`: Tracks minimum/maximum numeric values

## Plugin Dependencies

### Overview

The system supports explicit declaration of dependencies between plugins, ensuring they are processed in the correct order. This enables:

1. **Deterministic Execution**: Plugins are processed after their dependencies
2. **Dependency Validation**: Circular dependencies are detected and prevented
3. **Optimized Processing**: Only necessary states are processed in the correct order

### Declaring Dependencies

Each plugin can declare its dependencies using the `dependencies` property:

```typescript
class MyPlugin implements ResolverPlugin {
  name = 'my-plugin';
  
  // List of property IDs this plugin depends on
  dependencies: PropertyID[] = ['other-property'];
  
  // ... rest of the implementation
}
```

### Dependency Resolution

1. **Topological Sorting**: Plugins are processed in an order that respects their dependencies
2. **Cycle Detection**: Circular dependencies are detected during initialization
3. **Lazy Resolution**: Dependencies are only resolved when needed

### Example: Chained Dependencies

```typescript
const resolver = new CustomResolver(losslessView, {
  // This will be processed first (no dependencies)
  basePrice: new LastWriteWinsPlugin(),
  
  // This depends on basePrice
  tax: new TaxCalculatorPlugin(),
  
  // This depends on both basePrice and tax
  total: new TotalCalculatorPlugin()
});
```

### Best Practices

1. **Minimal Dependencies**: Only declare dependencies that are actually needed
2. **Avoid Cycles**: Design your plugins to avoid circular dependencies
3. **Document Dependencies**: Clearly document what each plugin depends on
4. **Test Dependencies**: Include tests that verify the dependency behavior

### Implementation Details

#### ResolverPlugin Interface

The `ResolverPlugin` interface defines the contract that all resolver plugins must implement. It has been updated to support inter-plugin dependencies and state sharing:

```typescript
interface ResolverPlugin<T = unknown> {
  // Unique name of the plugin
  name: string;
  
  // List of property IDs this plugin depends on
  // Plugins will be processed after their dependencies
  dependencies?: PropertyID[];

  // Initialize the state for a property
  initialize(): T;

  // Process a new value for the property
  update(
    currentState: T, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    allStates?: Record<PropertyID, unknown>
  ): T;

  // Resolve the final value from the current state
  // Must return a value of type PropertyTypes or undefined
  // This is the value that will be used as the resolved property value
  resolve(
    state: T,
    allStates?: Record<PropertyID, unknown>
  ): PropertyTypes | undefined;
}
```

#### Important Notes

1. **Return Type of `resolve`**:
   - The `resolve` method must return a value of type `PropertyTypes` or `undefined`
   - This is different from the `update` method which returns the updated state of type `T`
   - The returned value will be used as the resolved property value

2. **Plugin Dependencies**:
   - Dependencies are declared using the `dependencies` property
   - Dependencies should be an array of property IDs that this plugin depends on
   - The resolver ensures that all dependencies are processed before the plugin that depends on them

3. **State Access**:
   - The `allStates` parameter in `update` and `resolve` provides access to the current state of all other properties
   - This allows plugins to make decisions based on the state of other properties
   - The states are keyed by property ID and contain the raw state objects for each plugin

4. **Error Handling**:
   - If a plugin throws an error during initialization, update, or resolve, the error will be logged and the plugin will be skipped
   - It's recommended to handle errors within the plugin methods when possible

#### CustomResolver Class

The `CustomResolver` class has been enhanced to:
1. Collect all plugin states before processing updates
2. Pass the complete state to each plugin during updates and resolution

### Complex Example: Discounted Price with Dependencies

This example demonstrates a more complex scenario with multiple interdependent plugins:

Here's a practical example of a plugin that calculates a discounted price based on another property:

```typescript
class DiscountedPricePlugin implements ResolverPlugin<{ price: number }> {
  name = 'discounted-price';
  
  initialize() {
    return { price: 0 };
  }
  
  update(
    state: { price: number }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _allStates?: Record<PropertyID, unknown>
  ) {
    if (typeof newValue === 'number') {
      return { price: newValue };
    }
    return state;
  }
  
  resolve(
    state: { price: number },
    allStates?: Record<PropertyID, unknown>
  ): number | undefined {
    // Access the discount value from another plugin's state
    const discountState = allStates?.['discount'] as { value: number } | undefined;
    if (discountState) {
      // Apply discount if available
      return state.price * (1 - (discountState.value / 100));
    }
    return state.price;
  }
}

// Usage with a discount plugin
const resolver = new CustomResolver(losslessView, {
  price: new DiscountedPricePlugin(),
  discount: new LastWriteWinsPlugin()
});
```

### Best Practices

1. **Dependency Management**:
   - Clearly document which properties your plugin depends on
   - Handle cases where dependencies might be undefined
   - Consider using TypeScript type guards for safer property access

2. **Performance Considerations**:
   - Access only the states you need in the `allStates` object
   - Consider caching resolved values if the same calculation is performed multiple times

3. **Testing**:
   - Test plugins with and without their dependencies
   - Verify behavior when dependencies are updated in different orders
   - Test edge cases like missing or invalid dependencies

### Built-in Plugins

All built-in plugins have been updated to be compatible with the new interface:

- `LastWriteWinsPlugin`
- `FirstWriteWinsPlugin`
- `ConcatenationPlugin`
- `MajorityVotePlugin`
- `MinPlugin`
- `MaxPlugin`

These plugins maintain backward compatibility while supporting the new functionality.

## Implementation Status

The inter-plugin dependency feature has been implemented and includes:

1. Updated `ResolverPlugin` interface with `allStates` parameter
2. Enhanced `CustomResolver` class for state sharing between plugins
3. Updated all built-in plugins for compatibility
4. Comprehensive test coverage including:
   - Basic functionality of all built-in plugins
   - Inter-plugin dependency scenarios
   - Edge cases and error conditions
5. Complete documentation with examples

## Usage Examples

### Basic Usage

```typescript
const resolver = new CustomResolver(losslessView, {
  title: new LastWriteWinsPlugin(),
  price: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin()
});
```

### With Dependent Plugins

```typescript
const resolver = new CustomResolver(losslessView, {
  basePrice: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  finalPrice: new DiscountedPricePlugin()  // Depends on discount
});
```

### Complex Example

```typescript
const resolver = new CustomResolver(losslessView, {
  // Basic properties
  name: new LastWriteWinsPlugin(),
  description: new ConcatenationPlugin(' '),
  
  // Pricing
  basePrice: new LastWriteWinsPlugin(),
  taxRate: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  
  // Calculated fields
  subtotal: new SubtotalCalculator(),  // Uses basePrice and quantity
  tax: new TaxCalculator(),            // Uses subtotal and taxRate
  total: new TotalCalculator()         // Uses subtotal, tax, and discount
});
```

## Future Enhancements

1. **Plugin Dependencies**: Explicitly declare dependencies between plugins
2. **Caching**: Cache resolved values for better performance
3. **Validation**: Add validation to prevent circular dependencies
4. **Debugging**: Add logging for plugin execution order and state access
5. **Optimization**: Lazy-load plugin states to improve performance with many properties

## Example Configurations

### Basic Usage

```typescript
const resolver = new CustomResolver(losslessView, {
  title: new LastWriteWinsPlugin(),
  price: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin()
});
```

### With Dependent Plugins

```typescript
const resolver = new CustomResolver(losslessView, {
  basePrice: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  finalPrice: new DiscountedPricePlugin()
});
```

## Future Enhancements

1. **Plugin Dependencies**: Explicitly declare dependencies between plugins
2. **Caching**: Cache resolved values for better performance
3. **Validation**: Add validation to prevent circular dependencies
4. **Debugging**: Add logging for plugin execution order and state access
