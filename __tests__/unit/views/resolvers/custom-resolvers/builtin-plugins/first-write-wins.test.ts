import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver, FirstWriteWinsPlugin } from '@src/views/resolvers/custom-resolvers';

describe('FirstWriteWinsPlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should resolve to earliest value by timestamp', () => {
    // Later delta (should be ignored by FirstWriteWins)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'name', 'second', 'collection')
        .buildV1()
    );

    // Earlier delta (should win with FirstWriteWins)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'name', 'first', 'collection')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      name: new FirstWriteWinsPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['entity1'].properties.name).toBe('first');
  });

  test('should handle concurrent updates with same timestamp', () => {
    // Two deltas with same timestamp
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'status', 'active', 'collection')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user2', 'host2')
        .withTimestamp(1000)
        .setProperty('entity1', 'status', 'inactive', 'collection')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      status: new FirstWriteWinsPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    // Should pick one of the values (behavior may depend on implementation details)
    expect(['active', 'inactive']).toContain(result!['entity1'].properties.status);
  });
});
