import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta, CollapsedDelta } from '@src';
import { 
  CustomResolver, 
  ResolverPlugin,
  DependencyStates 
} from '@src/views/resolvers/custom-resolvers';
import { PropertyTypes } from '@src/core/types';

// A simple plugin for testing lifecycle methods
class LifecycleTestPlugin extends ResolverPlugin<LifecycleTestState> {
  readonly dependencies = [] as const;
  
  private initialState: LifecycleTestState = {
    initialized: true,
    updated: false,
    resolved: false
  };
  
  initialize(): LifecycleTestState {
    return { ...this.initialState };
  }
  
  update(
    currentState: LifecycleTestState, 
    _newValue: PropertyTypes, 
    _delta: CollapsedDelta, 
    _dependencies: DependencyStates
  ): LifecycleTestState {
    return { ...currentState, updated: true };
  }
  
  resolve(
    state: LifecycleTestState, 
    _dependencies: DependencyStates
  ): PropertyTypes {
    // Return a valid PropertyTypes value (string, number, boolean, or null)
    // We'll use a JSON string representation of the state
    return JSON.stringify({ ...state, resolved: true });
  }
}

type LifecycleTestState = {
  initialized: boolean;
  updated: boolean;
  resolved: boolean;
};

describe('Plugin Lifecycle', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should call initialize, update, and resolve in order', () => {
    // Add some data
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test1', 'test', 'value1', 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      test: new LifecycleTestPlugin()
    });

    const results = resolver.resolve() || [];
    expect(Array.isArray(results)).toBe(true);
    
    const entity = results.find(r => r.id === 'test1');
    expect(entity).toBeDefined();
    
    // Verify all lifecycle methods were called in the correct order
    const testProperty = entity?.properties.test;
    expect(testProperty).toBeDefined();
    
    // The resolved value should be the return value from resolve() which is a JSON string
    const parsed = JSON.parse(testProperty as string);
    expect(parsed).toEqual({
      initialized: true,
      updated: true,
      resolved: true
    });
  });

  test('should handle multiple updates correctly', () => {
    // First update
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test2', 'test', 'value1', 'test')
        .buildV1()
    );

    // Second update
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('test2', 'test', 'value2', 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      test: new LifecycleTestPlugin()
    });

    const results = resolver.resolve() || [];
    expect(Array.isArray(results)).toBe(true);
    
    const entity = results.find(r => r.id === 'test2');
    expect(entity).toBeDefined();
    
    // Verify state after multiple updates
    const testProperty = entity?.properties.test;
    expect(testProperty).toBeDefined();
    
    // The resolved value should be the return value from resolve() which is a JSON string
    const parsed = JSON.parse(testProperty as string);
    expect(parsed).toEqual({
      initialized: true,
      updated: true,  // Should be true from the last update
      resolved: true
    });
  });

  test('should handle empty state', () => {
    const resolver = new CustomResolver(lossless, {
      test: new LifecycleTestPlugin()
    });

    const results = resolver.resolve();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });
});
