import {
  RhizomeNode,
  Lossless,
  TimestampResolver,
  CreatorIdTimestampResolver,
  DeltaIdTimestampResolver,
  HostIdTimestampResolver,
  LexicographicTimestampResolver
} from "../src";
import { createDelta } from "../src/core/delta-builder";

describe('Timestamp Resolvers', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Basic Timestamp Resolution', () => {
    test('should resolve by most recent timestamp', () => {
      // Add older delta
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      // Add newer delta
      lossless.ingestDelta(createDelta('user2', 'host2')
        .withId('delta2')
        .withTimestamp(2000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const resolver = new TimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(20); // More recent value wins
    });

    test('should handle multiple entities with different timestamps', () => {
      // Entity1 - older value
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 100)
        .buildV1()
      );

      // Entity2 - newer value
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withTimestamp(2000)
        .addPointer('collection', 'entity2', 'value')
        .addPointer('value', 200)
        .buildV1()
      );

      const resolver = new TimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(100);
      expect(result!['entity2'].properties.value).toBe(200);
    });
  });

  describe('Tie-Breaking Strategies', () => {
    test('should break ties using creator-id strategy', () => {
      // Two deltas with same timestamp, different creators
      lossless.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const resolver = new CreatorIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // user_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using delta-id strategy', () => {
      // Two deltas with same timestamp, different delta IDs
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_a') // Lexicographically earlier
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_z') // Lexicographically later
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const resolver = new DeltaIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // delta_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(20);
    });

    test('should break ties using host-id strategy', () => {
      // Two deltas with same timestamp, different hosts
      lossless.ingestDelta(createDelta('user1', 'host_z') // Lexicographically later
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user1', 'host_a') // Lexicographically earlier
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const resolver = new HostIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // host_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using lexicographic strategy with string values', () => {
      // Two deltas with same timestamp, different string values
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'alice')
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta2')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'bob')
        .buildV1()
      );

      const resolver = new LexicographicTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // 'bob' comes later lexicographically than 'alice', so should win
      expect(result!['entity1'].properties.name).toBe('bob');
    });

    test('should break ties using lexicographic strategy with numeric values (falls back to delta ID)', () => {
      // Two deltas with same timestamp, numeric values (should fall back to delta ID comparison)
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_a') // Lexicographically earlier
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 100)
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta_z') // Lexicographically later
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 200)
        .buildV1()
      );

      const resolver = new LexicographicTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should fall back to delta ID comparison: delta_z > delta_a
      expect(result!['entity1'].properties.score).toBe(200);
    });
  });

  describe('Complex Tie-Breaking Scenarios', () => {
    test('should handle multiple properties with different tie-breaking outcomes', () => {
      // Add deltas for multiple properties with same timestamp
      lossless.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta_z')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'alice')
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta_a')
        .withTimestamp(1000) // Same timestamp
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'bob')
        .buildV1()
      );

      const creatorResolver = new CreatorIdTimestampResolver(lossless);
      const deltaResolver = new DeltaIdTimestampResolver(lossless);
      
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
      // Add older delta with "better" tie-breaking attributes
      lossless.ingestDelta(createDelta('user_z', 'host1')
        .withId('delta_z') // Would win in delta ID tie-breaking
        .withTimestamp(1000) // Older timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      // Add newer delta with "worse" tie-breaking attributes
      lossless.ingestDelta(createDelta('user_a', 'host1')
        .withId('delta_a') // Would lose in delta ID tie-breaking
        .withTimestamp(2000) // Newer timestamp
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const resolver = new CreatorIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Timestamp should take priority over tie-breaking, so newer value (20) wins
      expect(result!['entity1'].properties.score).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    test('should handle single delta correctly', () => {
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 42)
        .buildV1()
      );

      const resolver = new TimestampResolver(lossless, 'creator-id');
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(42);
    });

    test('should handle mixed value types correctly', () => {
      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'test')
        .buildV1()
      );

      lossless.ingestDelta(createDelta('user1', 'host1')
        .withId('delta2')
        .withTimestamp(1001)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 100)
        .buildV1()
      );

      const resolver = new TimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('test');
      expect(result!['entity1'].properties.score).toBe(100);
    });
  });
});