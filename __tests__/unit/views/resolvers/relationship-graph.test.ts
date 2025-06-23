import { RhizomeNode, Lossless } from "../../../../src";
import { RelationshipGraphResolver } from "../../../../src/views/resolvers/relationship-graph";
import { createDelta } from "../../../../src/core/delta-builder";

// Deferring until we figure out lossy view composition
describe.skip('RelationshipGraphResolver', () => {
  let node: RhizomeNode;
  let lossless: Lossless;
  let resolver: RelationshipGraphResolver;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
    resolver = new RelationshipGraphResolver(lossless);
  });

  describe('Basic Relationship Resolution', () => {
    test('should create a basic relationship between two entities', () => {
      const delta = createDelta('user1', 'host1')
        .withId('delta1')
        .withTimestamp(1000)
        .relate('entity1', 'entity2', 'friends', { since: 1640995200000 })
        .buildV1();

      // Ingest the delta
      lossless.ingestDelta(delta);

      // Resolve the graph
      const graph = resolver.resolve();
      
      // Verify the relationship was created
      expect(graph).toBeDefined();
      if (!graph) return;

      console.log(JSON.stringify(graph, null, 2));
      
      // Check entities exist
      expect(graph.entities.has('entity1')).toBe(true);
      expect(graph.entities.has('entity2')).toBe(true);
      
      // Check relationship exists
      const relationshipId = 'delta1';
      expect(graph.relationships.has(relationshipId)).toBe(true);
      
      const relationship = graph.relationships.get(relationshipId)!;
      expect(relationship).toEqual({
        id: relationshipId,
        type: 'friends',
        source: 'entity1',
        target: 'entity2',
        properties: { since: 1640995200000 },
        deltas: ['delta1']
      });
      
      // Check entity relationships
      const entity1 = graph.entities.get('entity1')!;
      const entity2 = graph.entities.get('entity2')!;
      
      expect(entity1.outbound.has(relationshipId)).toBe(true);
      expect(entity2.inbound.has(relationshipId)).toBe(true);
      
      // Check relationship type index
      expect(graph.relationshipsByType.has('friends')).toBe(true);
      expect(graph.relationshipsByType.get('friends')?.has(relationshipId)).toBe(true);
    });
  });
});
