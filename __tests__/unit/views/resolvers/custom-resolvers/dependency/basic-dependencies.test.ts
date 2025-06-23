import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { CollapsedDelta } from '@src/views/lossless';
import { CustomResolver, ResolverPlugin } from '@src/views/resolvers/custom-resolvers';
import type { DependencyStates } from '@src/views/resolvers/custom-resolvers';

type PropertyTypes = string | number | boolean | null;

describe('Basic Dependency Resolution', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should resolve dependencies in correct order', () => {
    // Define a simple plugin that depends on another
    class FirstPlugin implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'first' as const;
      readonly dependencies = [] as const;

      initialize() {
        return { value: '' };
      }

      update(currentState: { value: string }, newValue: PropertyTypes) {
        return { value: String(newValue) };
      }

      resolve(state: { value: string }) {
        return state.value.toUpperCase();
      }
    }


    class SecondPlugin implements ResolverPlugin<{ value: string }, string> {
      readonly name = 'second' as const;
      readonly dependencies = ['first'] as const;

      initialize() {
        return { value: '' };
      }

      update(currentState: { value: string }, newValue: PropertyTypes, _delta: CollapsedDelta, dependencies: { first: string }) {
        return { value: `${dependencies.first}_${newValue}` };
      }

      resolve(state: { value: string }) {
        return state.value;
      }
    }

    // Add some data
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('test1', 'first', 'hello', 'test')
        .buildV1()
    );

    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('test1', 'second', 'world', 'test')
        .buildV1()
    );

    const resolver = new CustomResolver(lossless, {
      first: new FirstPlugin(),
      second: new SecondPlugin()
    });

    const result = resolver.resolve();
    expect(result).toBeDefined();
    expect(result!['test1'].properties.first).toBe('HELLO');
    expect(result!['test1'].properties.second).toBe('HELLO_world');
  });
});
