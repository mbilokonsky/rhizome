import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver, ConcatenationPlugin } from '@src/views/resolvers/custom-resolvers';

describe('ConcatenationPlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should join string values chronologically', () => {
    // First tag
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'tags', 'red', 'collection')
        .buildV1()
    );

    // Second tag (with later timestamp)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(3000)
        .setProperty('entity1', 'tags', 'blue', 'collection')
        .buildV1()
    );

    // Third tag (with middle timestamp, should be inserted in the middle)
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'tags', 'green', 'collection')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      tags: new ConcatenationPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['entity1'].properties.tags).toEqual(['red', 'green', 'blue']);
  });

  test('should handle empty values', () => {
    // Empty array
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'tags', [], 'collection')
        .buildV1()
    );

    // Add a value
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'tags', 'blue', 'collection')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      tags: new ConcatenationPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['entity1'].properties.tags).toEqual(['blue']);
  });
});
