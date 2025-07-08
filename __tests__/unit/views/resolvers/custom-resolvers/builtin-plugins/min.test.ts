import { describe, test, expect } from '@jest/globals';
import { MinPlugin } from '@src/views/resolvers/custom-resolvers';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('MinPlugin', () => {
  test('should resolve to the minimum numeric value', async () => {
    // Arrange
    const entityId = 'sensor1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        temperature: new MinPlugin()
      },
      deltas: [
        // Add multiple values
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'temperature', 25, 'readings')
          .buildV1(),
        createTestDelta('user2', 'host1')
          .withTimestamp(2000)
          .setProperty(entityId, 'temperature', 22, 'readings')
          .buildV1(),
        createTestDelta('user3', 'host1')
          .withTimestamp(3000)
          .setProperty(entityId, 'temperature', 27, 'readings')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result?.properties.temperature).toBe(22);
  });

  test('should handle negative numbers', async () => {
    // Arrange
    const entityId = 'sensor2';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        value: new MinPlugin()
      },
      deltas: [
        createTestDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty(entityId, 'value', -5, 'readings')
          .buildV1(),
        createTestDelta('user2', 'host1')
          .withTimestamp(2000)
          .setProperty(entityId, 'value', -10, 'readings')
          .buildV1()
      ],
    });
    expect(result).toBeDefined();
    expect(result?.properties.value).toBe(-10);
  });
});
