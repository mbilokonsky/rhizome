import * as _RhizomeImports from "../src";
import { Delta } from '../src/core';
import { Lossless } from '../src/views';
import { RhizomeNode } from '../src/node';
import { DeltaFilter } from '../src/core';

describe('Transactions', () => {
  let node: RhizomeNode;
  let lossless: Lossless;

  beforeEach(() => {
    node = new RhizomeNode();
    lossless = new Lossless(node);
  });

  describe('Transaction-based filtering', () => {
    it('should exclude deltas from incomplete transactions', () => {
      const transactionId = 'tx-123';
      
      // Create a delta that declares a transaction with size 3
      const txDeclaration = new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 3 }
        ]
      });

      // Create first delta in transaction
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'name', target: 'user123', targetContext: 'name' },
          { localContext: 'value', target: 'Alice' }
        ]
      });

      // Create second delta in transaction
      const delta2 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'age', target: 'user123', targetContext: 'age' },
          { localContext: 'value', target: 25 }
        ]
      });

      // Ingest transaction declaration and first two deltas
      lossless.ingestDelta(txDeclaration);
      lossless.ingestDelta(delta1);
      lossless.ingestDelta(delta2);

      // View should be empty because transaction is incomplete (2/3 deltas)
      const view = lossless.view(['user123']);
      expect(view.user123).toBeUndefined();

      // Add the third delta to complete the transaction
      const delta3 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'email', target: 'user123', targetContext: 'email' },
          { localContext: 'value', target: 'alice@example.com' }
        ]
      });

      lossless.ingestDelta(delta3);

      // Now the view should include all deltas from the completed transaction
      const completeView = lossless.view(['user123']);
      expect(completeView.user123).toBeDefined();
      expect(completeView.user123.propertyDeltas.name).toHaveLength(1);
      expect(completeView.user123.propertyDeltas.age).toHaveLength(1);
      expect(completeView.user123.propertyDeltas.email).toHaveLength(1);
    });

    it('should handle multiple transactions independently', () => {
      const tx1 = 'tx-001';
      const tx2 = 'tx-002';

      // Declare two transactions
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: tx1, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: tx2, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Add deltas for both transactions
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: tx1, targetContext: 'deltas' },
          { localContext: 'status', target: 'order1', targetContext: 'status' },
          { localContext: 'value', target: 'pending' }
        ]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user2',
        host: 'host2',
        pointers: [
          { localContext: '_transaction', target: tx2, targetContext: 'deltas' },
          { localContext: 'status', target: 'order2', targetContext: 'status' },
          { localContext: 'value', target: 'shipped' }
        ]
      }));

      // Neither transaction is complete
      let view = lossless.view(['order1', 'order2']);
      expect(view.order1).toBeUndefined();
      expect(view.order2).toBeUndefined();

      // Complete tx1
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: tx1, targetContext: 'deltas' },
          { localContext: 'total', target: 'order1', targetContext: 'total' },
          { localContext: 'value', target: 100 }
        ]
      }));

      // tx1 is complete, tx2 is not
      view = lossless.view(['order1', 'order2']);
      expect(view.order1).toBeDefined();
      expect(view.order1.propertyDeltas.status).toHaveLength(1);
      expect(view.order1.propertyDeltas.total).toHaveLength(1);
      expect(view.order2).toBeUndefined();

      // Complete tx2
      lossless.ingestDelta(new Delta({
        creator: 'user2',
        host: 'host2',
        pointers: [
          { localContext: '_transaction', target: tx2, targetContext: 'deltas' },
          { localContext: 'tracking', target: 'order2', targetContext: 'tracking' },
          { localContext: 'value', target: 'TRACK123' }
        ]
      }));

      // Both transactions complete
      view = lossless.view(['order1', 'order2']);
      expect(view.order1).toBeDefined();
      expect(view.order2).toBeDefined();
      expect(view.order2.propertyDeltas.status).toHaveLength(1);
      expect(view.order2.propertyDeltas.tracking).toHaveLength(1);
    });

    it('should work with transaction-aware delta filters', () => {
      const transactionId = 'tx-filter-test';

      // Create transaction with 2 deltas
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Add both deltas
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'type', target: 'doc1', targetContext: 'type' },
          { localContext: 'value', target: 'report' }
        ]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user2',
        host: 'host2',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'author', target: 'doc1', targetContext: 'author' },
          { localContext: 'value', target: 'Bob' }
        ]
      }));

      // Create a filter that only accepts deltas from user1
      const userFilter: DeltaFilter = (delta) => delta.creator === 'user1';

      // With incomplete transaction, nothing should show
      // But once complete, the filter should still apply
      const view = lossless.view(['doc1'], userFilter);
      
      // Even though transaction is complete, only delta from user1 should appear
      expect(view.doc1).toBeDefined();
      expect(view.doc1.propertyDeltas.type).toHaveLength(1);
      expect(view.doc1.propertyDeltas.author).toBeUndefined();
    });

    it('should handle transaction with deltas affecting multiple entities', () => {
      const transactionId = 'tx-multi-entity';

      // Transaction that updates multiple entities atomically
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 3 }
        ]
      }));

      // Transfer money from account1 to account2
      lossless.ingestDelta(new Delta({
        creator: 'bank',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'balance', target: 'account1', targetContext: 'balance' },
          { localContext: 'value', target: 900 },
          { localContext: 'operation', target: 'debit' }
        ]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'bank',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'balance', target: 'account2', targetContext: 'balance' },
          { localContext: 'value', target: 1100 },
          { localContext: 'operation', target: 'credit' }
        ]
      }));

      // Transaction incomplete - no entities should show updates
      let view = lossless.view(['account1', 'account2']);
      expect(view.account1).toBeUndefined();
      expect(view.account2).toBeUndefined();

      // Complete transaction with audit log
      lossless.ingestDelta(new Delta({
        creator: 'bank',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'transfer', target: 'transfer123', targetContext: 'details' },
          { localContext: 'from', target: 'account1' },
          { localContext: 'to', target: 'account2' },
          { localContext: 'amount', target: 100 }
        ]
      }));

      // All entities should now be visible
      view = lossless.view(['account1', 'account2', 'transfer123']);
      expect(view.account1).toBeDefined();
      expect(view.account1.propertyDeltas.balance).toHaveLength(1);
      expect(view.account2).toBeDefined();
      expect(view.account2.propertyDeltas.balance).toHaveLength(1);
      expect(view.transfer123).toBeDefined();
      expect(view.transfer123.propertyDeltas.details).toHaveLength(1);
    });

    it('should emit events only when transactions complete', async () => {
      const transactionId = 'tx-events';
      const updateEvents: Array<{ entityId: string, deltaIds: string[] }> = [];

      // Listen for update events
      lossless.eventStream.on('updated', (entityId, deltaIds) => {
        updateEvents.push({ entityId, deltaIds });
      });

      // Create transaction
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Add first delta
      const delta1 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'field1', target: 'entity1', targetContext: 'field1' },
          { localContext: 'value', target: 'value1' }
        ]
      });
      lossless.ingestDelta(delta1);

      // No events should be emitted yet
      expect(updateEvents).toHaveLength(0);

      // Add second delta to complete transaction
      const delta2 = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'field2', target: 'entity1', targetContext: 'field2' },
          { localContext: 'value', target: 'value2' }
        ]
      });
      lossless.ingestDelta(delta2);

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now we should have received update events
      // One for the transaction entity itself, and one for entity1
      expect(updateEvents).toHaveLength(2);
      
      // Find the entity1 update event
      const entity1Update = updateEvents.find(e => e.entityId === 'entity1');
      expect(entity1Update).toBeDefined();
      expect(entity1Update!.deltaIds).toContain(delta1.id);
      expect(entity1Update!.deltaIds).toContain(delta2.id);
    });

    it('should support waiting for transaction completion', async () => {
      const transactionId = 'tx-wait';

      // Create transaction
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Add first delta
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'status', target: 'job1', targetContext: 'status' },
          { localContext: 'value', target: 'processing' }
        ]
      }));

      // Start waiting for transaction
      const waitPromise = lossless.transactions.waitFor(transactionId);
      let isResolved = false;
      waitPromise.then(() => { isResolved = true; });

      // Should not be resolved yet
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(isResolved).toBe(false);

      // Complete transaction
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'status', target: 'job1', targetContext: 'status' },
          { localContext: 'value', target: 'completed' }
        ]
      }));

      // Wait should now resolve
      await waitPromise;
      expect(isResolved).toBe(true);

      // View should show completed transaction
      const view = lossless.view(['job1']);
      expect(view.job1).toBeDefined();
      expect(view.job1.propertyDeltas.status).toHaveLength(2);
    });

    it('should handle non-transactional deltas normally', () => {
      // Regular delta without transaction
      const regularDelta = new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: 'name', target: 'user456', targetContext: 'name' },
          { localContext: 'value', target: 'Charlie' }
        ]
      });

      const updateEvents: string[] = [];
      lossless.eventStream.on('updated', (entityId) => {
        updateEvents.push(entityId);
      });

      lossless.ingestDelta(regularDelta);

      // Should immediately appear in view
      const view = lossless.view(['user456']);
      expect(view.user456).toBeDefined();
      expect(view.user456.propertyDeltas.name).toHaveLength(1);

      // Should immediately emit update event
      expect(updateEvents).toContain('user456');
    });
  });

  describe('Transaction edge cases', () => {
    it('should handle transaction size updates', () => {
      const transactionId = 'tx-resize';

      // Initially declare transaction with size 2
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 2 }
        ]
      }));

      // Add 2 deltas
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'item1', target: 'cart1', targetContext: 'items' }
        ]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'item2', target: 'cart1', targetContext: 'items' }
        ]
      }));

      // Transaction should be complete
      expect(lossless.transactions.isComplete(transactionId)).toBe(true);
      
      // View should show the cart
      const view = lossless.view(['cart1']);
      expect(view.cart1).toBeDefined();
    });

    it('should handle missing transaction size gracefully', () => {
      const transactionId = 'tx-no-size';

      // Add delta with transaction reference but no size declaration
      lossless.ingestDelta(new Delta({
        creator: 'user1',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'data', target: 'entity1', targetContext: 'data' },
          { localContext: 'value', target: 'test' }
        ]
      }));

      // Transaction should not be complete (no size)
      expect(lossless.transactions.isComplete(transactionId)).toBe(false);

      // Delta should not appear in view
      const view = lossless.view(['entity1']);
      expect(view.entity1).toBeUndefined();

      // Declare size after the fact
      lossless.ingestDelta(new Delta({
        creator: 'system',
        host: 'host1',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 1 }
        ]
      }));

      // Now transaction should be complete
      expect(lossless.transactions.isComplete(transactionId)).toBe(true);

      // And delta should appear in view
      const viewAfter = lossless.view(['entity1']);
      expect(viewAfter.entity1).toBeDefined();
    });
  });
});