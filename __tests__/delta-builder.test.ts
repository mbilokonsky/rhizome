import { createDelta } from '../src/core/delta-builder';
import { DeltaV1, DeltaV2 } from '../src/core/delta';
import { Lossless } from '../src/views/lossless';
import { RhizomeNode } from '../src/node';
import { LastWriteWins } from '../src/views/resolvers/last-write-wins';

describe('DeltaBuilder', () => {
  const creator = 'creator-123';
  const host = 'host-456';
  const node = new RhizomeNode();

  describe('V1 Deltas', () => {
    it('should create a basic V1 delta', () => {
      const delta = createDelta(creator, host)
        .addPointer('name', 'Test Delta', 'title')
        .addPointer('description', 'A test delta', 'description')
        .buildV1();

      expect(delta).toBeInstanceOf(DeltaV1);
      expect(delta.id).toBeDefined();
      expect(delta.creator).toBe(creator);
      expect(delta.host).toBe(host);
      expect(delta.pointers).toHaveLength(2);
      expect(delta.pointers[0]).toEqual({
        localContext: 'name',
        target: 'Test Delta',
        targetContext: 'title'
      });
    });

    it('should create a V1 delta with setProperty', () => {
      const delta = createDelta(creator, host)
        .setProperty('entity-1', 'name', 'Test Entity')
        .buildV1();

      expect(delta).toBeInstanceOf(DeltaV1);
      expect(delta.pointers).toContainEqual({
        localContext: 'entity',
        target: 'entity-1',
        targetContext: 'name'
      });
      expect(delta.pointers).toContainEqual({
        localContext: 'name',
        target: 'Test Entity',
      });

      // Verify that the entity property resolves correctly
      const lossless = new Lossless(node);
      lossless.ingestDelta(delta);
      const lossy = new LastWriteWins(lossless);
      const result = lossy.resolve();
      expect(result).toBeDefined();
      expect(result!['entity-1'].properties.name).toBe('Test Entity');
    });

    it('should create a V1 delta with setProperty and entityLabel', () => {
      const delta = createDelta(creator, host)
        .setProperty('entity-1', 'name', 'Test Entity', 'user')
        .buildV1();

      expect(delta).toBeInstanceOf(DeltaV1);
      expect(delta.pointers).toContainEqual({
        localContext: 'user',
        target: 'entity-1',
        targetContext: 'name'
      });
      expect(delta.pointers).toContainEqual({
        localContext: 'name',
        target: 'Test Entity',
      });

      // Verify that the entity property resolves correctly
      const lossless = new Lossless(node);
      lossless.ingestDelta(delta);
      const lossy = new LastWriteWins(lossless);
      const result = lossy.resolve();
      expect(result).toBeDefined();
      expect(result!['entity-1'].properties.name).toBe('Test Entity');
    });

    it('should create a V1 delta with relationships', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'follows', 'user-2')
        .buildV1();

      expect(delta.pointers).toContainEqual({
        localContext: 'follows',
        target: 'user-2',
        targetContext: 'follows'
      });
      expect(delta.pointers).toContainEqual({
        localContext: 'source',
        target: 'user-1',
        targetContext: 'follows'
      });
    });
  });

  describe('V2 Deltas', () => {
    it('should create a basic V2 delta', () => {
      const delta = createDelta(creator, host)
        .addPointer('name', 'Test Delta V2', 'title')
        .buildV2();

      expect(delta).toBeInstanceOf(DeltaV2);
      expect(delta.id).toBeDefined();
      expect(delta.creator).toBe(creator);
      expect(delta.host).toBe(host);
      expect(delta.pointers).toHaveProperty('name');
      expect(delta.pointers.name).toEqual({ 'Test Delta V2': 'title' });
    });

    it('should create a V2 delta with setProperty', () => {
      const delta = createDelta(creator, host)
        .setProperty('entity-1', 'name', 'Test Entity')
        .buildV2();

      expect(delta.pointers).toHaveProperty('name', 'Test Entity');
      expect(delta.pointers).toHaveProperty('entity', { 'entity-1': 'name' });
    });

    it('should create a V2 delta with relationships', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'follows', 'user-2')
        .buildV2();

      expect(delta.pointers).toHaveProperty('follows', { 'user-2': 'follows' });
      expect(delta.pointers).toHaveProperty('source', { 'user-1': 'follows' });
    });
  });

  describe('Common functionality', () => {
    it('should support custom IDs', () => {
      const customId = 'custom-delta-id';
      const delta = createDelta(creator, host)
        .withId(customId)
        .buildV1();

      expect(delta.id).toBe(customId);
    });

    it('should support transactions', () => {
      const txId = 'tx-123';
      const delta = createDelta(creator, host)
        .inTransaction(txId)
        .buildV1();

      // Check for transaction ID in pointers
      const txPointer = delta.pointers.find(p => p.localContext === '_transaction');
      expect(txPointer).toBeDefined();
      expect(txPointer?.target).toBe(txId);
    });

    it('should support transactions in V2', () => {
      const txId = 'tx-123';
      const delta = createDelta(creator, host)
        .inTransaction(txId)
        .buildV2();

      // Check for transaction ID in V2 pointers
      expect(delta.pointers['_transaction']).toEqual({ [txId]: 'deltas' });
    });

    it('should support negation', () => {
      const negatedId = 'delta-to-negate';
      const delta = createDelta(creator, host)
        .negate(negatedId)
        .buildV1();

      // Check for negation in pointers
      const negationPointer = delta.pointers.find(p => p.localContext === '_negation');
      expect(negationPointer).toBeDefined();
      expect(negationPointer?.target).toBe(negatedId);
    });

    it('should support custom timestamps', () => {
      const timestamp = Date.now();
      const delta = createDelta(creator, host)
        .withTimestamp(timestamp)
        .buildV1();

      expect(delta.timeCreated).toBe(timestamp);
    });
  });
});
