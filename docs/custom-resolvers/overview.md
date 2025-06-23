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
import { CustomResolver, LastWriteWinsPlugin } from './resolver';
import { LosslessView } from '../lossless-view';

// Create a lossless view
const view = new LosslessView();

// Create a resolver with a last-write-wins strategy
const resolver = new CustomResolver(view, {
  myProperty: new LastWriteWinsPlugin()
});

// Process updates
// ...

// Get resolved values
const result = resolver.resolve();
```

## Next Steps

- Learn about [Built-in Plugins](./plugins/builtin-plugins.md)
- Understand [Type-Safe Dependencies](./dependencies/type-safety.md)
- Explore [Creating Custom Plugins](./plugins/creating-plugins.md)
