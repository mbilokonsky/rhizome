import Debug from 'debug';
import { Delta } from '../src/core';
import { NegationHelper } from '../src/features';
import { RhizomeNode } from '../src/node';
import { Lossless } from '../src/views';

const debug = Debug('rz:negation:test');

describe('Negation System', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Negation Helper', () => {
    it('should create negation deltas correctly', () => {
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'name', target: 'entity1', targetContext: 'name' },
          { localContext: 'value', target: 'Alice' }
        ]
      });

      const negationDelta = NegationHelper.createNegation(
        originalDelta.id,
        'moderator',
        'host1'
      );

      expect(negationDelta.isNegation).toBe(true);
      expect(negationDelta.negatedDeltaId).toBe(originalDelta.id);
      expect(negationDelta.creator).toBe('moderator');
      expect(negationDelta.pointers).toHaveLength(1);
      expect(negationDelta.pointers[0]).toEqual({
        localContext: 'negates',
        target: originalDelta.id,
        targetContext: 'negated_by'
      });
    });

    it('should identify negation deltas', () => {
      const regularDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      const negationDelta = NegationHelper.createNegation(
        'delta-to-negate',
        'moderator',
        'host1'
      );

      expect(NegationHelper.isNegationDelta(regularDelta)).toBe(false);
      expect(NegationHelper.isNegationDelta(negationDelta)).toBe(true);
    });

    it('should extract negated delta ID', () => {
      const targetDeltaId = 'target-delta-123';
      const negationDelta = NegationHelper.createNegation(
        targetDeltaId,
        'moderator',
        'host1'
      );

      const extractedId = NegationHelper.getNegatedDeltaId(negationDelta);
      expect(extractedId).toBe(targetDeltaId);

      const regularDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      expect(NegationHelper.getNegatedDeltaId(regularDelta)).toBeNull();
    });

    it('should find negations for specific deltas', () => {
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [{ localContext: 'age', target: 'entity1', targetContext: 'age' }]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');
      const negation2 = NegationHelper.createNegation(delta1.id, 'mod2', 'host1');
      const negation3 = NegationHelper.createNegation(delta2.id, 'mod1', 'host1');

      const allDeltas = [delta1, delta2, negation1, negation2, negation3];

      const negationsForDelta1 = NegationHelper.findNegationsFor(delta1.id, allDeltas);
      expect(negationsForDelta1).toHaveLength(2);
      expect(negationsForDelta1.map(d => d.id)).toContain(negation1.id);
      expect(negationsForDelta1.map(d => d.id)).toContain(negation2.id);

      const negationsForDelta2 = NegationHelper.findNegationsFor(delta2.id, allDeltas);
      expect(negationsForDelta2).toHaveLength(1);
      expect(negationsForDelta2[0].id).toBe(negation3.id);
    });

    it('should check if deltas are negated', () => {
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [{ localContext: 'age', target: 'entity1', targetContext: 'age' }]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');
      const allDeltas = [delta1, delta2, negation1];

      expect(NegationHelper.isDeltaNegated(delta1.id, allDeltas)).toBe(true);
      expect(NegationHelper.isDeltaNegated(delta2.id, allDeltas)).toBe(false);
    });

    it('should filter out negated deltas', () => {
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [{ localContext: 'age', target: 'entity1', targetContext: 'age' }]
      });

      const delta3 = new Delta({
        creator: 'user3',
        host: 'host1',
        pointers: [{ localContext: 'email', target: 'entity1', targetContext: 'email' }]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');
      const negation2 = NegationHelper.createNegation(delta2.id, 'mod2', 'host1');

      const allDeltas = [delta1, delta2, delta3, negation1, negation2];
      const filtered = NegationHelper.filterNegatedDeltas(allDeltas);

      // Should only include delta3 (delta1 and delta2 are negated, negations themselves are filtered)
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(delta3.id);
    });

    it('should provide negation statistics', () => {
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [{ localContext: 'name', target: 'entity1', targetContext: 'name' }]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [{ localContext: 'age', target: 'entity1', targetContext: 'age' }]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');
      const allDeltas = [delta1, delta2, negation1];

      const stats = NegationHelper.getNegationStats(allDeltas);

      expect(stats.totalDeltas).toBe(3);
      expect(stats.negationDeltas).toBe(1);
      expect(stats.negatedDeltas).toBe(1);
      expect(stats.effectiveDeltas).toBe(1); // only delta2 is effective
      expect(stats.negatedDeltaIds).toContain(delta1.id);
      expect(stats.negationMap.get(delta1.id)).toContain(negation1.id);
    });

    it('should apply negations chronologically', () => {
      const baseTime = Date.now();

      // Create deltas with specific timestamps
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: baseTime,
        pointers: [{ localContext: 'status', target: 'doc1', targetContext: 'status' }]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');
      negation1.timeCreated = baseTime + 1000; // 1 second later

      const delta2 = new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: baseTime + 2000, // 2 seconds later
        pointers: [{ localContext: 'status', target: 'doc1', targetContext: 'status' }]
      });

      const negation2 = NegationHelper.createNegation(delta2.id, 'mod1', 'host1');
      negation2.timeCreated = baseTime + 3000; // 3 seconds later

      const allDeltas = [delta1, negation1, delta2, negation2];
      const filtered = NegationHelper.applyNegationsChronologically(allDeltas);

      // Both deltas should be negated
      expect(filtered).toHaveLength(0);
    });
  });

  describe('Lossless View Integration', () => {
    it('should filter negated deltas in lossless views', () => {
      // Create original delta
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'name', target: 'user123', targetContext: 'name' },
          { localContext: 'value', target: 'Alice' }
        ]
      });

      // Create negation delta
      const negationDelta = NegationHelper.createNegation(
        originalDelta.id,
        'moderator',
        'host1'
      );
      

      // Create another non-negated delta
      const nonNegatedDelta = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [
          { localContext: 'age', target: 'user123', targetContext: 'age' },
          { localContext: 'value', target: 25 }
        ]
      });

      // Ingest all deltas
      lossless.ingestDelta(originalDelta);
      lossless.ingestDelta(negationDelta);
      lossless.ingestDelta(nonNegatedDelta);

      // Get view - should only show non-negated delta
      const view = lossless.view(['user123']);
      
      expect(view.user123).toBeDefined();
      
      // Should only have age property (name was negated)
      expect(view.user123.propertyDeltas.age).toHaveLength(1);
      expect(view.user123.propertyDeltas.name).toBeUndefined();
    });

    it('should handle multiple negations of the same delta', () => {
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'content', target: 'post1', targetContext: 'content' },
          { localContext: 'value', target: 'Original content' }
        ]
      });

      const negation1 = NegationHelper.createNegation(originalDelta.id, 'mod1', 'host1');
      const negation2 = NegationHelper.createNegation(originalDelta.id, 'mod2', 'host1');

      lossless.ingestDelta(originalDelta);
      lossless.ingestDelta(negation1);
      lossless.ingestDelta(negation2);

      const view = lossless.view(['post1']);
      
      // Original delta should be negated (not visible)
      expect(view.post1).toBeUndefined();
    });

    it('should provide negation statistics for entities', () => {
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'title', target: 'article1', targetContext: 'title' },
          { localContext: 'value', target: 'Original Title' }
        ]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [
          { localContext: 'content', target: 'article1', targetContext: 'content' },
          { localContext: 'value', target: 'Article content' }
        ]
      });

      const negation1 = NegationHelper.createNegation(delta1.id, 'mod1', 'host1');

      lossless.ingestDelta(delta1);
      lossless.ingestDelta(delta2);
      lossless.ingestDelta(negation1);

      const stats = lossless.getNegationStats('article1');
      
      expect(stats.totalDeltas).toBe(3);
      expect(stats.negationDeltas).toBe(1);
      expect(stats.negatedDeltas).toBe(1);
      expect(stats.effectiveDeltas).toBe(1);
      expect(stats.negationsByProperty.title.negated).toBe(1);
      expect(stats.negationsByProperty.content.negated).toBe(0);
    });

    it('should retrieve negation deltas for entities', () => {
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'status', target: 'task1', targetContext: 'status' },
          { localContext: 'value', target: 'pending' }
        ]
      });

      const negationDelta = NegationHelper.createNegation(
        originalDelta.id,
        'admin',
        'host1'
      );

      lossless.ingestDelta(originalDelta);
      lossless.ingestDelta(negationDelta);

      const negations = lossless.getNegationDeltas('task1');
      expect(negations).toHaveLength(1);
      expect(negations[0].id).toBe(negationDelta.id);
      expect(negations[0].creator).toBe('admin');
    });

    it('should handle negation in transactions', () => {
      const transactionId = 'tx-negation';

      // Create transaction declaration
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Create original delta in transaction
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'comment', target: 'post1', targetContext: 'comments' },
          { localContext: 'text', target: 'Inappropriate comment' }
        ]
      });

      // Create negation delta in same transaction
      const negationDelta = NegationHelper.createNegation(originalDelta.id, 'moderator', 'host1');
      negationDelta.pointers.unshift({
        localContext: '_transaction',
        target: transactionId,
        targetContext: 'deltas'
      });

      lossless.ingestDelta(originalDelta);
      lossless.ingestDelta(negationDelta);

      // Transaction should complete, but original delta should be negated
      const view = lossless.view(['post1']);
      expect(view.post1).toBeUndefined(); // No visible deltas
    });

    it('should handle chronological negation scenarios', () => {
      const baseTime = Date.now();

      // User posts content
      const postDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: baseTime,
        pointers: [
          { localContext: 'content', target: 'post1', targetContext: 'content' },
          { localContext: 'value', target: 'Original post' }
        ]
      });

      // Moderator negates it
      const negationDelta = NegationHelper.createNegation(postDelta.id, 'moderator', 'host1');
      negationDelta.timeCreated = baseTime + 1000;

      // User edits content (after negation)
      const editDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        timeCreated: baseTime + 2000,
        pointers: [
          { localContext: 'content', target: 'post1', targetContext: 'content' },
          { localContext: 'value', target: 'Edited post' }
        ]
      });

      lossless.ingestDelta(postDelta);
      lossless.ingestDelta(negationDelta);
      lossless.ingestDelta(editDelta);

      const view = lossless.view(['post1']);
      
      // Should show edited content (edit happened after negation)
      expect(view.post1).toBeDefined();
      expect(view.post1.propertyDeltas.content).toHaveLength(1);
      
      // The visible delta should be the edit delta
      const visibleDelta = view.post1.propertyDeltas.content[0];
      expect(visibleDelta.id).toBe(editDelta.id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negation of non-existent deltas', () => {
      const negationDelta = NegationHelper.createNegation(
        'non-existent-delta-id',
        'moderator',
        'host1'
      );

      lossless.ingestDelta(negationDelta);

      // Should not crash and stats should reflect the orphaned negation
      const stats = lossless.getNegationStats('entity1');
      expect(stats.negationDeltas).toBe(0); // No negations for this entity
    });

    it('should handle self-referential entities in negations', () => {
      // Create a delta that references itself
      const selfRefDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'parent', target: 'node1', targetContext: 'parent' },
          { localContext: 'child', target: 'node1' } // Self-reference
        ]
      });

      const negationDelta = NegationHelper.createNegation(selfRefDelta.id, 'admin', 'host1');

      lossless.ingestDelta(selfRefDelta);
      lossless.ingestDelta(negationDelta);

      const view = lossless.view(['node1']);
      expect(view.node1).toBeUndefined(); // Should be negated
    });

    it('should handle multiple direct negations of the same delta', () => {
      const testNode = new RhizomeNode();
      const testLossless = new Lossless(testNode);
      
      // Create the original delta
      const originalDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'title', target: 'entity2', targetContext: 'title' },
          { localContext: 'status', target: 'Draft' }
        ]
      });

      // Create two negations of the same delta
      const negation1 = NegationHelper.createNegation(originalDelta.id, 'user2', 'host1');
      const negation2 = NegationHelper.createNegation(originalDelta.id, 'user3', 'host1');

      // Process all deltas
      testLossless.ingestDelta(originalDelta);
      testLossless.ingestDelta(negation1);
      testLossless.ingestDelta(negation2);

      // Get the view after processing all deltas
      const view = testLossless.view(['entity2']);
      
      // The original delta should be negated (not in view) because it has two direct negations
      expect(view.entity2).toBeUndefined();

      // Verify the stats
      const stats = testLossless.getNegationStats('entity2');
      expect(stats.negationDeltas).toBe(2);
      expect(stats.negatedDeltas).toBe(1);
      expect(stats.effectiveDeltas).toBe(0);
    });

    it('should handle complex negation chains', () => {
      const testNode = new RhizomeNode();
      const testLossless = new Lossless(testNode);
      
      // Create the original delta
      const deltaA = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'content', target: 'entity3', targetContext: 'content' },
          { localContext: 'text', target: 'Hello World' }
        ]
      });

      // Create a chain of negations: B negates A, C negates B, D negates C
      const deltaB = NegationHelper.createNegation(deltaA.id, 'user2', 'host1');
      const deltaC = NegationHelper.createNegation(deltaB.id, 'user3', 'host1');
      const deltaD = NegationHelper.createNegation(deltaC.id, 'user4', 'host1');

      debug('Delta A (original): %s', deltaA.id);
      debug('Delta B (negates A): %s', deltaB.id);
      debug('Delta C (negates B): %s', deltaC.id);
      debug('Delta D (negates C): %s', deltaD.id);

      // Process all deltas in order
      testLossless.ingestDelta(deltaA);
      testLossless.ingestDelta(deltaB);
      testLossless.ingestDelta(deltaC);
      testLossless.ingestDelta(deltaD);

      // Get the view after processing all deltas
      const view = testLossless.view(['entity3']);
      
      // The original delta should be negated because:
      // - B negates A
      // - C negates B (so A is no longer negated)
      // - D negates C (so B is no longer negated, and A is negated again by B)
      expect(view.entity3).toBeUndefined();

      // Get all deltas for the entity
      const allDeltas = [deltaA, deltaB, deltaC, deltaD];
      
      // Get the stats
      const stats = testLossless.getNegationStats('entity3');
      const isANegated = NegationHelper.isDeltaNegated(deltaA.id, allDeltas);
      const isBNegated = NegationHelper.isDeltaNegated(deltaB.id, allDeltas);
      const isCNegated = NegationHelper.isDeltaNegated(deltaC.id, allDeltas);
      const isDNegated = NegationHelper.isDeltaNegated(deltaD.id, allDeltas);
      
      debug('Delta statuses:');
      debug('- A (%s): %s', deltaA.id, isANegated ? 'NEGATED' : 'ACTIVE');
      debug('- B (%s): %s, negates: %s', deltaB.id, isBNegated ? 'NEGATED' : 'ACTIVE', NegationHelper.getNegatedDeltaId(deltaB));
      debug('- C (%s): %s, negates: %s', deltaC.id, isCNegated ? 'NEGATED' : 'ACTIVE', NegationHelper.getNegatedDeltaId(deltaC));
      debug('- D (%s): %s, negates: %s', deltaD.id, isDNegated ? 'NEGATED' : 'ACTIVE', NegationHelper.getNegatedDeltaId(deltaD));
      
      debug('Negation stats: %O', {
        totalDeltas: stats.totalDeltas,
        negationDeltas: stats.negationDeltas,
        negatedDeltas: stats.negatedDeltas,
        effectiveDeltas: stats.effectiveDeltas,
        negationsByProperty: stats.negationsByProperty
      });

      // B, C, D are negation deltas
      expect(stats.negationDeltas).toBe(3);
      
      // A and C are effectively negated
      expect(isANegated).toBe(true);
      expect(isCNegated).toBe(true);
      
      // B and D are not negated (they are negation deltas that are not themselves negated)
      expect(isBNegated).toBe(false);
      expect(isDNegated).toBe(false);
      
      // No deltas remain unnegated
      expect(stats.effectiveDeltas).toBe(0);
    });

    it('should handle multiple independent negations', () => {
      const testNode = new RhizomeNode();
      const testLossless = new Lossless(testNode);
      
      // Create two independent deltas
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'item', target: 'entity4', targetContext: 'item' },
          { localContext: 'name', target: 'Item 1' }
        ]
      });

      const delta2 = new Delta({
        creator: 'user2',
        host: 'host1',
        pointers: [
          { localContext: 'item', target: 'entity4', targetContext: 'item' },
          { localContext: 'name', target: 'Item 2' }
        ]
      });

      // Create negations for both deltas
      const negation1 = NegationHelper.createNegation(delta1.id, 'user3', 'host1');
      const negation2 = NegationHelper.createNegation(delta2.id, 'user4', 'host1');

      // Process all deltas
      testLossless.ingestDelta(delta1);
      testLossless.ingestDelta(delta2);
      testLossless.ingestDelta(negation1);
      testLossless.ingestDelta(negation2);

      // Get the view after processing all deltas
      const view = testLossless.view(['entity4']);
      
      // Both deltas should be negated
      expect(view.entity4).toBeUndefined();

      // Verify the stats
      const stats = testLossless.getNegationStats('entity4');
      expect(stats.negationDeltas).toBe(2);
      expect(stats.negatedDeltas).toBe(2);
      expect(stats.effectiveDeltas).toBe(0);
    });
  });
});