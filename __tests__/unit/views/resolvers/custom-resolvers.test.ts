import {
  RhizomeNode,
  Lossless,
  CustomResolver,
  ResolverPlugin,
  LastWriteWinsPlugin,
  FirstWriteWinsPlugin,
  ConcatenationPlugin,
  MajorityVotePlugin,
  MinPlugin,
  MaxPlugin,
  PropertyTypes,
  CollapsedDelta,
  createDelta
} from "../../../../src";

describe('Custom Resolvers', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Built-in Plugins', () => {
    test('LastWriteWinsPlugin should resolve to most recent value', () => {
      // First delta with earlier timestamp
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'name', 'first', 'collection')
          .buildV1()
      );

      // Second delta with later timestamp (should win)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'name', 'second', 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        name: new LastWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('second');
    });

    test('FirstWriteWinsPlugin should resolve to earliest value', () => {
      // Later delta (should be ignored by FirstWriteWins)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'name', 'second', 'collection')
          .buildV1()
      );

      // Earlier delta (should win with FirstWriteWins)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'name', 'first', 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        name: new FirstWriteWinsPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.name).toBe('first');
    });

    test('ConcatenationPlugin should join string values chronologically', () => {
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

      // Third tag (with timestamp between first and second)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'tags', 'green', 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        tags: new ConcatenationPlugin(' ')
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.tags).toBe('red green blue');
    });

    test('ConcatenationPlugin should handle duplicates', () => {
      // First tag
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'tags', 'red', 'collection')
          .buildV1()
      );

      // Duplicate tag with later timestamp
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'tags', 'red', 'collection') // duplicate
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        tags: new ConcatenationPlugin(',')
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.tags).toBe('red'); // Should not duplicate
    });

    test('MajorityVotePlugin should resolve to most voted value', () => {
      // Add 3 votes for 'red'
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'color', 'red', 'collection')
          .buildV1()
      );

      lossless.ingestDelta(
        createDelta('user2', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'color', 'red', 'collection')
          .buildV1()
      );

      lossless.ingestDelta(
        createDelta('user3', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'color', 'red', 'collection')
          .buildV1()
      );

      // Add 2 votes for 'blue'
      lossless.ingestDelta(
        createDelta('user4', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'color', 'blue', 'collection')
          .buildV1()
      );

      lossless.ingestDelta(
        createDelta('user5', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'color', 'blue', 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        color: new MajorityVotePlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.color).toBe('red'); // 3 votes vs 2 votes
    });

    test('MinPlugin should resolve to minimum numeric value', () => {
      // First score (100)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'score', 100, 'collection')
          .buildV1()
      );

      // Second score (50) - this is the minimum
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'score', 50, 'collection')
          .buildV1()
      );

      // Third score (75)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(3000)
          .setProperty('entity1', 'score', 75, 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        score: new MinPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(50);
    });

    test('MaxPlugin should resolve to maximum numeric value', () => {
      // First score (100)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'score', 100, 'collection')
          .buildV1()
      );

      // Second score (150) - this is the maximum
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'score', 150, 'collection')
          .buildV1()
      );

      // Third score (75)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(3000)
          .setProperty('entity1', 'score', 75, 'collection')
          .buildV1()
      );

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
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'name', 'old_name', 'collection')
          .buildV1()
      );

      // Update name with newer timestamp
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'name', 'new_name', 'collection')
          .buildV1()
      );

      // Add scores
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'score', 100, 'collection')
          .buildV1()
      );

      // Add another score (MinPlugin will pick the smaller one)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'score', 50, 'collection')
          .buildV1()
      );

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
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'name', 'test', 'collection')
          .buildV1()
      );

      // Entity2 has non-configured property
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity2', 'other_prop', 'value', 'collection')
          .buildV1()
      );

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

      // First update
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'updates', 'first', 'collection')
          .buildV1()
      );

      // Second update
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'updates', 'second', 'collection')
          .buildV1()
      );

      // Third update
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(3000)
          .setProperty('entity1', 'updates', 'third', 'collection')
          .buildV1()
      );

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

      // First score (10)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'score', 10, 'collection')
          .buildV1()
      );

      // Second score (20)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(2000)
          .setProperty('entity1', 'score', 20, 'collection')
          .buildV1()
      );

      // Third score (30)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(3000)
          .setProperty('entity1', 'score', 30, 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        score: new RunningAveragePlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['entity1'].properties.score).toBe(20); // (10 + 20 + 30) / 3
    });
  });

  describe('Plugin Communication', () => {
    test('plugins should be able to access each other\'s states', () => {
      // Create a plugin that depends on another property's value
      class DependentPlugin implements ResolverPlugin<{ value?: string }> {
        name = 'dependent';
        
        initialize() {
          return { value: 'initial' };
        }
        
        update(
          currentState: { value?: string },
          _newValue: PropertyTypes,
          _delta: CollapsedDelta,
          context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
        ) {
          // This plugin's value depends on the 'source' property's resolved value
          const sourceValue = context?.resolvedValues['source'];
          return {
            value: typeof sourceValue === 'string' ? `Processed: ${sourceValue}` : currentState.value
          };
        }
        
        resolve(
          state: { value?: string },
          context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
        ): PropertyTypes | undefined {
          // In resolve, we can also check the context if needed
          const sourceValue = context?.resolvedValues['source'];
          if (typeof sourceValue === 'string' && state.value === 'initial') {
            return `Processed: ${sourceValue}`;
          }
          return state.value;
        }
      }

      // Create a resolver with both plugins
      const resolver = new CustomResolver(lossless, {
        source: new LastWriteWinsPlugin(),
        dependent: new DependentPlugin()
      });

      // First, set up the source property
      const sourceDelta = createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'source', 'original', 'collection')
        .buildV1();
      
      lossless.ingestDelta(sourceDelta);

      // Then set up the dependent property
      const dependentDelta = createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'dependent', 'initial', 'collection')
        .buildV1();
      
      lossless.ingestDelta(dependentDelta);

      // Get the first result
      const result = resolver.resolve();
      expect(result).toBeDefined();
      
      // The dependent plugin should see the source value
      expect(result!['entity1'].properties).toMatchObject({
        source: 'original',
        dependent: expect.stringContaining('Processed: original')
      });

      // Create a new delta that updates the source property
      const updateDelta = createDelta('user1', 'host1')
        .withTimestamp(3000)
        .setProperty('entity1', 'source', 'updated', 'collection')
        .buildV1();
      
      // Ingest the update delta
      lossless.ingestDelta(updateDelta);

      // Get the updated result
      const updatedResult = resolver.resolve();
      expect(updatedResult).toBeDefined();
      
      // The dependent plugin should see the updated source value
      expect(updatedResult!['entity1'].properties).toMatchObject({
        source: 'updated',
        dependent: expect.stringContaining('Processed: updated')
      });
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
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('entity1', 'score', 'not_a_number', 'collection')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        score: new MinPlugin() // Expects numeric values
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      // The entity might not be present in the result if no properties were resolved
      if (result!['entity1']) {
        expect(result!['entity1'].properties).toBeDefined();
        expect(result!['entity1'].properties).not.toHaveProperty('score');
      }
    });
  });
});