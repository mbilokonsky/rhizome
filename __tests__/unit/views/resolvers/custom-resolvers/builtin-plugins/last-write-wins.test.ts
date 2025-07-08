import { describe, test, expect } from '@jest/globals';
import { LastWriteWinsPlugin } from '@src/views/resolvers/custom-resolvers';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('LastWriteWinsPlugin', () => {
  test('should resolve to most recent value by timestamp', async () => {
    // Arrange
    const entityId = 'entity1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        name: new LastWriteWinsPlugin()
      },
      deltas: [
        // First delta with earlier timestamp
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'name', 'first', 'collection')
          .buildV1(),
        // Second delta with later timestamp (should win)
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'name', 'second', 'collection')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result?.properties.name).toBe('second');
  });

  test('should handle concurrent updates with same timestamp', async () => {
    // Arrange
    const entityId = 'entity1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        status: new LastWriteWinsPlugin()
      },
      deltas: [
        // Two deltas with same timestamp
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'status', 'active', 'collection')
          .buildV1(),
        createTestDelta('user2', 'host2')
          .withTimestamp(1000)
          .setProperty(entityId, 'status', 'inactive', 'collection')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(['active', 'inactive']).toContain(result?.properties.status);
  });
});
