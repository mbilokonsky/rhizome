import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver } from '@src/views/resolvers/custom-resolvers';

class CountPlugin {
  readonly name = 'count' as const;
  
  initialize() {
    return { count: 0 };
  }
  
  update(currentState: {count: number}, _newValue: unknown, _delta: any) {
    return { count: currentState.count + 1 };
  }
  
  resolve(state: {count: number}) {
    return state.count;
  }
}

describe('CountPlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should count the number of updates', () => {
    // First update
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('counter1', 'count', 'value1', 'test')
        .buildV1()
    );

    // Second update
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('counter1', 'count', 'value2', 'test')
        .buildV1()
    );

    // Third update
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(3000)
        .setProperty('counter1', 'count', 'value3', 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      count: new CountPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['counter1'].properties.count).toBe(3);
  });

  test('should handle multiple entities independently', () => {
    // Update counter1
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('counter1', 'count', 'value1', 'test')
        .buildV1()
    );

    // Update counter2
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('counter2', 'count', 'value1', 'test')
        .buildV1()
    );

    // Update counter1 again
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('counter1', 'count', 'value2', 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      count: new CountPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['counter1'].properties.count).toBe(2);
    expect(result!['counter2'].properties.count).toBe(1);
  });
});
