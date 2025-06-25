import { describe, test, expect } from '@jest/globals';
import { RunningAveragePlugin } from '@src/views/resolvers/custom-resolvers/plugins/running-average.plugin';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

describe('RunningAveragePlugin', () => {
  test('should calculate running average of numeric values', async () => {
    // Arrange & Act
    const entityId = 'player1';
    
    await testResolverWithPlugins({
      entityId,
      plugins: {
        score: new RunningAveragePlugin()
      },
      deltas: [
        // First score (10)
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'score', 10, 'game')
          .buildV1(),
        // Second score (20)
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'score', 20, 'game')
          .buildV1(),
        // Third score (30)
        createTestDelta()
          .withTimestamp(3000)
          .setProperty(entityId, 'score', 30, 'game')
          .buildV1()
      ],
      expectedResult: (result) => {
        // Assert
        expect(result).toBeDefined();
        expect(result.properties.score).toBe(20); // (10 + 20 + 30) / 3 = 20
      }
    });
  });

  test('should handle non-numeric values gracefully', async () => {
    // Arrange & Act
    const entityId = 'test1';
    
    await testResolverWithPlugins({
      entityId,
      plugins: {
        value: new RunningAveragePlugin()
      },
      deltas: [
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'value', 'not a number', 'test')
          .buildV1(),
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'value', 10, 'test')
          .buildV1()
      ],
      expectedResult: (result) => {
        // Assert
        expect(result).toBeDefined();
        // First value is treated as 0, second as 10, average is (0 + 10) / 2 = 5
        expect(result.properties.value).toBe(5);
      }
    });
  });

  test('should handle empty state', async () => {
    // Arrange & Act
    const entityId = 'non-existent';
    let error: Error | undefined;
    
    try {
      await testResolverWithPlugins({
        entityId,
        plugins: {
          value: new RunningAveragePlugin()
        },
        deltas: [],
        expectedResult: () => {}
      });
    } catch (err) {
      error = err as Error;
    }

    // Assert - The helper should throw when entity is not found
    expect(error).toBeDefined();
    expect(error?.message).toContain('No view found for entity non-existent');
  });
});
