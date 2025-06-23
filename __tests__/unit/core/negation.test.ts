import Debug from 'debug';
import { createDelta } from '@src/core/delta-builder';
import { NegationHelper } from '@src/features';
import { RhizomeNode } from '@src/node';
import { Lossless } from '@src/views';

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
      const originalDelta = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Alice')
        .buildV1();

      const negationDelta = createDelta('moderator', 'host1')
        .negate(originalDelta.id)
        .buildV1();

      expect(negationDelta.creator).toBe('moderator');
      expect(negationDelta.pointers).toHaveLength(1);
      expect(negationDelta.pointers[0]).toEqual({
        localContext: '_negates',
        target: originalDelta.id,
        targetContext: 'negated_by'
      });
      expect(NegationHelper.isNegationDelta(negationDelta)).toBe(true);
    });

    it('should identify negation deltas', () => {
      const regularDelta = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      const negationDelta = createDelta('moderator', 'host1')
        .negate('delta-to-negate')
        .buildV1();

      expect(NegationHelper.isNegationDelta(regularDelta)).toBe(false);
      expect(NegationHelper.isNegationDelta(negationDelta)).toBe(true);
    });

    it('should extract negated delta ID', () => {
      const targetDeltaId = 'target-delta-123';
      const negationDelta = createDelta('moderator', 'host1')
        .negate(targetDeltaId)
        .buildV1();

      const extractedId = NegationHelper.getNegatedDeltaId(negationDelta);
      expect(extractedId).toBe(targetDeltaId);

      const regularDelta = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      expect(NegationHelper.getNegatedDeltaId(regularDelta)).toBeNull();
    });

    it('should find negations for specific deltas', () => {
      const delta1 = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('entity1', 'age', 25)
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();
      const negation2 = createDelta('mod2', 'host1').negate(delta1.id).buildV1();
      const negation3 = createDelta('mod1', 'host1').negate(delta2.id).buildV1();

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
      const delta1 = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('entity1', 'age', 25)
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();
      const allDeltas = [delta1, delta2, negation1];

      expect(NegationHelper.isDeltaNegated(delta1.id, allDeltas)).toBe(true);
      expect(NegationHelper.isDeltaNegated(delta2.id, allDeltas)).toBe(false);
    });

    it('should filter out negated deltas', () => {
      const delta1 = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('entity1', 'age', 25)
        .buildV1();

      const delta3 = createDelta('user3', 'host1')
        .setProperty('entity1', 'email', 'entity1@example.com')
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();
      const negation2 = createDelta('mod2', 'host1').negate(delta2.id).buildV1();

      const allDeltas = [delta1, delta2, delta3, negation1, negation2];
      const filtered = NegationHelper.filterNegatedDeltas(allDeltas);

      // Should only include delta3 (delta1 and delta2 are negated, negations themselves are filtered)
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(delta3.id);
    });

    it('should provide negation statistics', () => {
      const delta1 = createDelta('user1', 'host1')
        .setProperty('entity1', 'name', 'Entity 1')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('entity1', 'age', 25)
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();
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
      const delta1 = createDelta('user1', 'host1')
        .withTimestamp(baseTime)
        .setProperty('entity1', 'status', 'active')
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();
      negation1.timeCreated = baseTime + 1000; // 1 second later

      const delta2 = createDelta('user1', 'host1')
        .withTimestamp(baseTime + 2000)
        .setProperty('entity1', 'status', 'inactive')
        .buildV1();

      const negation2 = createDelta('mod1', 'host1').negate(delta2.id).buildV1();
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
      const originalDelta = createDelta('user1', 'host1')
        .setProperty('user123', 'name', 'Alice')
        .buildV1();

      // Create negation delta
      const negationDelta = createDelta('moderator', 'host1')
        .negate(originalDelta.id)
        .buildV1();
      

      // Create another non-negated delta
      const nonNegatedDelta = createDelta('user2', 'host1')
        .setProperty('user123', 'age', 25)
        .buildV1();

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
      const originalDelta = createDelta('user1', 'host1')
        .setProperty('post1', 'content', 'Original content')
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(originalDelta.id).buildV1();
      const negation2 = createDelta('mod2', 'host1').negate(originalDelta.id).buildV1();

      lossless.ingestDelta(originalDelta);
      lossless.ingestDelta(negation1);
      lossless.ingestDelta(negation2);

      const view = lossless.view(['post1']);
      
      // Original delta should be negated (not visible)
      expect(view.post1).toBeUndefined();
    });

    it('should provide negation statistics for entities', () => {
      const delta1 = createDelta('user1', 'host1')
        .setProperty('article1', 'title', 'Original Title')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('article1', 'content', 'Article content')
        .buildV1();

      const negation1 = createDelta('mod1', 'host1').negate(delta1.id).buildV1();

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
      const originalDelta = createDelta('user1', 'host1')
        .setProperty('task1', 'status', 'pending')
        .buildV1();

      const negationDelta = createDelta('admin', 'host1').negate(originalDelta.id).buildV1();

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
      lossless.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 2)
        .buildV1()
      );

      // Create original delta in transaction
      const originalDelta = createDelta('user1', 'host1')
        .declareTransaction(transactionId, 2)
        .setProperty('post1', 'comments', 'Inappropriate comment')
        .buildV1();

      // Create negation delta in same transaction
      const negationDelta = createDelta('moderator', 'host1').negate(originalDelta.id).buildV1();
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
      const postDelta = createDelta('user1', 'host1')
        .withTimestamp(baseTime)
        .setProperty('post1', 'content', 'Original post')
        .buildV1();

      // Moderator negates it
      const negationDelta = createDelta('moderator', 'host1').negate(postDelta.id).buildV1();
      negationDelta.timeCreated = baseTime + 1000;

      // User edits content (after negation)
      const editDelta = createDelta('user1', 'host1')
        .withTimestamp(baseTime + 2000)
        .setProperty('post1', 'content', 'Edited post')
        .buildV1();

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
      const negationDelta = createDelta('moderator', 'host1').negate('non-existent-delta-id').buildV1();

      lossless.ingestDelta(negationDelta);

      // Should not crash and stats should reflect the orphaned negation
      const stats = lossless.getNegationStats('entity1');
      expect(stats.negationDeltas).toBe(0); // No negations for this entity
    });

    it('should handle self-referential entities in negations', () => {
      // Create a delta that references itself
      const selfRefDelta = createDelta('user1', 'host1')
        .setProperty('node1', 'parent', 'node1')
        .setProperty('node1', 'child', 'node1') // Self-reference
        .buildV1();

      const negationDelta = createDelta('admin', 'host1').negate(selfRefDelta.id).buildV1();

      lossless.ingestDelta(selfRefDelta);
      lossless.ingestDelta(negationDelta);

      const view = lossless.view(['node1']);
      expect(view.node1).toBeUndefined(); // Should be negated
    });

    it('should handle multiple direct negations of the same delta', () => {
      const testNode = new RhizomeNode();
      const testLossless = new Lossless(testNode);
      
      // Create the original delta
      const originalDelta = createDelta('user1', 'host1')
        .setProperty('entity2', 'title', 'Draft')
        .buildV1();

      // Create two negations of the same delta
      const negation1 = createDelta('user2', 'host1').negate(originalDelta.id).buildV1();
      const negation2 = createDelta('user3', 'host1').negate(originalDelta.id).buildV1();

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
      const deltaA = createDelta('user1', 'host1')
        .setProperty('entity3', 'content', 'Hello World')
        .buildV1();

      // Create a chain of negations: B negates A, C negates B, D negates C
      const deltaB = createDelta('user2', 'host1').negate(deltaA.id).buildV1();
      const deltaC = createDelta('user3', 'host1').negate(deltaB.id).buildV1();
      const deltaD = createDelta('user4', 'host1').negate(deltaC.id).buildV1();

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
      const delta1 = createDelta('user1', 'host1')
        .setProperty('entity4', 'item', 'Item 1')
        .buildV1();

      const delta2 = createDelta('user2', 'host1')
        .setProperty('entity4', 'item', 'Item 2')
        .buildV1();

      // Create negations for both deltas
      const negation1 = createDelta('user3', 'host1').negate(delta1.id).buildV1();
      const negation2 = createDelta('user4', 'host1').negate(delta2.id).buildV1();

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