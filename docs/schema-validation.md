# Schema Validation in Rhizome-Node

This document explains how schema validation works with deltas in Rhizome-Node.

## Overview

Schema validation in Rhizome-Node is enforced at the `TypedCollection` level when using the `put` method, which validates data before creating deltas. This means:

1. **Local Changes**: When you use `collection.put()`, the data is validated against the schema before any deltas are created and ingested.
2. **Peer Changes**: Deltas received from other peers are ingested without validation by default, which means invalid data can enter the system.
3. **Validation Tracking**: The system tracks which entities are valid/invalid after ingestion.

## Example Usage

```typescript
// 1. Define a schema for users
const userSchema = SchemaBuilder
  .create('user')
  .name('User')
  .property('name', PrimitiveSchemas.requiredString())
  .property('email', PrimitiveSchemas.email())
  .property('age', PrimitiveSchemas.integer({ minimum: 0 }))
  .required('name')
  .build();

// 2. Create a typed collection with strict validation
const collection = new TypedCollectionImpl<{
  name: string;
  email?: string;
  age?: number;
}>('users', userSchema, schemaRegistry, {
  strictValidation: true // Enable strict validation
});

// Connect to the node
collection.rhizomeConnect(node);

// 3. Local changes - validated on put()
// Valid usage - will pass schema validation
await collection.put('user1', { 
  name: 'Alice', 
  email: 'alice@example.com',
  age: 30
});

// Invalid usage - will throw SchemaValidationError
await expect(collection.put('user2', {
  email: 'invalid-email', // Invalid email format
  age: -5                 // Negative age
})).rejects.toThrow(SchemaValidationError);

// 4. Peer data - ingested without validation by default
const unsafeDelta = createDelta('peer1', 'peer1')
  .setProperty('user3', 'name', 'Bob', 'users')
  .setProperty('user3', 'age', 'not-a-number', 'users')
  .buildV1();

// This will be ingested without validation
node.hyperview.ingestDelta(unsafeDelta);

// 5. Check validation status after the fact
const stats = collection.getValidationStats();
debug(`Valid: ${stats.validEntities}, Invalid: ${stats.invalidEntities}`);

// Get details about invalid entities
const invalidUsers = collection.getInvalidEntities();
invalidUsers.forEach(user => {
  debug(`User ${user.entityId} is invalid:`, user.errors);
});
```

## Key Points

### Validation Timing
- Schema validation happens in `TypedCollection.put()` before deltas are created
- Deltas from peers are ingested without validation by default

### Validation Modes
- `strictValidation: true`: Throws errors on invalid data (recommended for local changes)
- `strictValidation: false`: Allows invalid data but tracks it (default)

### Monitoring
- Use `getValidationStats()` to get counts of valid/invalid entities
- Use `getInvalidEntities()` to get detailed error information

### Best Practices
- Always validate data before creating deltas when accepting external input
- Use `strictValidation: true` for collections where data integrity is critical
- Monitor validation statistics in production to detect data quality issues
- Consider implementing a validation layer for peer data if needed
