import { describe, test, expect } from '@jest/globals';
import { ResolverPlugin, DependencyStates } from '@src/views/resolvers/custom-resolvers';
import { PropertyTypes } from '@src/core/types';
import { testResolverWithPlugins, createTestDelta } from '@test-helpers/resolver-test-helper';
import Debug from 'debug';
const debug = Debug('rz:test:discount-plugins');
// Mock plugins for testing
class DiscountPlugin implements ResolverPlugin<number, never> {
  readonly name = 'discount' as const;
  readonly dependencies = [] as const;
  
  initialize() {
    return 0;
  }
  
  update(
    _currentState: number,
    newValue: PropertyTypes,
  ) {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    const clampedValue = Math.min(100, Math.max(0, numValue)); // Clamp between 0-100
    debug(`DiscountPlugin: updated discount to ${clampedValue}`);
    return clampedValue;
  }
  
  resolve( state: number ): number {
    return state;
  }
}

class DiscountedPricePlugin implements ResolverPlugin<number | null, 'discount'> {
  readonly name = 'price' as const;
  readonly dependencies = ['discount'] as const;
  
  initialize() {
    return null;
  }
  
  update(
    _currentState: number | null,
    newValue: PropertyTypes,
  ) {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    debug(`DiscountedPricePlugin: updated price to ${numValue}`);
    return numValue;
  }
  
  resolve(
    state: number | null,
    dependencies: DependencyStates
  ): number | null {
    if (state === null) {
      return null;
    }
    // Ensure discount is a number and default to 0 if undefined
    const discount = typeof dependencies.discount === 'number' ? dependencies.discount : 0;
    const discountMultiplier = (100 - discount) / 100;
    return state * discountMultiplier;
  }
}

describe('Discount and DiscountedPrice Plugins', () => {
  test('should apply discount to price', async () => {
    // Arrange
    const entityId = 'product1';
    
    // Act
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        price: new DiscountedPricePlugin(),
        discount: new DiscountPlugin()
      },
      deltas: [
        // Set base price
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'price', 100, 'product')
          .buildV1(),
        // Set discount (20%)
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'discount', 20, 'product')
          .buildV1()
      ],
    });

    // Assert
    expect(result).toBeDefined();
    expect(result?.properties?.price).toBe(80); // 100 * 0.8 = 80
  });

  test('should handle zero discount', async () => {
    // Arrange
    const entityId = 'product1';
    
    // Act
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        price: new DiscountedPricePlugin(),
        discount: new DiscountPlugin()
      },
      deltas: [
        // Set base price
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'price', 100, 'products')
          .buildV1(),
        // Set discount to 0
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'discount', 0, 'products')
          .buildV1()
      ],
    });

    // Assert
    expect(result).toBeDefined();
    expect(result?.properties?.price).toBe(100); // 100 * 1.0 = 100
  });

  test('should handle 100% discount', async () => {
    // Arrange
    const entityId = 'product1';
    
    // Act
    const result = await testResolverWithPlugins({
      entityId,
      plugins: {
        price: new DiscountedPricePlugin(),
        discount: new DiscountPlugin()
      },
      deltas: [
        // Set base price
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'price', 100, 'products')
          .buildV1(),
        // Set discount to 100%
        createTestDelta()
          .withTimestamp(2000)
          .setProperty(entityId, 'discount', 100, 'products')
          .buildV1()
      ],
    });
    // Assert
    expect(result).toBeDefined();
    expect(result?.properties.price).toBe(0); // 100 * 0.0 = 0
  });

  test('should handle missing discount plugin', async () => {
    // Arrange
    const entityId = 'product1';
    
    // Act
    await expect(
      testResolverWithPlugins({
      entityId,
      plugins: {
        price: new DiscountedPricePlugin()
        // No discount plugin provided
      },
      deltas: [
        // Set base price
        createTestDelta()
          .withTimestamp(1000)
          .setProperty(entityId, 'price', 100, 'products')
          .buildV1()
      ]
    })).rejects.toThrowError('Dependency discount not found for plugin price');
  });
});
