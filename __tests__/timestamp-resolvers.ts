import {RhizomeNode} from "../src/node";
import {Lossless} from "../src/lossless";
import {Delta} from "../src/delta";
import {
  TimestampResolver,
  CreatorIdTimestampResolver,
  DeltaIdTimestampResolver,
  HostIdTimestampResolver,
  LexicographicTimestampResolver
} from "../src/timestamp-resolvers";

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
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      // Add newer delta
      lossless.ingestDelta(new Delta({
        creator: 'user2',
        host: 'host2',
        id: 'delta2',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const resolver = new TimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(20); // More recent value wins
    });

    test('should handle multiple entities with different timestamps', () => {
      // Entity1 - older value
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 100
        }]
      }));

      // Entity2 - newer value
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 200
        }]
      }));

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
      lossless.ingestDelta(new Delta({
        creator: 'user_z', // Lexicographically later
        host: 'host1',
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user_a', // Lexicographically earlier
        host: 'host1',
        id: 'delta2',
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const resolver = new CreatorIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // user_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using delta-id strategy', () => {
      // Two deltas with same timestamp, different delta IDs
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta_a', // Lexicographically earlier
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta_z', // Lexicographically later
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const resolver = new DeltaIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // delta_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(20);
    });

    test('should break ties using host-id strategy', () => {
      // Two deltas with same timestamp, different hosts
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host_z', // Lexicographically later
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host_a', // Lexicographically earlier
        id: 'delta2',
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const resolver = new HostIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // host_z comes later lexicographically, so should win
      expect(result!['entity1'].properties.score).toBe(10);
    });

    test('should break ties using lexicographic strategy with string values', () => {
      // Two deltas with same timestamp, different string values
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'alice'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta2',
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'bob'
        }]
      }));

      const resolver = new LexicographicTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // 'bob' comes later lexicographically than 'alice', so should win
      expect(result!['entity1'].properties.name).toBe('bob');
    });

    test('should break ties using lexicographic strategy with numeric values (falls back to delta ID)', () => {
      // Two deltas with same timestamp, numeric values (should fall back to delta ID comparison)
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta_a', // Lexicographically earlier
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 100
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta_z', // Lexicographically later
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 200
        }]
      }));

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
      lossless.ingestDelta(new Delta({
        creator: 'user_a',
        host: 'host1',
        id: 'delta_z',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'alice'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user_z',
        host: 'host1',
        id: 'delta_a',
        timeCreated: 1000, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'bob'
        }]
      }));

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
      lossless.ingestDelta(new Delta({
        creator: 'user_z', // Would win in creator tie-breaking
        host: 'host1',
        id: 'delta_z', // Would win in delta ID tie-breaking
        timeCreated: 1000, // Older timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      // Add newer delta with "worse" tie-breaking attributes
      lossless.ingestDelta(new Delta({
        creator: 'user_a', // Would lose in creator tie-breaking
        host: 'host1',
        id: 'delta_a', // Would lose in delta ID tie-breaking
        timeCreated: 2000, // Newer timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const resolver = new CreatorIdTimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Timestamp should take priority over tie-breaking, so newer value (20) wins
      expect(result!['entity1'].properties.score).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    test('should handle single delta correctly', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 42
        }]
      }));

      const resolver = new TimestampResolver(lossless, 'creator-id');
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(42);
    });

    test('should handle mixed value types correctly', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'test'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        id: 'delta2',
        timeCreated: 1001,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 100
        }]
      }));

      const resolver = new TimestampResolver(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('test');
      expect(result!['entity1'].properties.score).toBe(100);
    });
  });
});