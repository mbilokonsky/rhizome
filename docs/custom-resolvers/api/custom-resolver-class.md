# CustomResolver Class

## Overview

The `CustomResolver` class is the main entry point for the Custom Resolver system. It manages the resolution of entity properties using the configured plugins and handles dependency resolution between them.

## Class Definition

```typescript
class CustomResolver {
  /**
   * Creates a new CustomResolver instance
   * @param view The lossless view to resolve
   * @param config Plugin configuration
   */
  constructor(
    private readonly view: LosslessView,
    private readonly config: ResolverConfig
  );

  /**
   * Processes all entities in the view and returns the resolved values
   */
  resolve(): CustomResolverResult;

  /**
   * Processes a single entity and returns its resolved values
   * @param entityId ID of the entity to resolve
   */
  resolveEntity(entityId: string): EntityResult | undefined;

  /**
   * Gets the current processing order of properties
   */
  getProcessingOrder(): string[];

  /**
   * Gets the dependency graph
   */
  getDependencyGraph(): Map<string, Set<string>>;
}
```

## Constructor

### `new CustomResolver(view, config)`

Creates a new instance of the CustomResolver.

**Parameters:**
- `view: LosslessView` - The lossless view containing the data to resolve
- `config: ResolverConfig` - Configuration object mapping property IDs to their resolver plugins

**Example:**
```typescript
const resolver = new CustomResolver(view, {
  price: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  total: new TotalPricePlugin()
});
```

## Methods

### `resolve(): CustomResolverResult`

Processes all entities in the view and returns the resolved values.

**Returns:** `CustomResolverResult` - Object mapping entity IDs to their resolved properties

**Example:**
```typescript
const results = resolver.resolve();
debug(results);
// {
//   'entity1': {
//     id: 'entity1',
//     properties: { price: 100, discount: 10, total: 90 }
//   },
//   // ...
// }
```

### `resolveEntity(entityId: string): EntityResult | undefined`

Processes a single entity and returns its resolved values.

**Parameters:**
- `entityId: string` - ID of the entity to resolve

**Returns:** `EntityResult | undefined` - Resolved entity or undefined if not found

**Example:**
```typescript
const result = resolver.resolveEntity('order-123');
if (result) {
  debug(`Order total: ${result.properties.total}`);
}
```

### `getProcessingOrder(): string[]`

Gets the current processing order of properties based on their dependencies.

**Returns:** `string[]` - Array of property IDs in processing order

**Example:**
```typescript
const order = resolver.getProcessingOrder();
debug('Processing order:', order);
// ['price', 'discount', 'total']
```

### `getDependencyGraph(): Map<string, Set<string>>`

Gets the dependency graph used for resolution.

**Returns:** `Map<string, Set<string>>` - Map where keys are property IDs and values are sets of their dependencies

**Example:**
```typescript
const graph = resolver.getDependencyGraph();
for (const [prop, deps] of graph.entries()) {
  debug(`${prop} depends on:`, [...deps]);
}
```

## Configuration

The resolver is configured with an object mapping property IDs to their resolver plugins:

```typescript
interface ResolverConfig {
  [propertyId: string]: ResolverPlugin<any, string>;
}
```

## Error Handling

The resolver may throw the following errors:

- `Error` - For invalid configurations or dependency cycles
- `TypeError` - For type mismatches or invalid plugin implementations

## Example: Complete Usage

```typescript
import { CustomResolver, LastWriteWinsPlugin } from './resolver';
import { LosslessView } from '../lossless-view';

// Create a lossless view with some data
const view = new LosslessView();
// ... add data to the view ...

// Configure the resolver
const resolver = new CustomResolver(view, {
  // Simple plugins
  productId: new LastWriteWinsPlugin(),
  quantity: new LastWriteWinsPlugin(),
  
  // Plugin with dependencies
  unitPrice: new LastWriteWinsPlugin(),
  discount: new LastWriteWinsPlugin(),
  taxRate: new LastWriteWinsPlugin(),
  
  // Complex plugin with multiple dependencies
  subtotal: new class extends ResolverPlugin<SubtotalState, 'unitPrice' | 'quantity'> {
    readonly dependencies = ['unitPrice', 'quantity'] as const;
    
    initialize() { return { value: 0 }; }
    
    update(_state, _value, _delta, deps) {
      const unitPrice = deps.unitPrice as number;
      const quantity = deps.quantity as number;
      return { value: unitPrice * quantity };
    }
    
    resolve(state) { return state.value; }
  }(),
  
  // More plugins...
});

// Resolve all entities
const results = resolver.resolve();
debug(results);

// Or resolve a single entity
const order = resolver.resolveEntity('order-123');
debug(order);
```

## Best Practices

1. **Reuse Instances**: Create a single resolver instance and reuse it
2. **Minimize Dependencies**: Keep the dependency graph simple and acyclic
3. **Error Handling**: Always handle potential errors in plugin implementations
4. **Performance**: Be mindful of plugin complexity in hot code paths

## Related

- [ResolverPlugin Interface](./resolver-plugin-interface.md)
- [Creating Custom Plugins](../plugins/creating-plugins.md)
- [Dependency Resolution](../dependencies/dependency-resolution.md)
