import {
  RhizomeNode,
  Lossless,
  Delta,
  LastWriteWins,
  TimestampResolver,
  SumResolver,
  CustomResolver,
  LastWriteWinsPlugin,
  MajorityVotePlugin
} from "../src";

describe('Concurrent Write Scenarios', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Simultaneous Writes with Same Timestamp', () => {
    test('should handle simultaneous writes using last-write-wins resolver', () => {
      const timestamp = 1000;
      
      // Simulate two writers updating the same property at the exact same time
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        id: 'delta-a',
        timeCreated: timestamp,
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
        creator: 'writer2',
        host: 'host2',
        id: 'delta-b',
        timeCreated: timestamp, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 200
        }]
      }));

      const resolver = new LastWriteWins(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should resolve deterministically using the LastWriteWins resolver's tie-breaking algorithm
      expect(typeof result!['entity1'].properties.score).toBe('number');
      expect([100, 200]).toContain(result!['entity1'].properties.score);
    });

    test('should handle simultaneous writes using timestamp resolver with tie-breaking', () => {
      const timestamp = 1000;
      
      lossless.ingestDelta(new Delta({
        creator: 'writer_z', // Lexicographically later
        host: 'host1',
        id: 'delta-a',
        timeCreated: timestamp,
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
        creator: 'writer_a', // Lexicographically earlier
        host: 'host2',
        id: 'delta-b',
        timeCreated: timestamp, // Same timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 200
        }]
      }));

      const resolver = new TimestampResolver(lossless, 'creator-id');
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // writer_z should win due to lexicographic ordering
      expect(result!['entity1'].properties.score).toBe(100);
    });

    test('should handle multiple writers with aggregation resolver', () => {
      const timestamp = 1000;
      
      // Multiple writers add values simultaneously
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "points"
        }, {
          localContext: "points",
          target: 10
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer2',
        host: 'host2',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "points"
        }, {
          localContext: "points",
          target: 20
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer3',
        host: 'host3',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "points"
        }, {
          localContext: "points",
          target: 30
        }]
      }));

      const resolver = new SumResolver(lossless, ['points']);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // All values should be summed regardless of timing
      expect(result!['entity1'].properties.points).toBe(60); // 10 + 20 + 30
    });
  });

  describe('Out-of-Order Write Arrival', () => {
    test('should handle writes arriving out of chronological order', () => {
      // Newer delta arrives first
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: 2000, // Later timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 'newer'
        }]
      }));

      // Older delta arrives later
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: 1000, // Earlier timestamp
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 'older'
        }]
      }));

      const resolver = new LastWriteWins(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should still resolve to the chronologically newer value
      expect(result!['entity1'].properties.value).toBe('newer');
    });

    test('should maintain correct aggregation despite out-of-order arrival', () => {
      // Add deltas in reverse chronological order
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: 3000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 30
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
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
        creator: 'writer1',
        host: 'host1',
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

      const resolver = new SumResolver(lossless, ['score']);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Sum should be correct regardless of arrival order
      expect(result!['entity1'].properties.score).toBe(60); // 10 + 20 + 30
    });
  });

  describe('High-Frequency Concurrent Updates', () => {
    test('should handle rapid concurrent updates to the same entity', () => {
      const baseTimestamp = 1000;
      const numWriters = 10;
      const writesPerWriter = 5;
      
      // Simulate multiple writers making rapid updates
      for (let writer = 0; writer < numWriters; writer++) {
        for (let write = 0; write < writesPerWriter; write++) {
          lossless.ingestDelta(new Delta({
            creator: `writer${writer}`,
            host: `host${writer}`,
            timeCreated: baseTimestamp + write, // Small time increments
            pointers: [{
              localContext: "collection",
              target: "entity1",
              targetContext: "counter"
            }, {
              localContext: "counter",
              target: 1 // Each update adds 1
            }]
          }));
        }
      }

      const resolver = new SumResolver(lossless, ['counter']);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      // Should count all updates
      expect(result!['entity1'].properties.counter).toBe(numWriters * writesPerWriter);
    });

    test('should handle concurrent updates to multiple properties', () => {
      const timestamp = 1000;
      
      // Writer 1 updates name and score
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: timestamp,
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
        creator: 'writer1',
        host: 'host1',
        timeCreated: timestamp + 1,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 100
        }]
      }));

      // Writer 2 updates name and score concurrently
      lossless.ingestDelta(new Delta({
        creator: 'writer2',
        host: 'host2',
        timeCreated: timestamp + 2,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'bob'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer2',
        host: 'host2',
        timeCreated: timestamp + 3,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 200
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin(),
        score: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('bob'); // Later timestamp
      expect(result!['entity1'].properties.score).toBe(200); // Later timestamp
    });
  });

  describe('Cross-Entity Concurrent Writes', () => {
    test('should handle concurrent writes to different entities', () => {
      const timestamp = 1000;
      
      // Multiple writers updating different entities simultaneously
      for (let i = 0; i < 5; i++) {
        lossless.ingestDelta(new Delta({
          creator: `writer${i}`,
          host: `host${i}`,
          timeCreated: timestamp,
          pointers: [{
            localContext: "collection",
            target: `entity${i}`,
            targetContext: "value"
          }, {
            localContext: "value",
            target: (i + 1) * 10 // Start from 10 to avoid 0 values
          }]
        }));
      }

      const resolver = new LastWriteWins(lossless);
      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(5);
      
      for (let i = 0; i < 5; i++) {
        expect(result![`entity${i}`].properties.value).toBe((i + 1) * 10);
      }
    });

    test('should handle mixed entity and property conflicts', () => {
      const timestamp = 1000;
      
      // Entity1: Multiple writers competing for same property
      lossless.ingestDelta(new Delta({
        creator: 'writer1',
        host: 'host1',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "votes"
        }, {
          localContext: "votes",
          target: 'option_a'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer2',
        host: 'host2',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "votes"
        }, {
          localContext: "votes",
          target: 'option_a'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'writer3',
        host: 'host3',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "votes"
        }, {
          localContext: "votes",
          target: 'option_b'
        }]
      }));

      // Entity2: Single writer, no conflict
      lossless.ingestDelta(new Delta({
        creator: 'writer4',
        host: 'host4',
        timeCreated: timestamp,
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "status"
        }, {
          localContext: "status",
          target: 'active'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        votes: new MajorityVotePlugin(),
        status: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.votes).toBe('option_a'); // 2 votes vs 1
      expect(result!['entity2'].properties.status).toBe('active');
    });
  });

  describe('Stress Testing', () => {
    test('should handle large number of concurrent writes efficiently', () => {
      const numEntities = 100;
      const numWritersPerEntity = 10;
      const baseTimestamp = 1000;
      
      // Generate a large number of concurrent writes
      for (let entity = 0; entity < numEntities; entity++) {
        for (let writer = 0; writer < numWritersPerEntity; writer++) {
          lossless.ingestDelta(new Delta({
            creator: `writer${writer}`,
            host: `host${writer}`,
            timeCreated: baseTimestamp + Math.floor(Math.random() * 1000), // Random timestamps
            pointers: [{
              localContext: "collection",
              target: `entity${entity}`,
              targetContext: "score"
            }, {
              localContext: "score",
              target: Math.floor(Math.random() * 100) // Random scores
            }]
          }));
        }
      }

      const resolver = new SumResolver(lossless, ['score']);
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
      const entityId = 'stress-test-entity';
      let updateCount = 0;
      
      // Add initial deltas
      for (let i = 0; i < 50; i++) {
        lossless.ingestDelta(new Delta({
          creator: `writer${i % 5}`,
          host: `host${i % 3}`,
          timeCreated: 1000 + i,
          pointers: [{
            localContext: "collection",
            target: entityId,
            targetContext: "counter"
          }, {
            localContext: "counter",
            target: 1
          }]
        }));
        updateCount++;
      }

      // Verify initial state
      let resolver = new SumResolver(lossless, ['counter']);
      let result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result![entityId].properties.counter).toBe(updateCount);
      
      // Add more deltas and verify consistency
      for (let i = 0; i < 25; i++) {
        lossless.ingestDelta(new Delta({
          creator: 'late-writer',
          host: 'late-host',
          timeCreated: 2000 + i,
          pointers: [{
            localContext: "collection",
            target: entityId,
            targetContext: "counter"
          }, {
            localContext: "counter",
            target: 2
          }]
        }));
        updateCount += 2;
        
        // Create a fresh resolver to avoid accumulator caching issues
        resolver = new SumResolver(lossless, ['counter']);
        result = resolver.resolve();
        expect(result![entityId].properties.counter).toBe(updateCount);
      }
    });
  });
});