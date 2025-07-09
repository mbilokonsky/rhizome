import { createDelta } from '@src/core/delta-builder';
import {
  RhizomeNode,
  Hyperview,
  SumResolver,
  CustomResolver,
  LastWriteWinsPlugin,
  MajorityVotePlugin,
  TimestampResolver
} from "@src";
import Debug from 'debug';
const debug = Debug('rz:test:performance');

describe('Concurrent Write Scenarios', () => {
  let node: RhizomeNode;
  let hyperview: Hyperview;

  beforeEach(() => {
    node = new RhizomeNode();
    hyperview = new Hyperview(node);
  });

  describe('Simultaneous Writes with Same Timestamp', () => {
    test('should handle simultaneous writes using last-write-wins resolver', () => {
      const resolver = new TimestampResolver(hyperview);

      const timestamp = 1000;
      
      // Simulate two writers updating the same property at the exact same time
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withId('delta-a')
        .withTimestamp(timestamp)
        .setProperty('entity1', 'score', 100, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer2', 'host2')
        .withId('delta-b')
        .withTimestamp(timestamp) // Same timestamp
        .setProperty('entity1', 'score', 200, 'collection')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      debug(`Result: ${JSON.stringify(result, null, 2)}`)
      // Should resolve deterministically using the LastWriteWins resolver's tie-breaking algorithm
      expect(typeof result!['entity1'].properties.score).toBe('number');
      expect([100, 200]).toContain(result!['entity1'].properties.score);
    });

    test('should handle simultaneous writes using timestamp resolver with tie-breaking', () => {
      const timestamp = 1000;
      const resolver = new TimestampResolver(hyperview, 'creator-id');

      hyperview.ingestDelta(createDelta('writer_z', 'host1') // Lexicographically later
        .withId('delta-a')
        .withTimestamp(timestamp)
        .setProperty('entity1', 'score', 100, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer_a', 'host2') // Lexicographically earlier
        .withId('delta-b')
        .withTimestamp(timestamp) // Same timestamp
        .setProperty('entity1', 'score', 200, 'collection')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // writer_z should win due to lexicographic ordering
      expect(result!['entity1'].properties.score).toBe(100);
    });

    test('should handle multiple writers with aggregation resolver', () => {
      const resolver = new SumResolver(hyperview, ['points']);

      // Multiple writers add values simultaneously
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'points', 10, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer2', 'host2')
        .withTimestamp(1000) // Same timestamp
        .setProperty('entity1', 'points', 20, 'collection')
        .buildV1()
      );

      // Third writer adds another value
      hyperview.ingestDelta(createDelta('writer3', 'host3')
        .withTimestamp(1000) // Same timestamp
        .setProperty('entity1', 'points', 30, 'collection')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // All values should be summed regardless of timing
      expect(result!['entity1'].properties.points).toBe(60); // 10 + 20 + 30
    });
  });

  describe('Out-of-Order Write Arrival', () => {
    test('should handle writes arriving out of chronological order', () => {
      const resolver = new TimestampResolver(hyperview);

      // Newer delta arrives first
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(2000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 'newer')
        .buildV1()
      );

      // Older delta arrives later
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'value')
        .addPointer('value', 'older')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should still resolve to the chronologically newer value
      expect(result!['entity1'].properties.value).toBe('newer');
    });

    test('should maintain correct aggregation despite out-of-order arrival', () => {
      const resolver = new SumResolver(hyperview, ['score']);

      // Add deltas in reverse chronological order
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(3000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 30)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(1000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 10)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(2000)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 20)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Sum should be correct regardless of arrival order
      expect(result!['entity1'].properties.score).toBe(60); // 10 + 20 + 30
    });
  });

  describe('High-Frequency Concurrent Updates', () => {
    test('should handle rapid concurrent updates to the same entity', () => {
      const resolver = new SumResolver(hyperview, ['counter']);

      const baseTimestamp = 1000;
      const numWriters = 10;
      const writesPerWriter = 5;
      
      // Simulate multiple writers making rapid updates
      for (let writer = 0; writer < numWriters; writer++) {
        for (let write = 0; write < writesPerWriter; write++) {
          hyperview.ingestDelta(createDelta(`writer${writer}`, `host${writer}`)
            .withTimestamp(baseTimestamp + write)
            .addPointer('collection', 'entity1', 'counter')
            .addPointer('counter', 1)
            .buildV1()
          );
        }
      }

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should count all updates
      expect(result!['entity1'].properties.counter).toBe(numWriters * writesPerWriter);
    });

    test('should handle concurrent updates to multiple properties', () => {
      const resolver = new CustomResolver(hyperview, {
        name: new LastWriteWinsPlugin(),
        score: new LastWriteWinsPlugin()
      });

      const timestamp = 1000;
      
      // Writer 1 updates name and score
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(timestamp)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'alice')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(timestamp + 1)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 100)
        .buildV1()
      );

      // Writer 2 updates name and score concurrently
      hyperview.ingestDelta(createDelta('writer2', 'host2')
        .withTimestamp(timestamp + 2)
        .addPointer('collection', 'entity1', 'name')
        .addPointer('name', 'bob')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer2', 'host2')
        .withTimestamp(timestamp + 3)
        .addPointer('collection', 'entity1', 'score')
        .addPointer('score', 200)
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('bob'); // Later timestamp
      expect(result!['entity1'].properties.score).toBe(200); // Later timestamp
    });
  });

  describe('Cross-Entity Concurrent Writes', () => {
    test('should handle concurrent writes to different entities', () => {
      const resolver = new TimestampResolver(hyperview);

      const timestamp = 1000;
      
      // Multiple writers updating different entities simultaneously
      for (let i = 0; i < 5; i++) {
        hyperview.ingestDelta(createDelta(`writer${i}`, `host${i}`)
          .withTimestamp(timestamp)
          .addPointer('collection', `entity${i}`, 'value')
          .addPointer('value', (i + 1) * 10)
          .buildV1()
        );
      }

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(5);
      
      for (let i = 0; i < 5; i++) {
        expect(result![`entity${i}`].properties.value).toBe((i + 1) * 10);
      }
    });

    test('should handle mixed entity and property conflicts', () => {
      const resolver = new CustomResolver(hyperview, {
        votes: new MajorityVotePlugin(),
        status: new LastWriteWinsPlugin()
      });
      const timestamp = 1000;
      
      // Entity1: Multiple writers competing for same property
      hyperview.ingestDelta(createDelta('writer1', 'host1')
        .withTimestamp(timestamp)
        .addPointer('collection', 'entity1', 'votes')
        .addPointer('votes', 'option_a')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer2', 'host2')
        .withTimestamp(timestamp)
        .addPointer('collection', 'entity1', 'votes')
        .addPointer('votes', 'option_a')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('writer3', 'host3')
        .withTimestamp(timestamp)
        .addPointer('collection', 'entity1', 'votes')
        .addPointer('votes', 'option_b')
        .buildV1()
      );

      // Entity2: Single writer, no conflict
      hyperview.ingestDelta(createDelta('writer4', 'host4')
        .withTimestamp(timestamp)
        .addPointer('collection', 'entity2', 'status')
        .addPointer('status', 'active')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.votes).toBe('option_a'); // 2 votes vs 1
      expect(result!['entity2'].properties.status).toBe('active');
    });
  });

  describe('Stress Testing', () => {
    test('should handle large number of concurrent writes efficiently', () => {
      const resolver = new SumResolver(hyperview, ['score']);

      const numEntities = 100;
      const numWritersPerEntity = 10;
      const baseTimestamp = 1000;
      
      // Generate a large number of concurrent writes
      for (let entity = 0; entity < numEntities; entity++) {
        for (let writer = 0; writer < numWritersPerEntity; writer++) {
          hyperview.ingestDelta(createDelta(`writer${writer}`, `host${writer}`)
            .withTimestamp(baseTimestamp + Math.floor(Math.random() * 1000))
            .addPointer('collection', `entity${entity}`, 'score')
            .addPointer('score', Math.floor(Math.random() * 100))
            .buildV1()
          );
        }
      }

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(numEntities);
      
      // Each entity should have a score (sum of all writer contributions)
      for (let entity = 0; entity < numEntities; entity++) {
        expect(result![`entity${entity}`]).toBeDefined();
        expect(typeof result![`entity${entity}`].properties.score).toBe('number');
        expect(result![`entity${entity}`].properties.score).toBeGreaterThan(0);
      }
    });

    test('should maintain consistency under rapid updates and resolution calls', () => {
      const resolver = new SumResolver(hyperview, ['counter']);

      const entityId = 'stress-test-entity';
      let updateCount = 0;
      
      // Add initial deltas
      for (let i = 0; i < 50; i++) {
        hyperview.ingestDelta(createDelta(
          `writer${i % 5}`, 
          `host${i % 3}`
        )
          .withTimestamp(1000 + i)
          .addPointer('collection', entityId, 'counter')
          .addPointer('counter', 1)
          .buildV1()
        );
        updateCount++;
      }

      // Verify initial state
      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result![entityId].properties.counter).toBe(updateCount);
      
      // Add more deltas and verify consistency
      for (let i = 0; i < 25; i++) {
        hyperview.ingestDelta(createDelta('late-writer', 'late-host')
          .withTimestamp(2000 + i)
          .addPointer('collection', entityId, 'counter')
          .addPointer('counter', 2)
          .buildV1()
        );
        updateCount += 2;
        
        // Create a fresh resolver to avoid accumulator caching issues
        const result = resolver.resolve();
        expect(result![entityId].properties.counter).toBe(updateCount);
      }
    });
  });
});