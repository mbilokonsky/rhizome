import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver, MaxPlugin } from '@src/views/resolvers/custom-resolvers';

describe('MaxPlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should resolve to the maximum numeric value', () => {
    // Add multiple values
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('sensor1', 'temperature', 25, 'readings')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user2', 'host1')
        .withTimestamp(2000)
        .setProperty('sensor1', 'temperature', 22, 'readings')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user3', 'host1')
        .withTimestamp(3000)
        .setProperty('sensor1', 'temperature', 27, 'readings')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      temperature: new MaxPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['sensor1'].properties.temperature).toBe(27);
  });

  test('should handle negative numbers', () => {
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('sensor2', 'value', -5, 'readings')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user2', 'host1')
        .withTimestamp(2000)
        .setProperty('sensor2', 'value', -10, 'readings')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      value: new MaxPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['sensor2'].properties.value).toBe(-5);
  });
});
