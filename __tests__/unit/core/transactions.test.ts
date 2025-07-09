import { createDelta } from '@src/core/delta-builder';
import { Hyperview } from '@src/views';
import { RhizomeNode } from '@src/node';
import { DeltaFilter } from '@src/core';

describe('Transactions', () => {
  let node: RhizomeNode;
  let hyperview: Hyperview;

  beforeEach(() => {
    node = new RhizomeNode();
    hyperview = new Hyperview(node);
  });

  describe('Transaction-based filtering', () => {
    test('should exclude deltas from incomplete transactions', () => {
      const transactionId = 'tx-123';
      
      // Create a delta that declares a transaction with size 3
      const txDeclaration = createDelta('system', 'host1')
        .declareTransaction(transactionId, 3)
        .buildV1();

      // Create first delta in transaction
      const delta1 = createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('user123', 'name', 'Alice')
        .buildV1();

      // Create second delta in transaction
      const delta2 = createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('user123', 'age', 25)
        .buildV1();

      // Ingest transaction declaration and first two deltas
      hyperview.ingestDelta(txDeclaration);
      hyperview.ingestDelta(delta1);
      hyperview.ingestDelta(delta2);

      // View should be empty because transaction is incomplete (2/3 deltas)
      const view = hyperview.compose(['user123']);
      expect(view.user123).toBeUndefined();

      // Add the third delta to complete the transaction
      const delta3 = createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('user123', 'email', 'alice@example.com')
        .buildV1();

      hyperview.ingestDelta(delta3);

      // Now the view should include all deltas from the completed transaction
      const completeView = hyperview.compose(['user123']);
      expect(completeView.user123).toBeDefined();
      expect(completeView.user123.propertyDeltas.name).toHaveLength(1);
      expect(completeView.user123.propertyDeltas.age).toHaveLength(1);
      expect(completeView.user123.propertyDeltas.email).toHaveLength(1);
    });

    test('should handle multiple transactions independently', () => {
      const tx1 = 'tx-001';
      const tx2 = 'tx-002';

      // Declare two transactions
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(tx1, 2)
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(tx2, 2)
        .buildV1()
      );

      // Add deltas for both transactions
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(tx1)
        .setProperty('order1', 'status', 'pending')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user2', 'host2')
        .inTransaction(tx2)
        .setProperty('order2', 'status', 'shipped')
        .buildV1()
      );

      // Neither transaction is complete
      let view = hyperview.compose(['order1', 'order2']);
      expect(view.order1).toBeUndefined();
      expect(view.order2).toBeUndefined();

      // Complete tx1
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(tx1)
        .setProperty('order1', 'total', 100)
        .buildV1()
      );

      // tx1 is complete, tx2 is not
      view = hyperview.compose(['order1', 'order2']);
      expect(view.order1).toBeDefined();
      expect(view.order1.propertyDeltas.status).toHaveLength(1);
      expect(view.order1.propertyDeltas.total).toHaveLength(1);
      expect(view.order2).toBeUndefined();

      // Complete tx2
      hyperview.ingestDelta(createDelta('user2', 'host2')
        .inTransaction(tx2)
        .setProperty('order2', 'tracking', 'TRACK123')
        .buildV1()
      );

      // Both transactions complete
      view = hyperview.compose(['order1', 'order2']);
      expect(view.order1).toBeDefined();
      expect(view.order2).toBeDefined();
      expect(view.order2.propertyDeltas.status).toHaveLength(1);
      expect(view.order2.propertyDeltas.tracking).toHaveLength(1);
    });

    test('should work with transaction-aware delta filters', () => {
      const transactionId = 'tx-filter-test';

      // Create transaction with 2 deltas
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 2)
        .buildV1()
      );

      // Add both deltas
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('doc1', 'type', 'report')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user2', 'host2')
        .inTransaction(transactionId)
        .setProperty('doc1', 'author', 'Bob')
        .buildV1()
      );

      // Create a filter that only accepts deltas from user1
      const userFilter: DeltaFilter = (delta) => delta.creator === 'user1';

      // With incomplete transaction, nothing should show
      // But once complete, the filter should still apply
      const view = hyperview.compose(['doc1'], userFilter);
      
      // Even though transaction is complete, only delta from user1 should appear
      expect(view.doc1).toBeDefined();
      expect(view.doc1.propertyDeltas.type).toHaveLength(1);
      expect(view.doc1.propertyDeltas.author).toBeUndefined();
    });

    test('should handle transaction with deltas affecting multiple entities', () => {
      const transactionId = 'tx-multi-entity';

      // Transaction that updates multiple entities atomically
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 3)
        .buildV1()
      );

      // Transfer money from account1 to account2
      hyperview.ingestDelta(createDelta('bank', 'host1')
        .inTransaction(transactionId)
        .addPointer('balance', 'account1', 'balance')
        .addPointer('value', 900)
        .addPointer('operation', 'debit')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('bank', 'host1')
        .inTransaction(transactionId)
        .addPointer('balance', 'account2', 'balance')
        .addPointer('value', 1100)
        .addPointer('operation', 'credit')
        .buildV1()
      );

      // Transaction incomplete - no entities should show updates
      let view = hyperview.compose(['account1', 'account2']);
      expect(view.account1).toBeUndefined();
      expect(view.account2).toBeUndefined();

      // Complete transaction with audit log
      hyperview.ingestDelta(createDelta('bank', 'host1')
        .inTransaction(transactionId)
        .addPointer('transfer', 'transfer123', 'details')
        .addPointer('from', 'account1')
        .addPointer('to', 'account2')
        .addPointer('amount', 100)
        .buildV1()
      );

      // All entities should now be visible
      view = hyperview.compose(['account1', 'account2', 'transfer123']);
      expect(view.account1).toBeDefined();
      expect(view.account1.propertyDeltas.balance).toHaveLength(1);
      expect(view.account2).toBeDefined();
      expect(view.account2.propertyDeltas.balance).toHaveLength(1);
      expect(view.transfer123).toBeDefined();
      expect(view.transfer123.propertyDeltas.details).toHaveLength(1);
    });

    test('should emit events only when transactions complete', async () => {
      const transactionId = 'tx-events';
      const updateEvents: Array<{ entityId: string, deltaIds: string[] }> = [];

      // Listen for update events
      hyperview.eventStream.on('updated', (entityId: string, deltaIds: string[]) => {
        updateEvents.push({ entityId, deltaIds });
      });

      // Create transaction
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 2)
        .buildV1()
      );

      // Add first delta
      const delta1 = createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('entity1', 'field1', 'value1')
        .buildV1();
      hyperview.ingestDelta(delta1);

      // No events should be emitted yet
      expect(updateEvents).toHaveLength(0);

      // Add second delta to complete transaction
      const delta2 = createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('entity1', 'field2', 'value2')
        .buildV1();
      hyperview.ingestDelta(delta2);

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

    test('should support waiting for transaction completion', async () => {
      const transactionId = 'tx-wait';

      // Create transaction
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 2)
        .buildV1()
      );

      // Add first delta
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('job1', 'status', 'processing')
        .buildV1()
      );

      // Start waiting for transaction
      const waitPromise = hyperview.transactions.waitFor(transactionId);
      let isResolved = false;
      waitPromise.then(() => { isResolved = true; });

      // Should not be resolved yet
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(isResolved).toBe(false);

      // Complete transaction
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('job1', 'status', 'completed')
        .buildV1()
      );

      // Wait should now resolve
      await waitPromise;
      expect(isResolved).toBe(true);

      // View should show completed transaction
      const view = hyperview.compose(['job1']);
      expect(view.job1).toBeDefined();
      expect(view.job1.propertyDeltas.status).toHaveLength(2);
    });

    test('should handle non-transactional deltas normally', () => {
      // Regular delta without transaction
      const regularDelta = createDelta('user1', 'host1')
        .addPointer('name', 'user456', 'name')
        .addPointer('value', 'Charlie')
        .buildV1();

      const updateEvents: string[] = [];
      hyperview.eventStream.on('updated', (entityId: string) => {
        updateEvents.push(entityId);
      });

      hyperview.ingestDelta(regularDelta);

      // Should immediately appear in view
      const view = hyperview.compose(['user456']);
      expect(view.user456).toBeDefined();
      expect(view.user456.propertyDeltas.name).toHaveLength(1);

      // Should immediately emit update event
      expect(updateEvents).toContain('user456');
    });
  });

  describe('Transaction edge cases', () => {
    test('should handle transaction size updates', () => {
      const transactionId = 'tx-resize';

      // Initially declare transaction with size 2
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 2)
        .buildV1()
      );

      // Add 2 deltas
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('cart1', 'items', 'item1')
        .buildV1()
      );

      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('cart1', 'items', 'item2')
        .buildV1()
      );

      // Transaction should be complete
      expect(hyperview.transactions.isComplete(transactionId)).toBe(true);
      
      // View should show the cart
      const view = hyperview.compose(['cart1']);
      expect(view.cart1).toBeDefined();
    });

    test('should handle missing transaction size gracefully', () => {
      const transactionId = 'tx-no-size';

      // Add delta with transaction reference but no size declaration
      hyperview.ingestDelta(createDelta('user1', 'host1')
        .inTransaction(transactionId)
        .setProperty('entity1', 'data', 'test')
        .buildV1()
      );

      // Transaction should not be complete (no size)
      expect(hyperview.transactions.isComplete(transactionId)).toBe(false);

      // Delta should not appear in view
      const view = hyperview.compose(['entity1']);
      expect(view.entity1).toBeUndefined();

      // Declare size after the fact
      hyperview.ingestDelta(createDelta('system', 'host1')
        .declareTransaction(transactionId, 1)
        .buildV1()
      );

      // Now transaction should be complete
      expect(hyperview.transactions.isComplete(transactionId)).toBe(true);

      // And delta should appear in view
      const viewAfter = hyperview.compose(['entity1']);
      expect(viewAfter.entity1).toBeDefined();
    });
  });
});