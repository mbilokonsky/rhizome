import { describe, test, expect } from '@jest/globals';
import { ResolverPlugin, DependencyStates } from '@src/views/resolvers/custom-resolvers';
import { PropertyTypes } from '@src/core/types';
import type { CollapsedDelta } from '@src/views/lossless';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';

class CountPlugin extends ResolverPlugin<{ count: number }, never> {
  readonly dependencies = [] as const;
  
  initialize() {
    return { count: 0 };
  }
  
  update(
    currentState: { count: number },
    _newValue: PropertyTypes,
    _delta: CollapsedDelta,
    _dependencies: DependencyStates
  ) {
    return { count: currentState.count + 1 };
  }
  
  resolve(
    state: { count: number },
    _dependencies: DependencyStates
  ): number {
    return state.count;
  }
}

describe('CountPlugin', () => {
  test('should count the number of updates', async () => {
    // Arrange & Act
    const entityId = 'counter1';
    
    await testResolverWithPlugins({
      entityId,
      plugins: {
        count: new CountPlugin()
      },
      deltas: [
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'count', 'value1', 'test')
          .buildV1(),
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'count', 'value2', 'test')
          .buildV1(),
        createTestDelta()
          .withTimestamp(3000)
          .setProperty(entityId, 'count', 'value3', 'test')
          .buildV1()
      ],
      expectedResult: (result) => {
        // Assert
        expect(result).toBeDefined();
        expect(result.properties.count).toBe(3);
      }
    });
  });

  test('should handle multiple entities independently', async () => {
    // Arrange
    const counter1Deltas = [
      createTestDelta()
        .withTimestamp(1000)
        .setProperty('counter1', 'count', 'value1', 'test')
        .buildV1(),
      createTestDelta()
        .withTimestamp(2000)
        .setProperty('counter1', 'count', 'value2', 'test')
        .buildV1()
    ];

    const counter2Deltas = [
      createTestDelta()
        .withTimestamp(1000)
        .setProperty('counter2', 'count', 'value1', 'test')
        .buildV1()
    ];

    // Act & Assert - Test counter1
    await testResolverWithPlugins({
      entityId: 'counter1',
      plugins: {
        count: new CountPlugin()
      },
      deltas: counter1Deltas,
      expectedResult: (result) => {
        expect(result).toBeDefined();
        expect(result.properties.count).toBe(2);
      }
    });

    // Act & Assert - Test counter2
    await testResolverWithPlugins({
      entityId: 'counter2',
      plugins: {
        count: new CountPlugin()
      },
      deltas: counter2Deltas,
      expectedResult: (result) => {
        expect(result).toBeDefined();
        expect(result.properties.count).toBe(1);
      }
    });
  });
});
