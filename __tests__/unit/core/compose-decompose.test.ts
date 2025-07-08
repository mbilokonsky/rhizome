/**
 * Tests for lossless view compose() and decompose() bidirectional conversion
 * Ensures that deltas can be composed into lossless views and decomposed back
 * to the original deltas with all pointer relationships preserved.
 */

import { RhizomeNode } from '@src/node';
import { createDelta } from '@src/core/delta-builder';

describe('Lossless View Compose/Decompose', () => {
  let node: RhizomeNode;

  beforeEach(() => {
    node = new RhizomeNode();
  });

  describe('Bidirectional Conversion', () => {
    test('should compose and decompose simple entity deltas correctly', () => {
      // Create simple entity deltas
      const nameDeltas = [
        createDelta('test-creator', 'test-host')
          .addPointer('users', 'alice', 'name')
          .addPointer('name', 'Alice Smith')
          .buildV1(),
        createDelta('test-creator', 'test-host')
          .addPointer('users', 'alice', 'email')
          .addPointer('email', 'alice@example.com')
          .buildV1()
      ];

      // Ingest the deltas
      nameDeltas.forEach(delta => node.lossless.ingestDelta(delta));

      // Compose lossless view
      const composed = node.lossless.compose(['alice']);
      const aliceView = composed['alice'];

      expect(aliceView).toBeDefined();
      expect(aliceView.id).toBe('alice');
      expect(aliceView.propertyDeltas.name).toHaveLength(1);
      expect(aliceView.propertyDeltas.email).toHaveLength(1);

      // Decompose back to deltas
      const decomposed = node.lossless.decompose(aliceView);

      expect(decomposed).toHaveLength(2);
      
      // Check that original delta ids are preserved
      const originalIds = nameDeltas.map(d => d.id).sort();
      const decomposedIds = decomposed.map(d => d.id).sort();
      expect(decomposedIds).toEqual(originalIds);

      // Verify pointer structure is preserved
      const nameDataDelta = decomposed.find(d => 
        d.pointers.some(p => p.localContext === 'name' && p.target === 'Alice Smith')
      );
      expect(nameDataDelta).toBeDefined();
      expect(nameDataDelta?.pointers).toHaveLength(2);
      
      const upPointer = nameDataDelta?.pointers.find(p => p.targetContext === 'name');
      expect(upPointer).toBeDefined();
      expect(upPointer?.target).toBe('alice');
      expect(upPointer?.localContext).toBe('users');
    });

    test('should handle multi-pointer relationship deltas correctly', () => {
      // Create a complex relationship delta
      const relationshipDelta = createDelta('test-creator', 'test-host')
        .addPointer('users', 'alice', 'relationships')
        .addPointer('partner', 'bob')
        .addPointer('type', 'friendship')
        .addPointer('since', '2020-01-15')
        .addPointer('intensity', 8)
        .buildV1();

      node.lossless.ingestDelta(relationshipDelta);

      // Compose and decompose
      const composed = node.lossless.compose(['alice']);
      const aliceView = composed['alice'];
      const decomposed = node.lossless.decompose(aliceView);

      expect(decomposed).toHaveLength(1);
      const reconstituted = decomposed[0];

      // Should have all 5 pointers
      expect(reconstituted.pointers).toHaveLength(5);

      // Check that all pointer types are preserved
      const contexts = reconstituted.pointers.map(p => p.localContext).sort();
      expect(contexts).toEqual(['users', 'partner', 'type', 'since', 'intensity'].sort());

      // Check that the "up" pointer to alice is correctly reconstructed
      const upPointer = reconstituted.pointers.find(p => p.targetContext === 'relationships');
      expect(upPointer).toBeDefined();
      expect(upPointer?.target).toBe('alice');
      expect(upPointer?.localContext).toBe('users');

      // Check scalar values are preserved
      const intensityPointer = reconstituted.pointers.find(p => p.localContext === 'intensity');
      expect(intensityPointer?.target).toBe(8);
    });

    test('should handle reference relationships correctly', () => {
      // Create entities first
      const aliceDelta = createDelta('test-creator', 'test-host')
        .addPointer('users', 'alice', 'name')
        .addPointer('name', 'Alice')
        .buildV1();

      const bobDelta = createDelta('test-creator', 'test-host')
        .addPointer('users', 'bob', 'name')
        .addPointer('name', 'Bob')
        .buildV1();

      // Create friendship relationship
      const friendshipDelta = createDelta('test-creator', 'test-host')
        .addPointer('users', 'alice', 'friends')
        .addPointer('friend', 'bob', 'friends')
        .buildV1();

      [aliceDelta, bobDelta, friendshipDelta].forEach(d => node.lossless.ingestDelta(d));

      // Compose Alice's view
      const composed = node.lossless.compose(['alice']);
      const aliceView = composed['alice'];

      expect(aliceView.propertyDeltas.friends).toHaveLength(1);

      // Decompose and verify the friendship delta is correctly reconstructed
      const decomposed = node.lossless.decompose(aliceView);
      const friendshipReconstituted = decomposed.find(d => 
        d.pointers.some(p => p.localContext === 'friend')
      );

      expect(friendshipReconstituted).toBeDefined();
      expect(friendshipReconstituted?.pointers).toHaveLength(2);

      // Check both reference pointers are preserved
      const alicePointer = friendshipReconstituted?.pointers.find(p => p.target === 'alice');
      const bobPointer = friendshipReconstituted?.pointers.find(p => p.target === 'bob');

      expect(alicePointer).toBeDefined();
      expect(alicePointer?.targetContext).toBe('friends');
      expect(bobPointer).toBeDefined();
      expect(bobPointer?.targetContext).toBe('friends');
    });

    test('should preserve delta metadata correctly', () => {
      const originalDelta = createDelta('test-creator', 'test-host')
        .addPointer('users', 'alice', 'name')
        .addPointer('name', 'Alice')
        .buildV1();

      node.lossless.ingestDelta(originalDelta);

      const composed = node.lossless.compose(['alice']);
      const decomposed = node.lossless.decompose(composed['alice']);

      expect(decomposed).toHaveLength(1);
      const reconstituted = decomposed[0];

      // Check metadata preservation
      expect(reconstituted.id).toBe(originalDelta.id);
      expect(reconstituted.creator).toBe(originalDelta.creator);
      expect(reconstituted.host).toBe(originalDelta.host);
      expect(reconstituted.timeCreated).toBe(originalDelta.timeCreated);
    });

    test('should handle multiple deltas for the same property', () => {
      // Create multiple name changes for alice
      const nameDeltas = [
        createDelta('test-creator', 'test-host')
          .addPointer('users', 'alice', 'name')
          .addPointer('name', 'Alice')
          .buildV1(),
        createDelta('test-creator', 'test-host')
          .addPointer('users', 'alice', 'name')
          .addPointer('name', 'Alice Smith')
          .buildV1(),
        createDelta('test-creator', 'test-host')
          .addPointer('users', 'alice', 'name')
          .addPointer('name', 'Alice Johnson')
          .buildV1()
      ];

      nameDeltas.forEach(d => node.lossless.ingestDelta(d));

      const composed = node.lossless.compose(['alice']);
      const aliceView = composed['alice'];

      // Should have 3 deltas for the name property
      expect(aliceView.propertyDeltas.name).toHaveLength(3);

      const decomposed = node.lossless.decompose(aliceView);

      // Should decompose back to 3 separate deltas
      expect(decomposed).toHaveLength(3);

      // All original delta IDs should be preserved
      const originalIds = nameDeltas.map(d => d.id).sort();
      const decomposedIds = decomposed.map(d => d.id).sort();
      expect(decomposedIds).toEqual(originalIds);
    });
  });
});