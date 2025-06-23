import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '../../../../../../../src';
import { CustomResolver } from '../../../../../../../src/views/resolvers/custom-resolvers';

class DiscountPlugin {
  readonly name = 'discount' as const;
  
  initialize() {
    return { value: 0 };
  }
  
  update(_currentState: {value: number}, newValue: unknown, _delta: any) {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    return { value: Math.min(100, Math.max(0, numValue)) }; // Clamp between 0-100
  }
  
  resolve(state: {value: number}) {
    return state.value;
  }
}

class DiscountedPricePlugin {
  readonly name = 'discounted-price' as const;
  readonly dependencies = ['discount'] as const;
  
  initialize() {
    return { price: 0 };
  }
  
  update(_currentState: {price: number}, newValue: unknown, _delta: any, _dependencies: {discount: number}) {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    return { price: numValue };
  }
  
  resolve(state: {price: number}, dependencies: {discount: number}) {
    const discountMultiplier = (100 - dependencies.discount) / 100;
    return state.price * discountMultiplier;
  }
}

describe('Discount and DiscountedPrice Plugins', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should apply discount to price', () => {
    // Set base price
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product1', 'price', 100, 'products')
        .buildV1()
    );

    // Set discount (20%)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product1', 'discount', 20, 'products')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      price: new DiscountedPricePlugin(),
      discount: new DiscountPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['product1'].properties.price).toBe(80); // 100 * 0.8 = 80
  });

  test('should handle zero discount', () => {
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product2', 'price', 50, 'products')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product2', 'discount', 0, 'products')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      price: new DiscountedPricePlugin(),
      discount: new DiscountPlugin()
    });

    const result = resolver.resolve();
    expect(result!['product2'].properties.price).toBe(50); // No discount applied
  });

  test('should handle 100% discount', () => {
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product3', 'price', 75, 'products')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product3', 'discount', 100, 'products')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      price: new DiscountedPricePlugin(),
      discount: new DiscountPlugin()
    });

    const result = resolver.resolve();
    expect(result!['product3'].properties.price).toBe(0); // 100% discount = free
  });

  test('should handle missing discount', () => {
    // Only set price, no discount
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('product4', 'price', 200, 'products')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      price: new DiscountedPricePlugin(),
      discount: new DiscountPlugin()
    });

    const result = resolver.resolve();
    // Should treat missing discount as 0%
    expect(result!['product4'].properties.price).toBe(200);
  });
});
