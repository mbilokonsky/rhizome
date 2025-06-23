# Delta Patterns in Rhizome-Node

This document outlines the distinct delta patterns identified in the Rhizome-Node test suite.

## 1. Basic Entity Creation
```typescript
createDelta('creator', 'host')
  .setProperty('entity1', 'name', 'Alice', 'user')
  .buildV1();
```

## 2. Relationship Creation
```typescript
createDelta('creator', 'host')
  .addPointer('users', 'alice', 'friends')
  .addPointer('friend', 'bob')
  .addPointer('type', 'friendship')
  .buildV1();
```

## 3. Transaction-Enabled Deltas
```typescript
createDelta('user1', 'host1')
  .inTransaction('tx123')
  .setProperty('doc1', 'status', 'draft')
  .buildV1();
```

## 4. Negation Deltas
```typescript
// Creating a negation delta
const delta = createDelta('user1', 'host1').buildV1();
const negation = createDelta('moderator', 'host1').negate(delta.id).buildV1();
```

## 5. Temporal Deltas
```typescript
createDelta('user1', 'host1')
  .withTimestamp(1624233600000)
  .setProperty('entity1', 'score', 100, 'game')
  .buildV1();
```

## 6. Multi-Property Deltas
```typescript
createDelta('user1', 'host1')
  .setProperty('entity1', 'title', 'Hello World', 'post')
  .setProperty('entity1', 'content', 'This is a test', 'post')
  .setProperty('entity1', 'published', true, 'post')
  .buildV1();
```

## 7. Reference-Only Deltas
```typescript
createDelta('system', 'host1')
  .addPointer('posts', 'post1', 'recent')
  .buildV1();
```

## 8. Bulk Operation Deltas
```typescript
// Multiple entities in a single delta
createDelta('batch', 'host1')
  .setProperty('user1', 'status', 'active', 'user')
  .setProperty('user2', 'status', 'inactive', 'user')
  .buildV1();
```

## 9. Versioned Deltas
```typescript
// V1 format
createDelta('a', 'h').buildV1();
// V2 format
createDelta('a', 'h').buildV2();
```

## Key Observations
- Most deltas follow a fluent builder pattern
- Deltas can be composed of multiple operations (setProperty, addPointer, etc.)
- Support for both V1 and V2 delta formats
- Strong typing and schema validation is commonly used
- Transaction support is built into the delta creation process
- Temporal aspects can be explicitly controlled
