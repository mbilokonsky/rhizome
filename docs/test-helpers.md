# Test Helpers

This document provides documentation for the test helper functions available in the Rhizome Node test suite.

## `testResolverWithPlugins`

A helper function for testing custom resolvers with plugins and a sequence of deltas.

### Import

```typescript
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';
```

### Signature

```typescript
function testResolverWithPlugins<T>({
  entityId,
  plugins,
  deltas,
  expectedResult
}: {
  entityId: string;
  plugins: Record<string, ResolverPlugin>;
  deltas: Delta[];
  expectedResult: (result: T) => void;
}): Promise<void>;
```

### Parameters

- `entityId`: The ID of the entity to test
- `plugins`: An object mapping property names to their respective resolver plugins
- `deltas`: An array of `Delta` objects to process
- `expectedResult`: A callback function that receives the resolved result for assertions

### Return Value

A promise that resolves when the test is complete.

### Example Usage

```typescript
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';
import { ConcatenationPlugin } from '@src/views/resolvers/custom-resolvers/builtin-plugins';

describe('MyCustomResolver', () => {
  test('should process deltas correctly', async () => {
    // Run test with plugins and deltas
    await testResolverWithPlugins({
      entityId: 'entity1',
      plugins: {
        myProperty: new ConcatenationPlugin()
      },
      deltas: [
        createTestDelta('user1', 'host1')
          .setProperty('entity1', 'myProperty', 'value1')
          .buildV1(),
        createTestDelta('user1', 'host1')
          .setProperty('entity1', 'myProperty', 'value2')
          .buildV1()
      ],
      expectedResult: (result) => {
        expect(result.properties.myProperty).toBe('value1 value2');
      }
    });
  });
});
```

## `createTestDelta`

A helper function for creating test deltas with a fluent API.

### Example Usage

```typescript
const delta = createTestDelta('user1', 'host1')
  .withTimestamp(1000)
  .setProperty('entity1', 'tags', 'red', 'color1')
  .buildV1();
```

## How It Works

1. Creates a new `Hyperview` instance for the test
2. Sets up a `CustomResolver` with the provided plugins
3. Ingests all provided deltas into the `Hyperview` instance
4. Retrieves a view for the specified entity
5. Processes the view through the resolver
6. Calls the `expectedResult` callback with the resolved entity

## Best Practices

- Use this helper when testing custom resolvers with plugins
- The helper handles all setup and teardown of test resources
- Use `createTestDelta` for consistent delta creation in tests
- The helper ensures type safety between the resolver and the expected result type
- Each test gets a fresh `Hyperview` instance automatically
