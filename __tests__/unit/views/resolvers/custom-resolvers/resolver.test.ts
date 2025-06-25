import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode } from '@src';
import { Lossless } from '@src/views/lossless';
import { CustomResolver } from '@src/views/resolvers/custom-resolvers';
import { ResolverPlugin } from '@src/views/resolvers/custom-resolvers/plugin';
// import Debug from 'debug';

// const debug = Debug('rz:test:resolver');

// Mock plugins for testing
class TestPlugin implements ResolverPlugin<unknown, string> {
  name: string;
  dependencies: readonly string[];
  
  constructor(name: string, dependencies: string[] = []) {
    this.name = name;
    this.dependencies = dependencies;
  }
  
  initialize() { return {}; }
  update() { return {}; }
  resolve() { return 'test'; }
}

describe('CustomResolver', () => {
  let node: RhizomeNode;
  let lossless: Lossless;
  
  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('buildDependencyGraph', () => {
    test('should build a simple dependency graph', () => {
      // Arrange
      const plugins = {
        a: new TestPlugin('a'),
        b: new TestPlugin('b', ['a']), // b depends on a
        c: new TestPlugin('c', ['b'])  // c depends on b
      };
      
      // Act
      const resolver = new CustomResolver(lossless, plugins);
      
      const graph = resolver.dependencyGraph;
      
      // Assert
      expect(graph.get('a')).toBeDefined();
      expect(graph.get('b')).toBeDefined();
      expect(graph.get('c')).toBeDefined();
      
      // Check dependencies
      expect(Array.from(graph.get('a') || [])).toContain('b'); // a -> b
      expect(Array.from(graph.get('b') || [])).toContain('c'); // b -> c
    });

    test('should handle plugins with same basename but different keys', () => {
      // Arrange
      const plugins = {
        'plugin:a': new TestPlugin('a'),
        'plugin:b': new TestPlugin('b', ['a']), // depends on a
        'another:b': new TestPlugin('b', ['a'])  // same basename, different key
      };
      
      // Act
      const resolver = new CustomResolver(lossless, plugins);
      
      // Access private method for testing
      const graph = resolver.dependencyGraph;
      
      // Assert
      expect(graph.get('a')).toBeDefined();
      expect(graph.get('b')).toBeDefined();
      
      // Both 'plugin:b' and 'another:b' should be in the graph as 'b'
      expect(Array.from(graph.get('a') || [])).toContain('b');
    });

    test('should throw error for missing dependency', () => {
      // Arrange
      const plugins = {
        a: new TestPlugin('a', ['nonexistent']) // depends on non-existent plugin
      };
      
      // Act & Assert
      expect(() => {
        new CustomResolver(lossless, plugins);
      }).toThrow('Dependency nonexistent not found for plugin a');
    });

    test('should handle plugins with no dependencies', () => {
      // Arrange
      const plugins = {
        a: new TestPlugin('a'),
        b: new TestPlugin('b'),
        c: new TestPlugin('c')
      };
      
      // Act
      const resolver = new CustomResolver(lossless, plugins);
      
      // Access private method for testing
      const graph = resolver.dependencyGraph;
      
      // Assert
      expect(graph.get('a')).toBeDefined();
      expect(graph.get('b')).toBeDefined();
      expect(graph.get('c')).toBeDefined();
      
      // No dependencies should be set
      expect(Array.from(graph.get('a') || [])).toHaveLength(0);
      expect(Array.from(graph.get('b') || [])).toHaveLength(0);
      expect(Array.from(graph.get('c') || [])).toHaveLength(0);
    });

    test('should detect circular dependencies', () => {
      // Arrange
      const plugins = {
        a: new TestPlugin('a', ['c']), // a depends on c
        b: new TestPlugin('b', ['a']), // b depends on a
        c: new TestPlugin('c', ['b'])  // c depends on b (circular)
      };
      
      // Act & Assert
      expect(() => {
        new CustomResolver(lossless, plugins);
      }).toThrow('Circular dependency detected in plugin dependencies');
    });
  });
});
