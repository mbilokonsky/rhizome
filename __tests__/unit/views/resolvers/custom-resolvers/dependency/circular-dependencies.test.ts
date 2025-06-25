import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless } from '@src';
import { CollapsedDelta } from '@src/views/lossless';
import { CustomResolver, ResolverPlugin } from '@src/views/resolvers/custom-resolvers';

type PropertyTypes = string | number | boolean | null;

describe('Circular Dependency Detection', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should detect circular dependencies', () => {
    // PluginA depends on PluginB
    class PluginA extends ResolverPlugin<{ value: string }, string> {
      readonly dependencies = ['b'] as const;

      initialize() {
        return { value: '' };
      }

      update(currentState: { value: string }, newValue: PropertyTypes, _delta: CollapsedDelta, _dependencies: { b: string }) {
        return { value: String(newValue) };
      }

      resolve(_state: { value: string }) {
        return 'a';
      }
    }


    // PluginB depends on PluginA (circular dependency)
    class PluginB extends ResolverPlugin<{ value: string }, string> {
      readonly dependencies = ['a'] as const;

      initialize() {
        return { value: '' };
      }

      update(_currentState: { value: string }, newValue: PropertyTypes, _delta: CollapsedDelta, _dependencies: { a: string }) {
        return { value: String(newValue) };
      }

      resolve(_state: { value: string }) {
        return 'b';
      }
    }


    // Should throw an error when circular dependencies are detected
    expect(() => {
      new CustomResolver(lossless, {
        'a': new PluginA(),
        'b': new PluginB()
      });
    }).toThrow('Circular dependency detected in plugin dependencies');
  });

  test('should detect longer circular dependency chains', () => {
    class PluginA extends ResolverPlugin<{ value: string }, string> {
      readonly dependencies = ['c'] as const;
      initialize() { return { value: '' }; }
      update() { return { value: '' }; }
      resolve() { return 'a'; }
    }

    class PluginB extends ResolverPlugin<{ value: string }, string> {
      readonly dependencies = ['a'] as const;
      initialize() { return { value: '' }; }
      update() { return { value: '' }; }
      resolve() { return 'b'; }
    }

    class PluginC extends ResolverPlugin<{ value: string }, string> {
      readonly dependencies = ['b'] as const;
      initialize() { return { value: '' }; }
      update() { return { value: '' }; }
      resolve() { return 'c'; }
    }

    // Should detect the circular dependency: a -> c -> b -> a
    expect(() => {
      new CustomResolver(lossless, {
        'a': new PluginA(),
        'b': new PluginB(),
        'c': new PluginC()
      });
    }).toThrow('Circular dependency detected in plugin dependencies');
  });
});
