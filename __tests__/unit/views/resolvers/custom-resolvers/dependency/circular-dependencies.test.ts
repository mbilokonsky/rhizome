import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CollapsedDelta } from '@src/views/lossless';
import { CustomResolver, ResolverPlugin } from '@src/views/resolvers/custom-resolvers';
import type { DependencyStates } from '@src/views/resolvers/custom-resolvers';

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
    class PluginA implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'a' as const;
      readonly dependencies = ['b'] as const;

      initialize() {
        return { value: '' };
      }

      update(currentState: { value: string }, newValue: PropertyTypes, _delta: CollapsedDelta, _dependencies: { b: string }) {
        return { value: String(newValue) };
      }

      resolve(_state: { value: string }, _dependencies: { b: string }) {
        return 'a';
      }
    }


    // PluginB depends on PluginA (circular dependency)
    class PluginB implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'b' as const;
      readonly dependencies = ['a'] as const;

      initialize() {
        return { value: '' };
      }

      update(currentState: { value: string }, newValue: PropertyTypes, _delta: CollapsedDelta, _dependencies: { a: string }) {
        return { value: String(newValue) };
      }

      resolve(_state: { value: string }, _dependencies: { a: string }) {
        return 'b';
      }
    }


    // Should throw an error when circular dependencies are detected
    expect(() => {
      new CustomResolver(lossless, {
        'a': new PluginA(),
        'b': new PluginB()
      });
    }).toThrow('Circular dependency detected: a -> b -> a');
  });

  test('should detect longer circular dependency chains', () => {
    class PluginA implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'a' as const;
      readonly dependencies = ['c'] as const;
      initialize() { return { value: '' }; }
      update() { return { value: '' }; }
      resolve() { return 'a'; }
    }

    class PluginB implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'b' as const;
      readonly dependencies = ['a'] as const;
      initialize() { return { value: '' }; }
      update() { return { value: '' }; }
      resolve() { return 'b'; }
    }

    class PluginC implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'c' as const;
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
    }).toThrow('Circular dependency detected: a -> c -> b -> a');
  });
});
