# Dynamic Schema System

## Overview

Rhizome uses a **dynamic schema system** where schemas are stored as deltas in the database, not hard-coded in application code. This enables:

- **Schema evolution** over time without code changes
- **Distributed schema management** across nodes
- **Schema versioning** and history tracking
- **Runtime schema creation** and modification

## Bootstrap Schemas

The **only** hard-coded schemas in Rhizome are the bootstrap schemas that define the schema system itself:

### 1. Schema Schema (`schema`)

The meta-schema that defines how schemas are structured:

```typescript
{
  id: 'schema',
  name: 'Schema',
  properties: {
    id: string (required)
    name: string (required)
    description: string
    version: number
    created: number (required)
    updated: number
    creator: string
    additionalProperties: boolean
    properties: array of schema-property references
    requiredProperties: array of strings
  }
}
```

### 2. Schema Property Schema (`schema-property`)

Defines the structure of individual properties within a schema:

```typescript
{
  id: 'schema-property',
  name: 'Schema Property',
  properties: {
    propertyId: string (required)
    type: string (required)  // 'primitive', 'reference', 'array'
    primitiveType: string    // For primitive types
    targetSchema: string     // For reference types
    maxDepth: number         // For reference types
    itemSchema: reference    // For array types
    maxItems: number         // For array types
    required: boolean
    default: string          // JSON-encoded default value
  }
}
```

## Creating Schemas Dynamically

### Using SchemaBuilder

```typescript
import { SchemaBuilder } from '@rhizome/schema';

const articleSchema = SchemaBuilder
  .create('article')
  .name('Article')
  .description('A news article')
  .property('title', { 
    type: 'primitive', 
    primitiveType: 'string', 
    required: true 
  })
  .property('body', { 
    type: 'primitive', 
    primitiveType: 'string',
    required: true
  })
  .property('author', {
    type: 'reference',
    targetSchema: 'user',
    maxDepth: 1
  })
  .property('tags', {
    type: 'array',
    itemSchema: { type: 'primitive', primitiveType: 'string' }
  })
  .required('title', 'body')
  .build();
```

### Persisting Schemas

Once created, schemas must be persisted to storage:

```typescript
// Register in the schema registry
node.schemaRegistry.register(articleSchema);

// Persist to storage as deltas
await node.schemaRegistry.persistSchema(articleSchema, 'creator-id');
```

This creates deltas representing the schema that are stored in the database and can be replicated across nodes.

## Loading Schemas

Schemas are automatically loaded from storage when a node starts:

```typescript
const node = new RhizomeNode({...});
await node.start(); // Automatically calls schemaRegistry.initialize()
```

The initialization process:
1. Registers bootstrap schemas (hard-coded)
2. Queries storage for schema entities (`schema:*`)
3. Reconstructs ObjectSchema instances from deltas
4. Registers them in the schema registry

## Schema Evolution

Schemas can evolve over time while maintaining backward compatibility:

### Version 1: Initial Schema

```typescript
const userV1 = SchemaBuilder
  .create('user')
  .name('User')
  .property('name', { type: 'primitive', primitiveType: 'string', required: true })
  .property('email', { type: 'primitive', primitiveType: 'string', required: true })
  .property('version', { type: 'primitive', primitiveType: 'number', default: 1 })
  .build();
```

### Version 2: Add Optional Properties

```typescript
const userV2 = SchemaBuilder
  .create('user')
  .name('User')
  .property('name', { type: 'primitive', primitiveType: 'string', required: true })
  .property('email', { type: 'primitive', primitiveType: 'string', required: true })
  .property('bio', { type: 'primitive', primitiveType: 'string' }) // NEW
  .property('avatar', { type: 'primitive', primitiveType: 'string' }) // NEW
  .property('version', { type: 'primitive', primitiveType: 'number', default: 2 })
  .build();
```

Old data continues to validate against the new schema because new properties are optional.

## Schema Validation

Validate entities against schemas:

```typescript
const view = hyperview.compose(['user:123'])['user:123'];
const result = schemaRegistry.validate('user:123', 'user', view);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## Schema-Aware Queries

Use HyperView with schemas to filter and structure data:

```typescript
// Apply schema to filter only schema-defined properties
const appliedView = schemaRegistry.applySchema(view, 'user');

// With nested resolution
const nestedView = schemaRegistry.applySchemaWithNesting(
  view, 
  'user', 
  hyperview,
  { maxDepth: 3 }
);
```

## Best Practices

### ✅ DO

- Create schemas dynamically using SchemaBuilder
- Persist schemas to storage via `persistSchema()`
- Use version numbers to track schema evolution
- Add new properties as optional for backward compatibility
- Document schema changes in your application

### ❌ DON'T

- Hard-code schemas in application code (except bootstrap schemas)
- Make breaking changes to required properties
- Delete properties from existing schemas (deprecate instead)
- Skip schema validation for critical data
- Use test-only schemas (from `util/schemas.ts`) in production

## Testing

Test schemas are provided in `util/schemas.ts` for testing purposes only:

```typescript
import { CommonSchemas } from '../util/schemas';

// Use only in tests
const userSchema = CommonSchemas.User();
```

⚠️ **Warning:** These are for testing only and should not be used in production code.

## Example: Complete Workflow

See `examples/dynamic-schemas.ts` for a complete example of:
- Creating a schema
- Persisting it to storage
- Creating data that conforms to the schema
- Validating data against the schema
- Querying schema-aware data

## Architecture Notes

### Why Dynamic Schemas?

1. **Distributed Systems**: Schemas can be created/updated by any node and propagate via deltas
2. **Evolution**: Applications can evolve schemas without code deployments
3. **Versioning**: Full history of schema changes stored as deltas
4. **Flexibility**: Different nodes can have different schema versions (eventual consistency)

### Schema Storage Format

Schemas are stored as multiple deltas:

```
Delta 1: schema:article -> id = "article"
Delta 2: schema:article -> name = "Article"
Delta 3: schema:article -> description = "A news article"
Delta 4: schema:article -> created = 1634567890
...
```

This allows:
- Incremental updates (change just one property)
- Negation (remove a property by negating its delta)
- Replication (deltas propagate like any other data)

## Future Enhancements

- [ ] Property-level schema definitions (stored as separate entities)
- [ ] Schema migration helpers
- [ ] Schema diff/comparison tools
- [ ] Schema validation modes (strict, permissive, warn-only)
- [ ] Schema inheritance/composition
- [ ] Automatic schema inference from data

