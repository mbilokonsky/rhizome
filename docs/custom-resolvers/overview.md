# Custom Resolvers

## Overview

The `CustomResolver` system provides a flexible framework for resolving property conflicts in distributed systems. It enables you to define custom resolution strategies through plugins, complete with type-safe dependencies between resolvers.

## Key Features

- **Plugin-based Architecture**: Extend functionality with custom resolvers
- **Type-Safe Dependencies**: Compile-time checking of plugin dependencies
- **Built-in Resolvers**: Common resolution strategies included
- **Efficient Processing**: Only processes changed deltas
- **Deterministic Results**: Same input always produces the same output

## Core Concepts

1. **Resolver Plugins**: Implement resolution logic for properties
2. **Dependency Management**: Declare and manage dependencies between plugins
3. **State Management**: Maintain and update state based on incoming deltas
4. **Resolution Pipeline**: Process updates and resolve final values

## Getting Started

```typescript
import { CustomResolver } from '../src/views/resolvers/custom-resolvers';
import { LastWriteWinsPlugin } from '../src/views/resolvers/custom-resolvers/plugins';
import { Hyperview } from '../src/views/hyperview';

// Create a hyperview
const hyperview = new Hyperview();

// Create a resolver with a last-write-wins strategy
const resolver = new CustomResolver(hyperview, {
  myProperty: new LastWriteWinsPlugin()
});

// Process updates through the hyperview
// hyperview.applyDelta(delta);

// Get resolved values for specific entities
const result = resolver.resolve(['entity1', 'entity2']);

// Or get all resolved values
const allResults = resolver.resolveAll();
```

## Next Steps

- Learn about [Built-in Plugins](./plugins/builtin-plugins.md)
- Understand [Type-Safe Dependencies](./dependencies/type-safety.md)
- Explore [Creating Custom Plugins](./plugins/creating-plugins.md)
