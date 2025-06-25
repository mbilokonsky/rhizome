import { PropertyID } from '@src/core/types';
import { describe, test, expect, beforeEach } from '@jest/globals';
import { RhizomeNode, Lossless, createDelta } from '@src';
import { 
  CustomResolver, 
  LastWriteWinsPlugin, 
  ConcatenationPlugin,
  MaxPlugin,
  MinPlugin,
  ResolverPlugin
} from '@src/views/resolvers/custom-resolvers';

// A simple plugin that depends on other plugins
class AveragePlugin<Targets extends PropertyID> implements ResolverPlugin<{ initialized: boolean }, Targets> {
  readonly dependencies: Targets[] = [];
  
  constructor(...targets: Targets[]) {
    if (targets.length !== 2) {
      throw new Error('This AveragePlugin requires exactly two targets');
    }
    this.dependencies = targets;
  }

  initialize(): { initialized: boolean } {
    return { initialized: true };
  }
  
  update(): { initialized: boolean } {
    // No state updates needed for this plugin
    return { initialized: true };
  }
  
  resolve(
    _state: { initialized: boolean }, 
    dependencies: { [K in Targets]: number | undefined }
  ): number | undefined {
    const [depId1, depId2] = this.dependencies;
    const min = dependencies[depId1];
    const max = dependencies[depId2];
    if (min === undefined || max === undefined) {
      return undefined;
    }
    return (min + max) / 2;
  }
}

describe('Multiple Plugins Integration', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  test('should handle multiple plugins with dependencies', () => {
    const resolver = new CustomResolver(lossless, {
      temperature: new LastWriteWinsPlugin(),
      maxTemp: new MaxPlugin('temperature'),
      minTemp: new MinPlugin('temperature'),
      avgTemp: new AveragePlugin('minTemp', 'maxTemp')
    });

    // Add some temperature readings
    const readings = [22, 25, 18, 30, 20];
    readings.forEach((temp, index) => {
      lossless.ingestDelta(
        createDelta('sensor1', 'host1')
          .withTimestamp(1000 + index * 1000)
          .setProperty('room1', 'temperature', temp, 'sensors')
          .buildV1()
      );
    });

    const results = resolver.resolve();
    expect(results).toBeDefined();
    
    const room = results!['room1'];
    expect(room).toBeDefined();
    
    // Verify all plugins worked together
    expect(room?.properties.temperature).toBe(20); // Last write
    expect(room?.properties.maxTemp).toBe(30);     // Max value
    expect(room?.properties.minTemp).toBe(18);     // Min value
    expect(room?.properties.avgTemp).toBe(24);     // (18 + 30) / 2
  });

  test('should handle multiple entities with different plugins', () => {
    const resolver = new CustomResolver(lossless, {
      name: new LastWriteWinsPlugin(),
      tags: new ConcatenationPlugin(),
      score: new MaxPlugin('score')
    });

    // Add data for entity1
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity1', 'name', 'Test Entity', 'test')
        .setProperty('entity1', 'tags', 'tag1', 'test')
        .buildV1()
    );

    // Add more tags to entity1
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity1', 'tags', 'tag2', 'test')
        .buildV1()
    );

    // Add data for entity2
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(1000)
        .setProperty('entity2', 'score', 85, 'test')
        .buildV1()
    );

    // Update score for entity2
    lossless.ingestDelta(
      createDelta('user1', 'host1')
        .withTimestamp(2000)
        .setProperty('entity2', 'score', 90, 'test')
        .buildV1()
    );

    const results = resolver.resolve();
    expect(results).toBeDefined();
    
    const entity1 = results!['entity1'];
    expect(entity1).toBeDefined();
    expect(entity1?.properties.name).toBe('Test Entity');
    expect(entity1?.properties.tags).toEqual(['tag1', 'tag2']);
    
    const entity2 = results!['entity2'];
    expect(entity2).toBeDefined();
    expect(entity2?.properties.score).toBe(90);
  });
});
