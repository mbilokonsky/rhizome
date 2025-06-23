import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver } from '@src/views/resolvers/custom-resolvers';

class RunningAveragePlugin {
  readonly name = 'running-average' as const;
  
  initialize() {
    return { sum: 0, count: 0 };
  }
  
  update(currentState: {sum: number, count: number}, newValue: unknown, _delta: any) {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    return {
      sum: currentState.sum + numValue,
      count: currentState.count + 1
    };
  }
  
  resolve(state: {sum: number, count: number}) {
    return state.count > 0 ? state.sum / state.count : 0;
  }
}

describe('RunningAveragePlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should calculate running average of numeric values', () => {
    // First score (10)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('player1', 'score', 10, 'game')
        .buildV1()
    );

    // Second score (20)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('player1', 'score', 20, 'game')
        .buildV1()
    );

    // Third score (30)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(3000)
        .setProperty('player1', 'score', 30, 'game')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      score: new RunningAveragePlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['player1'].properties.score).toBe(20); // (10 + 20 + 30) / 3 = 20
  });

  test('should handle non-numeric values gracefully', () => {
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test1', 'value', 'not a number', 'test')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('test1', 'value', 10, 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      value: new RunningAveragePlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    // First value is treated as 0, second as 10, average is (0 + 10) / 2 = 5
    expect(result!['test1'].properties.value).toBe(5);
  });

  test('should handle empty state', () => {
    const resolver = new CustomResolver(lossless, {
      value: new RunningAveragePlugin()
    });

    const result = resolver.resolve();
    expect(result).toEqual({});
  });
});
