/**
 * Tests for lossless view compose() and decompose() bidirectional conversion
 * Ensures that deltas can be composed into lossless views and decomposed back
 * to the original deltas with all pointer relationships preserved.
 */

import { RhizomeNode } from '../src/node';
import { Delta } from '../src/delta';

describe('Lossless View Compose/Decompose', () => {
  let node: RhizomeNode;

  beforeEach(() => {
    node = new RhizomeNode();
  });

  describe('Bidirectional Conversion', () => {
    it('should compose and decompose simple entity deltas correctly', () => {
      // Create simple entity deltas
      const nameDeltas = [
        new Delta({
          creator: 'test-creator',
          host: 'test-host',
          pointers: [
            { localContext: 'users', target: 'alice', targetContext: 'name' },
            { localContext: 'name', target: 'Alice Smith' }
          ]
        }),
        new Delta({
          creator: 'test-creator',
          host: 'test-host',
          pointers: [
            { localContext: 'users', target: 'alice', targetContext: 'email' },
            { localContext: 'email', target: 'alice@example.com' }
          ]
        })
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
      
      // Check that original deltas are preserved
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

    it('should handle multi-pointer relationship deltas correctly', () => {
      // Create a complex relationship delta
      const relationshipDelta = new Delta({
        creator: 'test-creator',
        host: 'test-host',
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'relationships' },
          { localContext: 'partner', target: 'bob' },
          { localContext: 'type', target: 'friendship' },
          { localContext: 'since', target: '2020-01-15' },
          { localContext: 'intensity', target: 8 }
        ]
      });

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

    it('should handle reference relationships correctly', () => {
      // Create entities first
      const aliceDelta = new Delta({
        creator: 'test-creator',
        host: 'test-host',
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'name' },
          { localContext: 'name', target: 'Alice' }
        ]
      });

      const bobDelta = new Delta({
        creator: 'test-creator',
        host: 'test-host',
        pointers: [
          { localContext: 'users', target: 'bob', targetContext: 'name' },
          { localContext: 'name', target: 'Bob' }
        ]
      });

      // Create friendship relationship
      const friendshipDelta = new Delta({
        creator: 'test-creator',
        host: 'test-host',
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friend', target: 'bob', targetContext: 'friends' }
        ]
      });

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

    it('should preserve delta metadata correctly', () => {
      const originalDelta = new Delta({
        creator: 'test-creator',
        host: 'test-host',
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'name' },
          { localContext: 'name', target: 'Alice' }
        ]
      });

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

    it('should handle multiple deltas for the same property', () => {
      // Create multiple name changes for alice
      const nameDeltas = [
        new Delta({
          creator: 'test-creator',
          host: 'test-host',
          pointers: [
            { localContext: 'users', target: 'alice', targetContext: 'name' },
            { localContext: 'name', target: 'Alice' }
          ]
        }),
        new Delta({
          creator: 'test-creator',
          host: 'test-host',
          pointers: [
            { localContext: 'users', target: 'alice', targetContext: 'name' },
            { localContext: 'name', target: 'Alice Smith' }
          ]
        }),
        new Delta({
          creator: 'test-creator',
          host: 'test-host',
          pointers: [
            { localContext: 'users', target: 'alice', targetContext: 'name' },
            { localContext: 'name', target: 'Alice Johnson' }
          ]
        })
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