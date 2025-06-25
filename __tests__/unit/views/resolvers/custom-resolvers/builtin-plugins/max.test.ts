import { describe, test, expect } from '@jest/globals';
import { MaxPlugin } from '@src/views/resolvers/custom-resolvers';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('MaxPlugin', () => {
  test('should resolve to the maximum numeric value', async () => {
    // Arrange
    const entityId = 'sensor1';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        temperature: new MaxPlugin()
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
    expect(result.properties.temperature).toBe(27);
  });

  test('should handle negative numbers', async () => {
    // Arrange
    const entityId = 'sensor2';
    
    // Act & Assert
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        value: new MaxPlugin()
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
    expect(result.properties.value).toBe(-5);
  });
});
