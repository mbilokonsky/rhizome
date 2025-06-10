import {
  RhizomeNode,
  Lossless,
  Delta,
  AggregationResolver,
  MinResolver,
  MaxResolver,
  SumResolver,
  AverageResolver,
  CountResolver,
  AggregationType
} from "../src";

describe('Aggregation Resolvers', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Basic Aggregation', () => {
    test('should aggregate numbers using min resolver', () => {
      // Add first entity with score 10
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      // Add second entity with score 5
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity2", 
          targetContext: "score"
        }, {
          localContext: "score",
          target: 5
        }]
      }));

      // Add third entity with score 15
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity3",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 15
        }]
      }));

      const minResolver = new MinResolver(lossless, ['score']);
      const result = minResolver.resolve();
      
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(3);
      expect(result!['entity1'].properties.score).toBe(10);
      expect(result!['entity2'].properties.score).toBe(5);
      expect(result!['entity3'].properties.score).toBe(15);
    });

    test('should aggregate numbers using max resolver', () => {
      // Add deltas for entities
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
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
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 5
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity3",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 15
        }]
      }));

      const maxResolver = new MaxResolver(lossless, ['score']);
      const result = maxResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(10);
      expect(result!['entity2'].properties.score).toBe(5);
      expect(result!['entity3'].properties.score).toBe(15);
    });

    test('should aggregate numbers using sum resolver', () => {
      // Add first value for entity1
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 10
        }]
      }));

      // Add second value for entity1 (should sum)
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 20
        }]
      }));

      // Add value for entity2
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 5
        }]
      }));

      const sumResolver = new SumResolver(lossless, ['value']);
      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(30); // 10 + 20
      expect(result!['entity2'].properties.value).toBe(5);
    });

    test('should aggregate numbers using average resolver', () => {
      // Add multiple values for entity1
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
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
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      // Single value for entity2
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 30
        }]
      }));

      const avgResolver = new AverageResolver(lossless, ['score']);
      const result = avgResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(15); // (10 + 20) / 2
      expect(result!['entity2'].properties.score).toBe(30);
    });

    test('should count values using count resolver', () => {
      // Add multiple visit deltas for entity1
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "visits"
        }, {
          localContext: "visits",
          target: 1
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "visits"
        }, {
          localContext: "visits",
          target: 1
        }]
      }));

      // Single visit for entity2
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "visits"
        }, {
          localContext: "visits",
          target: 1
        }]
      }));

      const countResolver = new CountResolver(lossless, ['visits']);
      const result = countResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.visits).toBe(2); // count of 2 deltas
      expect(result!['entity2'].properties.visits).toBe(1); // count of 1 delta
    });
  });

  describe('Custom Aggregation Configuration', () => {
    test('should handle mixed aggregation types', () => {
      // Add first set of values
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "min_val"
        }, {
          localContext: "min_val",
          target: 10
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "max_val"
        }, {
          localContext: "max_val",
          target: 5
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "sum_val"
        }, {
          localContext: "sum_val",
          target: 3
        }]
      }));

      // Add second set of values
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "min_val"
        }, {
          localContext: "min_val",
          target: 5
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "max_val"
        }, {
          localContext: "max_val",
          target: 15
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "sum_val"
        }, {
          localContext: "sum_val",
          target: 7
        }]
      }));

      const resolver = new AggregationResolver(lossless, {
        min_val: 'min' as AggregationType,
        max_val: 'max' as AggregationType,
        sum_val: 'sum' as AggregationType
      });
      
      const result = resolver.resolve();
      expect(result).toBeDefined();
      
      const entity = result!['entity1'];
      expect(entity.properties.min_val).toBe(5);  // min of 10, 5
      expect(entity.properties.max_val).toBe(15); // max of 5, 15
      expect(entity.properties.sum_val).toBe(10); // sum of 3, 7
    });

    test('should ignore non-numeric values', () => {
      // Add numeric value
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 10
        }]
      }));

      // Add non-numeric value (string)
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'test'
        }]
      }));

      // Add another numeric value
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 20
        }]
      }));

      const sumResolver = new SumResolver(lossless, ['score', 'name']);
      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      const entity = result!['entity1'];
      expect(entity.properties.score).toBe(30); // sum of 10, 20
      expect(entity.properties.name).toBe(0);   // ignored non-numeric, defaults to 0
    });

    test('should handle empty value arrays', () => {
      // Create entity with non-aggregated property
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'test'
        }]
      }));

      const sumResolver = new SumResolver(lossless, ['score']);
      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      // Should not have entity1 since no 'score' property was found
      expect(result!['entity1']).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle single value aggregations', () => {
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 42
        }]
      }));

      const avgResolver = new AverageResolver(lossless, ['value']);
      const result = avgResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(42);
    });

    test('should handle zero values', () => {
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 0
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 10
        }]
      }));

      const sumResolver = new SumResolver(lossless, ['value']);
      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(10); // 0 + 10
    });

    test('should handle negative values', () => {
      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: -5
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'test',
        host: 'host1',
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "value"
        }, {
          localContext: "value",
          target: 10
        }]
      }));

      const minResolver = new MinResolver(lossless, ['value']);
      const result = minResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(-5);
    });
  });
});