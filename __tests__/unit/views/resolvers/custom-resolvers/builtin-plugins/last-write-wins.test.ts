import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver, LastWriteWinsPlugin } from '@src/views/resolvers/custom-resolvers';

describe('LastWriteWinsPlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should resolve to most recent value by timestamp', () => {
    // First delta with earlier timestamp
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'name', 'first', 'collection')
        .buildV1()
    );

    // Second delta with later timestamp (should win)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'name', 'second', 'collection')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      name: new LastWriteWinsPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['entity1'].properties.name).toBe('second');
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
      status: new LastWriteWinsPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    // Should pick one of the values (behavior may depend on implementation details)
    expect(['active', 'inactive']).toContain(result!['entity1'].properties.status);
  });
});
