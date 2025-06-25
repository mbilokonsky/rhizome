import { describe, test, expect } from '@jest/globals';
import { ConcatenationPlugin } from '@src/views/resolvers/custom-resolvers';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('ConcatenationPlugin', () => {
  test('should join string values chronologically', async () => {
    // Define test data
    const entityId = 'entity1';
    
    // Run test & verify results
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        tags: new ConcatenationPlugin()
      },
      deltas: [
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'tags', 'red', 'color1')
          .buildV1(),
        createTestDelta('user1', 'host1')
          .withTimestamp(3000)
          .setProperty(entityId, 'tags', 'blue', 'color2')
          .buildV1(),
        createTestDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty(entityId, 'tags', 'green', 'color3')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result?.properties.tags).toBe('red green blue');
  });

  test('should handle empty values', async () => {
    // Define test data
    const entityId = 'entity1';
    
    // Run test & verify results
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        tags: new ConcatenationPlugin()
      },
      deltas: [
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'tags', null, 'tag1')
          .buildV1(),
        createTestDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty(entityId, 'tags', 'blue', 'tag2')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result?.properties.tags).toBe('blue');
  });
});
