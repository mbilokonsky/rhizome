import {
  RhizomeNode,
  Hyperview,
  TimestampResolver,
  CreatorIdTimestampResolver,
  DeltaIdTimestampResolver,
  HostIdTimestampResolver,
  LexicographicTimestampResolver
} from "@src";
import { createDelta } from "@src/core/delta-builder";
import Debug from "debug";
const debug = Debug('rz:test:timestamp-resolvers');

describe('Timestamp Resolvers', () => {
  let node: RhizomeNode;
  let hyperview: Hyperview;

  beforeEach(() => {
    node = new RhizomeNode();
    hyperview = new Hyperview(node);
  });

  describe('Basic Timestamp Resolution', () => {
    test('should resolve by most recent timestamp', () => {
      const resolver = new TimestampResolver(hyperview);

      // Add older delta
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      // Add newer delta
      hyperview.ingestDelta(createDelta('user2', 'host2')
        .withId('delta2')
        .withTimestamp(2000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      debug(`Result: ${JSON.stringify(result, null, 2)}`)
      expect(result!['entity1'].properties.score).toBe(20); // More recent value wins
    });

    test('should handle multiple entities with different timestamps', () => {
      const resolver = new TimestampResolver(hyperview);

      // Entity1 - older value
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 100)
        .buildV1()
      );

      // Entity2 - newer value
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withTimestamp(2000)
        .addPointer('collection', 'entity2', 'value')
        .addPointer('value', 200)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(100);
      expect(result!['entity2'].properties.value).toBe(200);
    });
  });

  describe('Tie-Breaking Strategies', () => {
    test('should break ties using creator-id strategy', () => {
      const resolver = new CreatorIdTimestampResolver(hyperview);

      // Two deltas with same timestamp, different creators
      hyperview.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // user_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using delta-id strategy', () => {
      const resolver = new DeltaIdTimestampResolver(hyperview);

      // Two deltas with same timestamp, different delta IDs
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_a') // Lexicographically earlier
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_z') // Lexicographically later
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // delta_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(20);
    });

    test('should break ties using host-id strategy', () => {
      const resolver = new HostIdTimestampResolver(hyperview);

      // Two deltas with same timestamp, different hosts
      hyperview.ingestDelta(createDelta('user1', 'host_z') // Lexicographically later
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host_a') // Lexicographically earlier
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // host_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using lexicographic strategy with string values', () => {
      const resolver = new LexicographicTimestampResolver(hyperview);

      // Two deltas with same timestamp, different string values
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'alice')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'bob')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // 'bob' comes later lexicographically than 'alice', so should win
      expect(result!['entity1'].properties.name).toBe('bob');
    });

    test('should break ties using lexicographic strategy with numeric values (falls back to delta ID)', () => {
      const resolver = new LexicographicTimestampResolver(hyperview);

      // Two deltas with same timestamp, numeric values (should fall back to delta ID comparison)
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_a') // Lexicographically earlier
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 100)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_z') // Lexicographically later
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 200)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should fall back to delta ID comparison: delta_z > delta_a
      expect(result!['entity1'].properties.score).toBe(200);
    });
  });

  describe('Complex Tie-Breaking Scenarios', () => {
    test('should handle multiple properties with different tie-breaking outcomes', () => {
      const creatorResolver = new CreatorIdTimestampResolver(hyperview);
      const deltaResolver = new DeltaIdTimestampResolver(hyperview);
      
      // Add deltas for multiple properties with same timestamp
      hyperview.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta_z')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'alice')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta_a')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'bob')
        .buildV1()
      );

      const creatorResult = creatorResolver.resolve();
      const deltaResult = deltaResolver.resolve();
      
      expect(creatorResult).toBeDefined();
      expect(deltaResult).toBeDefined();
      
      // Creator strategy: user_z > user_a, so 'bob' wins
      expect(creatorResult!['entity1'].properties.name).toBe('bob');
      
      // Delta ID strategy: delta_z > delta_a, so 'alice' wins
      expect(deltaResult!['entity1'].properties.name).toBe('alice');
    });

    test('should work consistently with timestamp priority over tie-breaking', () => {
      const resolver = new CreatorIdTimestampResolver(hyperview);

      // Add older delta with "better" tie-breaking attributes
      hyperview.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta_z') // Would win in delta ID tie-breaking
        .withTimestamp(1000) // Older timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      // Add newer delta with "worse" tie-breaking attributes
      hyperview.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta_a') // Would lose in delta ID tie-breaking
        .withTimestamp(2000) // Newer timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Timestamp should take priority over tie-breaking, so newer value (20) wins
      expect(result!['entity1'].properties.score).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    test('should handle single delta correctly', () => {
      const resolver = new TimestampResolver(hyperview, 'creator-id');
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 42)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(42);
    });

    test('should handle mixed value types correctly', () => {
      const resolver = new TimestampResolver(hyperview);

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'test')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .withId('delta2')
        .withTimestamp(1001)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 100)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('test');
      expect(result!['entity1'].properties.score).toBe(100);
    });
  });
});