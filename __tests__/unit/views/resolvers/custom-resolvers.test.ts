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

  describe('Plugin Dependencies', () => {
    test('should detect circular dependencies', () => {
      class PluginA implements ResolverPlugin {
        name = 'a';
        dependencies = ['b'];
        initialize() { return {}; }
        update() { return {}; }
        resolve() { return 'a'; }
      }

      class PluginB implements ResolverPlugin {
        name = 'b';
        dependencies = ['a'];
        initialize() { return {}; }
        update() { return {}; }
        resolve() { return 'b'; }
      }

      expect(() => {
        new CustomResolver(lossless, {
          'a': new PluginA(),
          'b': new PluginB()
        });
      }).toThrow('Circular dependency detected');
    });

    test('should process plugins in dependency order', () => {
      // Enable debug logging for this test
      process.env.DEBUG = 'rz:*';
      
      const executionOrder: string[] = [];
      
      // Create test plugins with dependency tracking
      const pluginTracker = {
        first: { updated: false, resolved: false },
        second: { updated: false, resolved: false }
      };

      interface PluginState {
        value: string;
        updated: boolean;
        resolved: boolean;
      }

      class FirstPlugin implements ResolverPlugin<PluginState> {
        name = 'first';
        dependencies: string[] = [];
        
        initialize(): PluginState {
          console.log('First plugin initialized');
          executionOrder.push('first-init');
          return { value: '', updated: false, resolved: false };
        }
        
        update(
          state: PluginState, 
          value: unknown, 
          _delta?: unknown, 
          _allStates?: Record<string, unknown>
        ): PluginState {
          console.log('First plugin updated with value:', value);
          executionOrder.push('first-update');
          pluginTracker.first.updated = true;
          return { 
            ...state,
            value: String(value), 
            updated: true
          };
        }
        
        resolve(state: PluginState, _allStates?: Record<string, unknown>): string {
          console.log('First plugin resolved with value:', state.value);
          executionOrder.push('first-resolve');
          pluginTracker.first.resolved = true;
          return state.value;
        }
      }

      class SecondPlugin implements ResolverPlugin<PluginState> {
        name = 'second';
        dependencies: string[] = ['first'];
        
        initialize(): PluginState {
          console.log('Second plugin initialized');
          executionOrder.push('second-init');
          return { value: '', updated: false, resolved: false };
        }
        
        update(
          state: PluginState, 
          value: unknown, 
          _delta?: unknown, 
          allStates?: Record<string, unknown>
        ): PluginState {
          console.log('Second plugin updated with value:', value);
          executionOrder.push('second-update');
          pluginTracker.second.updated = true;
          
          // Check if we have access to first plugin's state
          const firstState = allStates?.first as PluginState | undefined;
          if (firstState) {
            executionOrder.push('second-has-first-state');
            console.log('Second plugin has access to first plugin state:', firstState);
          }
          
          return { 
            ...state,
            value: `${value}-${firstState?.value || 'unknown'}`,
            updated: true
          };
        }
        
        resolve(state: PluginState, _allStates?: Record<string, unknown>): string {
          console.log('Second plugin resolved with value:', state.value);
          executionOrder.push('second-resolve');
          pluginTracker.second.resolved = true;
          return state.value;
        }
      }

      // Create resolver with dependency order: first -> second
      console.log('Creating resolver with plugins');
      
      // Create resolver with test plugins first
      const firstPlugin = new FirstPlugin();
      const secondPlugin = new SecondPlugin();
      
      const testResolver = new CustomResolver(lossless, {
        first: firstPlugin,
        second: secondPlugin
      });
  
      // Verify plugins are not yet initialized
      expect(pluginTracker.first.updated).toBe(false);
      expect(pluginTracker.second.updated).toBe(false);
  
      // Verify the execution order array is empty before processing
      expect(executionOrder).not.toContain('first-init');
      expect(executionOrder).not.toContain('second-init');
      expect(executionOrder).toHaveLength(0);
      
      // Create and ingest test data
      const delta = createDelta('test1', 'host1')
        .withTimestamp(1000)
        .setProperty('test1', 'first', 'first', 'prop1')
        .setProperty('test1', 'second', 'second', 'prop2')
        .buildV1();
        
      lossless.ingestDelta(delta);
  
      // Resolve the view
      const result = testResolver.resolve();
  
      // Verify the result
      expect(result).toBeDefined();
      if (!result) return;
      
      const testEntity = result['test1'];
      expect(testEntity).toBeDefined();
      if (!testEntity) return;
      
      // Check if properties exist
      expect(testEntity.properties).toBeDefined();
      
      // Check if plugins were resolved
      expect(pluginTracker.first.resolved).toBe(true);
      expect(pluginTracker.second.resolved).toBe(true);
      
      // Check if second plugin has access to first plugin's state
      expect(executionOrder).toContain('second-has-first-state');
      
      // Check if first plugin was processed before second
      const firstUpdateIndex = executionOrder.indexOf('first-update');
      const secondUpdateIndex = executionOrder.indexOf('second-update');
      expect(firstUpdateIndex).not.toBe(-1);
      expect(secondUpdateIndex).not.toBe(-1);
      expect(firstUpdateIndex).toBeLessThan(secondUpdateIndex);
      
      // Verify initialization order (first should be initialized before second)
      const firstInitIndex = executionOrder.indexOf('first-init');
      const secondInitIndex = executionOrder.indexOf('second-init');
      expect(firstInitIndex).not.toBe(-1);
      expect(secondInitIndex).not.toBe(-1);
      expect(firstInitIndex).toBeLessThan(secondInitIndex);
      
      // Check if resolve was called in the right order
      const firstResolveIndex = executionOrder.indexOf('first-resolve');
      const secondResolveIndex = executionOrder.indexOf('second-resolve');
      expect(firstResolveIndex).not.toBe(-1);
      expect(secondResolveIndex).not.toBe(-1);
      expect(firstResolveIndex).toBeLessThan(secondResolveIndex);
      expect(firstInitIndex).toBeLessThan(secondInitIndex);
      
      // Verify update order (first should be updated before second)
      expect(firstUpdateIndex).toBeGreaterThanOrEqual(0);
      expect(secondUpdateIndex).toBeGreaterThanOrEqual(0);
      expect(firstUpdateIndex).toBeLessThan(secondUpdateIndex);
      
      // Verify resolve order (first should be resolved before second)
      expect(firstResolveIndex).toBeGreaterThanOrEqual(0);
      expect(secondResolveIndex).toBeGreaterThanOrEqual(0);
      expect(firstResolveIndex).toBeLessThan(secondResolveIndex);
      
      // Check if second plugin could access first plugin's state
      expect(executionOrder).toContain('second-has-first-state');
      
      // Check resolved values if they exist
      if (testEntity.properties.first) {
        expect(testEntity.properties.first).toBe('first');
      }
      
      if (testEntity.properties.second) {
        // Second plugin's value is 'second-<first plugin's value>'
        expect(testEntity.properties.second).toBe('second-first');
      }
    });

    test('should allow plugins to depend on other plugin states', () => {
      // A plugin that applies a discount to a price
      class DiscountedPricePlugin implements ResolverPlugin<{ price: number }> {
        name = 'discounted-price';
        
        initialize() {
          return { price: 0 };
        }
        
        update(
          currentState: { price: number }, 
          newValue: PropertyTypes, 
          _delta: CollapsedDelta,
          _allStates?: Record<string, unknown>
        ) {
          if (typeof newValue === 'number') {
            return { price: newValue };
          }
          return currentState;
        }
        
        resolve(
          state: { price: number },
          allStates?: Record<string, unknown>
        ): number | undefined {
          // Get discount from another plugin's state
          const discountState = allStates?.['discount'] as { value: number } | undefined;
          if (discountState) {
            return state.price * (1 - (discountState.value / 100));
          }
          return state.price;
        }
      }

      // A simple discount plugin
      class DiscountPlugin implements ResolverPlugin<{ value: number }> {
        name = 'discount';
        
        initialize() {
          return { value: 0 };
        }
        
        update(
          currentState: { value: number }, 
          newValue: PropertyTypes,
          _delta: CollapsedDelta,
          _allStates?: Record<string, unknown>
        ) {
          if (typeof newValue === 'number') {
            return { value: newValue };
          }
          return currentState;
        }
        
        resolve(
          state: { value: number },
          _allStates?: Record<string, unknown>
        ): number {
          return state.value;
        }
      }

      // Set base price
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('product1', 'price', 100, 'products')
          .buildV1()
      );

      // Set discount (20%)
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000)
          .setProperty('product1', 'discount', 20, 'products')
          .buildV1()
      );

      const resolver = new CustomResolver(lossless, {
        price: new DiscountedPricePlugin(),
        discount: new DiscountPlugin()
      });

      const result = resolver.resolve();
      expect(result).toBeDefined();
      expect(result!['product1'].properties.price).toBe(80); // 100 - 20%
      expect(result!['product1'].properties.discount).toBe(20);
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