import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CustomResolver, MajorityVotePlugin } from '@src/views/resolvers/custom-resolvers';

describe('MajorityVotePlugin', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should resolve to value with majority votes', () => {
    // Add three votes for 'yes'
    for (let i = 0; i < 3; i++) {
      lossless.ingestDelta(
        createDelta(`user${i}`, 'host1')
          .withTimestamp(1000 + i)
          .setProperty('poll1', 'result', 'yes', 'polls')
          .buildV1()
      );
    }

    // Add two votes for 'no'
    for (let i = 0; i < 2; i++) {
      lossless.ingestDelta(
        createDelta(`user${i + 3}`, 'host1')
          .withTimestamp(2000 + i)
          .setProperty('poll1', 'result', 'no', 'polls')
          .buildV1()
      );
    }

    const resolver = new CustomResolver(lossless, {
      result: new MajorityVotePlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['poll1'].properties.result).toBe('yes');
  });

  test('should handle tie by selecting the most recent value', () => {
    // Two votes for 'yes'
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('tie1', 'result', 'yes', 'polls')
        .buildV1()
    );
    lossless.ingestDelta(
      createDelta('user2', 'host1')
        .withTimestamp(2000)
        .setProperty('tie1', 'result', 'yes', 'polls')
        .buildV1()
    );

    // Two votes for 'no', with the last one being more recent
    lossless.ingestDelta(
      createDelta('user3', 'host1')
        .withTimestamp(3000)
        .setProperty('tie1', 'result', 'no', 'polls')
        .buildV1()
    );
    lossless.ingestDelta(
      createDelta('user4', 'host1')
        .withTimestamp(4000)
        .setProperty('tie1', 'result', 'no', 'polls')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      result: new MajorityVotePlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['tie1'].properties.result).toBe('no');
  });
});
