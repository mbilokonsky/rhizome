import {
  RhizomeNode,
  Lossless,
  Delta,
  CustomResolver,
  ResolverPlugin,
  LastWriteWinsPlugin,
  FirstWriteWinsPlugin,
  ConcatenationPlugin,
  MajorityVotePlugin,
  MinPlugin,
  MaxPlugin,
  PropertyTypes,
  CollapsedDelta
} from "../src";

describe('Custom Resolvers', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Built-in Plugins', () => {
    test('LastWriteWinsPlugin should resolve to most recent value', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'first'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'second'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('second');
    });

    test('FirstWriteWinsPlugin should resolve to earliest value', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'second'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'first'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        name: new FirstWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('first');
    });

    test('ConcatenationPlugin should join string values chronologically', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "tags"
        }, {
          localContext: "tags",
          target: 'red'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 3000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "tags"
        }, {
          localContext: "tags",
          target: 'blue'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "tags"
        }, {
          localContext: "tags",
          target: 'green'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        tags: new ConcatenationPlugin(' ')
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.tags).toBe('red green blue');
    });

    test('ConcatenationPlugin should handle duplicates', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "tags"
        }, {
          localContext: "tags",
          target: 'red'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "tags"
        }, {
          localContext: "tags",
          target: 'red' // duplicate
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        tags: new ConcatenationPlugin(',')
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.tags).toBe('red'); // Should not duplicate
    });

    test('MajorityVotePlugin should resolve to most voted value', () => {
      // Add 3 votes for 'red'
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "color"
        }, {
          localContext: "color",
          target: 'red'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user2',
        host: 'host1',
        timeCreated: 1001,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "color"
        }, {
          localContext: "color",
          target: 'red'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user3',
        host: 'host1',
        timeCreated: 1002,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "color"
        }, {
          localContext: "color",
          target: 'red'
        }]
      }));

      // Add 2 votes for 'blue'
      lossless.ingestDelta(new Delta({
        creator: 'user4',
        host: 'host1',
        timeCreated: 1003,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "color"
        }, {
          localContext: "color",
          target: 'blue'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user5',
        host: 'host1',
        timeCreated: 1004,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "color"
        }, {
          localContext: "color",
          target: 'blue'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        color: new MajorityVotePlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.color).toBe('red'); // 3 votes vs 2 votes
    });

    test('MinPlugin should resolve to minimum numeric value', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
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
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 50
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 3000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 75
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        score: new MinPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(50);
    });

    test('MaxPlugin should resolve to maximum numeric value', () => {
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
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
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 150
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 3000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 75
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        score: new MaxPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(150);
    });
  });

  describe('Mixed Plugin Configurations', () => {
    test('should handle different plugins for different properties', () => {
      // Add name with different timestamps
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'old_name'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "name"
        }, {
          localContext: "name",
          target: 'new_name'
        }]
      }));

      // Add scores
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
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
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 50
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin(), // Should resolve to 'new_name'
        score: new MinPlugin() // Should resolve to 50
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('new_name');
      expect(result!['entity1'].properties.score).toBe(50);
    });

    test('should only include entities with configured properties', () => {
      // Entity1 has configured property
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
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

      // Entity2 has non-configured property
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity2",
          targetContext: "other"
        }, {
          localContext: "other",
          target: 'value'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1']).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('test');
      expect(result!['entity2']).toBeUndefined(); // No configured properties
    });
  });

  describe('Custom Plugin Implementation', () => {
    test('should work with custom plugin', () => {
      // Custom plugin that counts the number of updates
      class CountPlugin implements ResolverPlugin<{count: number}> {
        name = 'count';

        initialize() {
          return {count: 0};
        }

        update(currentState: {count: number}, _newValue: PropertyTypes, _delta: CollapsedDelta) {
          return {count: currentState.count + 1};
        }

        resolve(state: {count: number}): PropertyTypes {
          return state.count;
        }
      }

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "updates"
        }, {
          localContext: "updates",
          target: 'first'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 2000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "updates"
        }, {
          localContext: "updates",
          target: 'second'
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 3000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "updates"
        }, {
          localContext: "updates",
          target: 'third'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        updates: new CountPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.updates).toBe(3);
    });

    test('should work with stateful custom plugin', () => {
      // Custom plugin that calculates running average
      class RunningAveragePlugin implements ResolverPlugin<{sum: number, count: number}> {
        name = 'running-average';

        initialize() {
          return {sum: 0, count: 0};
        }

        update(currentState: {sum: number, count: number}, newValue: PropertyTypes, _delta: CollapsedDelta) {
          if (typeof newValue === 'number') {
            return {
              sum: currentState.sum + newValue,
              count: currentState.count + 1
            };
          }
          return currentState;
        }

        resolve(state: {sum: number, count: number}): PropertyTypes {
          return state.count > 0 ? state.sum / state.count : 0;
        }
      }

      lossless.ingestDelta(new Delta({
        creator: 'user1',
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
        creator: 'user1',
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

      lossless.ingestDelta(new Delta({
        creator: 'user1',
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

      const resolver = new CustomResolver(lossless, {
        score: new RunningAveragePlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(20); // (10 + 20 + 30) / 3
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty delta sets', () => {
      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toHaveLength(0);
    });

    test('should handle non-matching property types gracefully', () => {
      // Add string value to numeric plugin
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: 1000,
        pointers: [{
          localContext: "collection",
          target: "entity1",
          targetContext: "score"
        }, {
          localContext: "score",
          target: 'not_a_number'
        }]
      }));

      const resolver = new CustomResolver(lossless, {
        score: new MinPlugin() // Expects numeric values
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(0); // Default value
    });
  });
});