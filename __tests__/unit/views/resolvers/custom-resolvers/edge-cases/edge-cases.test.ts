import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta, CollapsedDelta } from '@src';
import { 
  CustomResolver, 
  DependencyStates, 
  ResolverPlugin 
} from '@src/views/resolvers/custom-resolvers';
import { PropertyTypes } from '@src/core/types';

describe('Edge Cases', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should handle null values', () => {
    // Create a type-safe plugin that handles null/undefined values
    class NullSafeLastWriteWinsPlugin implements ResolverPlugin<{ value: PropertyTypes | null, timestamp: number }, never> {
      readonly dependencies = [] as const;
      
      initialize() {
        return { value: null, timestamp: 0 };
      }
      
      update(
        currentState: { value: PropertyTypes | null, timestamp: number }, 
        newValue?: PropertyTypes, 
        delta?: CollapsedDelta,
      ) {
        if (newValue === undefined) return currentState;
        if (!delta) return currentState;
        if (delta.timeCreated > currentState.timestamp) {
          return { value: newValue, timestamp: delta.timeCreated };
        }
        return currentState;
      }
      
      resolve(
        state: { value: PropertyTypes | null, timestamp: number },
      ): PropertyTypes | undefined {
        return state.value;
      }
    }

    const resolver = new CustomResolver(lossless, {
      value: new NullSafeLastWriteWinsPlugin()
    });

    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test2', 'value', null, 'test')
        .buildV1()
    );

    const results = resolver.resolve() || {};
    const test1 = results['test2']
    expect(test1).toBeDefined();
    expect(test1?.properties.value).toBeNull();
  });

  test('should handle concurrent updates with same timestamp', () => {
    // Custom plugin that handles concurrent updates with the same timestamp
    class ConcurrentUpdatePlugin implements ResolverPlugin<{ value: PropertyTypes, timestamp: number }, never> {
      readonly dependencies = [] as const;
      
      initialize() {
        return { value: '', timestamp: 0 };
      }
      
      update(
        currentState: { value: PropertyTypes, timestamp: number }, 
        newValue: PropertyTypes, 
        delta: CollapsedDelta,
        _dependencies: DependencyStates
      ) {
        if (delta.timeCreated > currentState.timestamp) {
          return { value: newValue, timestamp: delta.timeCreated };
        } else if (delta.timeCreated === currentState.timestamp) {
          // For concurrent updates, prefer the one with the lexicographically smaller value
          const currentVal = String(currentState.value);
          const newVal = String(newValue);
          return newVal < currentVal 
            ? { value: newValue, timestamp: delta.timeCreated }
            : currentState;
        }
        return currentState;
      }
      
      resolve(state: { value: PropertyTypes, timestamp: number }) {
        return state.value;
      }
    }

    const resolver = new CustomResolver(lossless, {
      value: new ConcurrentUpdatePlugin()
    });

    // Two updates with the same timestamp
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test2', 'value', null, 'test')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user2', 'host2')
        .withTimestamp(1000)  // Same timestamp
        .setProperty('test2', 'value', 'xylophone', 'test')
        .buildV1()
    );



    const results = resolver.resolve() || {};
    const test2 = results['test2'];
    expect(test2).toBeDefined();
    // Should pick one of the values deterministically
    expect(test2?.properties.value).toBeNull();
  });

  test('should handle very large numbers of updates', () => {
    // Plugin that handles large numbers of updates efficiently
    class CounterPlugin implements ResolverPlugin<{ count: number }, never> {
      readonly dependencies = [] as const;
      
      initialize() {
        return { count: 0 };
      }
      
      update(
        currentState: { count: number }, 
        _newValue: PropertyTypes,
        _delta: CollapsedDelta,
        _dependencies: DependencyStates
      ) {
        return { count: currentState.count + 1 };
      }
      
      resolve(
        state: { count: number },
        _dependencies: DependencyStates
      ): number {
        return state.count;
      }
    }

    const resolver = new CustomResolver(lossless, {
      counter: new CounterPlugin()
    });

    // Add 1000 updates
    for (let i = 0; i < 1000; i++) {
      lossless.ingestDelta(
        createDelta('user1', 'host1')
          .withTimestamp(1000 + i)
          .setProperty('test3', 'counter', i, 'test')
          .buildV1()
      );
    }

    const results = resolver.resolve() || {};
    const test3 = results['test3']
    expect(test3).toBeDefined();
    // Should handle large numbers of updates efficiently
    expect(test3?.properties.counter).toBe(1000); // Should count all 1000 updates
  });

  test('should handle missing properties gracefully', () => {
    // No deltas added - should handle empty state
    // Plugin that handles missing properties gracefully
    class MissingPropertyPlugin implements ResolverPlugin<{ initialized: boolean }, never> {
      readonly dependencies = [] as const;
      
      initialize() {
        return { initialized: true };
      }
      
      update(
        currentState: { initialized: boolean },
      ) {
        return currentState;
      }
      
      resolve(
        state: { initialized: boolean }
      ): boolean {
        return state.initialized;
      }
    }

    const resolver = new CustomResolver(lossless, {
      missing: new MissingPropertyPlugin()
    });

    const result = resolver.resolve();
    expect(result).toEqual({});
  });
});
