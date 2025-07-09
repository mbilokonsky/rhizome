# Test Helpers

This document provides documentation for the test helper functions available in the Rhizome Node test suite.

## `testResolverWithPlugins`

An async helper function for testing custom resolvers with plugins and a sequence of deltas. Returns a Promise that resolves to the resolved entity.

### Import

```typescript
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';
```

### Signature

```typescript
function testResolverWithPlugins<T>({
  entityId = 'test-entity',
  plugins,
  deltas
}: {
  entityId?: string;
  plugins: Record<string, ResolverPlugin>;
  deltas: Delta[];
}): Promise<ResolvedEntity>;
```

### Parameters

- `entityId` (optional): The ID of the entity to test (defaults to 'test-entity')
- `plugins`: An object mapping property names to their respective resolver plugins
- `deltas`: An array of `Delta` objects to process

### Return Value

A Promise that resolves to the resolved entity with all properties processed by the specified plugins.

### Example Usage

```typescript
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';
import { ConcatenationPlugin } from '@src/views/resolvers/custom-resolvers/builtin-plugins';

describe('MyCustomResolver', () => {
  test('should process deltas correctly', async () => {
    // Define test data
    const entityId = 'entity1';
    
    // Run test with plugins and deltas
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        myProperty: new ConcatenationPlugin()
      },
      deltas: [
        createTestDelta('user1', 'host1')
          .setProperty(entityId, 'myProperty', 'value1')
          .buildV1(),
        createTestDelta('user1', 'host1')
          .setProperty(entityId, 'myProperty', 'value2')
          .buildV1()
      ]
    });
    
    // Assert the results
    expect(result).toBeDefined();
    expect(result.properties.myProperty).toBe('value1 value2');
  });
});
```

## `createTestDelta`

A helper function for creating test deltas with a fluent API.

### Example Usage

```typescript
// Create a simple delta
const delta = createTestDelta('user1', 'host1')
  .withTimestamp(1000)
  .setProperty('entity1', 'tags', 'red', 'color1')
  .buildV1();

// Declare a transaction
const transaction = createTestDelta('user1', 'host1')
  .declareTransaction('tx123', 1)
  .buildV1();

// Create a delta in a transaction
const deltaInTransaction = createTestDelta('user1', 'host1')
  .inTransaction('tx123')
  .setProperty('entity1', 'status', 'active', 'system')
  .buildV1();
```

## How It Works

1. Creates a new `Hyperview` instance for the test
2. Sets up a `CustomResolver` with the provided plugins
3. Ingests all provided deltas into the `Hyperview` instance
4. Retrieves and resolves the view for the specified entity
5. Returns the resolved entity as a Promise

## Best Practices

### Test Structure
- Use `async/await` for cleaner test code
- Group related tests in `describe` blocks
- Use clear, descriptive test names
- Test edge cases like empty states and error conditions

### Delta Creation
- Use `createTestDelta` for consistent delta creation
- Set appropriate timestamps for time-based tests
- Include all necessary properties in test deltas
- Use transactions when testing multi-delta operations

### Assertions
- Always check that the result is defined before accessing properties
- Test both happy paths and error conditions
- Consider testing with different plugin configurations
- Verify the complete state of resolved entities, not just individual properties

### Performance
- Each test gets a fresh `Hyperview` instance automatically
- For complex test scenarios, consider using helper functions to create test data
- Keep test data minimal and focused on the specific behavior being tested
