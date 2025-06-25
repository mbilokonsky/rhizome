import { describe, test, expect } from '@jest/globals';
import { FirstWriteWinsPlugin } from '@src/views/resolvers/custom-resolvers';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('FirstWriteWinsPlugin', () => {
  test('should resolve to earliest value by timestamp', async () => {
    // Arrange
    const entityId = 'entity1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        name: new FirstWriteWinsPlugin()
      },
      deltas: [
        // Later delta (should be ignored by FirstWriteWins)
        createTestDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty(entityId, 'name', 'second', 'collection')
          .buildV1(),
        // Earlier delta (should win with FirstWriteWins)
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'name', 'first', 'collection')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result.properties.name).toBe('first');
  });

  test('should handle concurrent updates with same timestamp', async () => {
    // Arrange
    const entityId = 'entity1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        status: new FirstWriteWinsPlugin()
      },
      deltas: [
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
    expect(result.properties.status).toBe('active');
  });
});
