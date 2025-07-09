import {
  RhizomeNode,
  Hyperview,
  AggregationResolver,
  MinResolver,
  MaxResolver,
  SumResolver,
  AverageResolver,
  CountResolver,
  AggregationType
} from "@src";
import { createDelta } from "@src/core/delta-builder";

describe('Aggregation Resolvers', () => {
  let node: RhizomeNode;
  let hyperview: Hyperview;

  beforeEach(() => {
    node = new RhizomeNode();
    hyperview = new Hyperview(node);
  });

  describe('Basic Aggregation', () => {
    test('should aggregate numbers using min resolver', () => {
      const minResolver = new MinResolver(hyperview, ['score']);

      // Add first entity with score 10
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 10, 'collection')
        .buildV1()
      );

      // Add second entity with score 5
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity2', 'score', 5, 'collection')
        .buildV1()
      );

      // Add third entity with score 15
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity3', 'score', 15, 'collection')
        .buildV1()
      );

      const result = minResolver.resolve();
      
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(3);
      expect(result!['entity1'].properties.score).toBe(10);
      expect(result!['entity2'].properties.score).toBe(5);
      expect(result!['entity3'].properties.score).toBe(15);
    });

    test('should aggregate numbers using max resolver', () => {
      const maxResolver = new MaxResolver(hyperview, ['score']);

      // Add deltas for entities
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 10, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity2', 'score', 5, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity3', 'score', 15, 'collection')
        .buildV1()
      );

      const result = maxResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(10);
      expect(result!['entity2'].properties.score).toBe(5);
      expect(result!['entity3'].properties.score).toBe(15);
    });

    test('should aggregate numbers using sum resolver', () => {
      const sumResolver = new SumResolver(hyperview, ['value']);

      // Add first value for entity1
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 10, 'collection')
        .buildV1()
      );

      // Add second value for entity1 (should sum)
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 20, 'collection')
        .buildV1()
      );

      // Add value for entity2
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity2', 'value', 5, 'collection')
        .buildV1()
      );

      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(30); // 10 + 20
      expect(result!['entity2'].properties.value).toBe(5);
    });

    test('should aggregate numbers using average resolver', () => {
      const avgResolver = new AverageResolver(hyperview, ['score']);

      // Add multiple scores for entity1
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 10, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 20, 'collection')
        .buildV1()
      );

      // Single value for entity2
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity2', 'score', 30, 'collection')
        .buildV1()
      );

      const result = avgResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(15); // (10 + 20) / 2
      expect(result!['entity2'].properties.score).toBe(30);
    });

    test('should count values using count resolver', () => {
      const countResolver = new CountResolver(hyperview, ['visits']);

      // Add multiple visit deltas for entity1
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'visits', 1, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'visits', 1, 'collection')
        .buildV1()
      );

      // Single visit for entity2
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity2', 'visits', 1, 'collection')
        .buildV1()
      );

      const result = countResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.visits).toBe(2); // count of 2 deltas
      expect(result!['entity2'].properties.visits).toBe(1); // count of 1 delta
    });
  });

  describe('Custom Aggregation Configuration', () => {
    test('should handle mixed aggregation types', () => {
      const resolver = new AggregationResolver(hyperview, {
        min_val: 'min' as AggregationType,
        max_val: 'max' as AggregationType,
        sum_val: 'sum' as AggregationType
      }); 
      
      // Add first set of values
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'min_val', 10, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'max_val', 5, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'sum_val', 3, 'collection')
        .buildV1()
      );

      // Add second set of values
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'min_val', 5, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'max_val', 15, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'sum_val', 7, 'collection')
        .buildV1()
      );

      
      const result = resolver.resolve();
      expect(result).toBeDefined();
      
      const entity = result!['entity1'];
      expect(entity.properties.min_val).toBe(5);  // min of 10, 5
      expect(entity.properties.max_val).toBe(15); // max of 5, 15
      expect(entity.properties.sum_val).toBe(10); // sum of 3, 7
    });

    test('should ignore non-numeric values', () => {
      const resolver = new AggregationResolver(hyperview, {
        score: 'sum' as AggregationType,
        name: 'count' as AggregationType
      });
      
      // Add numeric value
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 10, 'collection')
        .buildV1()
      );

      // Add non-numeric value (string)
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'name', 'test', 'collection')
        .buildV1()
      );

      // Add another numeric value
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'score', 20, 'collection')
        .buildV1()
      );

      const result = resolver.resolve();
      
      expect(result).toBeDefined();
      const entity = result!['entity1'];
      expect(entity.properties.score).toBe(30); // sum of 10, 20
      expect(entity.properties.name).toBe(0);   // ignored non-numeric, defaults to 0
    });

    test('should handle empty value arrays', () => {
      const sumResolver = new SumResolver(hyperview, ['score']);
      // Create entity with non-aggregated property
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'name', 'test', 'collection')
        .buildV1()
      );

      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      // Should not have entity1 since no 'score' property was found
      expect(result!['entity1']).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle single value aggregations', () => {
      const avgResolver = new AverageResolver(hyperview, ['value']);

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 42, 'collection')
        .buildV1()
      );

      const result = avgResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(42);
    });

    test('should handle zero values', () => {
      const sumResolver = new SumResolver(hyperview, ['value']);
      
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 0, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 10, 'collection')
        .buildV1()
      );

      const result = sumResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(10); // 0 + 10
    });

    test('should handle negative values', () => {
      const minResolver = new MinResolver(hyperview, ['value']);
      
      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', -5, 'collection')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('test', 'host1')
        .setProperty('entity1', 'value', 10, 'collection')
        .buildV1()
      );

      const result = minResolver.resolve();
      
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.value).toBe(-5);
    });
  });
});