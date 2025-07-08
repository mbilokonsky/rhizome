import { createDelta } from '@src/core/delta-builder';
import { DeltaV1, DeltaV2 } from '@src/core/delta';
import { Lossless } from '@src/views/lossless';
import { RhizomeNode } from '@src/node';
import { TimestampResolver } from '@src/views/resolvers/timestamp-resolvers';

describe('DeltaBuilder', () => {
  const creator = 'creator-123';
  const host = 'host-456';
  const node = new RhizomeNode();

  describe('V1 Deltas', () => {
    test('should create a basic V1 delta', () => {
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

    test('should create a V1 delta with setProperty', () => {
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
      const lossy = new TimestampResolver(lossless);
      lossless.ingestDelta(delta);
      const result = lossy.resolve();
      expect(result).toBeDefined();
      expect(result!['entity-1'].properties.name).toBe('Test Entity');
    });

    test('should create a V1 delta with setProperty and entityLabel', () => {
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
      const lossy = new TimestampResolver(lossless);
      lossless.ingestDelta(delta);
      const result = lossy.resolve();
      expect(result).toBeDefined();
      expect(result!['entity-1'].properties.name).toBe('Test Entity');
    });

    test('should create a V1 delta with relationships', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'user-2', 'follows')
        .buildV1();

        // This delta sets values on a new relationship entity

      expect(delta.pointers).toContainEqual({
        localContext: '_rel_target',
        target: expect.any(String),
        targetContext: 'target'
      });
      const relId = delta.pointers.find(p => p.localContext === '_rel_target')?.target;
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_source',
        target: relId,
        targetContext: 'source'
      });
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_type',
        target: relId,
        targetContext: 'type'
      });
    });

    test('should create a V1 delta with relationships and properties', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'user-2', 'follows', { version: 1})
        .buildV1();

      // This delta sets values on a new relationship entity
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_target',
        target: expect.any(String),
        targetContext: 'target'
      });
      const relId = delta.pointers.find(p => p.localContext === '_rel_target')?.target;
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_source',
        target: relId,
        targetContext: 'source'
      });
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_type',
        target: relId,
        targetContext: 'type'
      });
      expect(delta.pointers).toContainEqual({
        localContext: '_rel_version',
        target: relId,
        targetContext: 'version'
      });
    });
  });

  describe('V2 Deltas', () => {
    test('should create a basic V2 delta', () => {
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

    test('should create a V2 delta with setProperty', () => {
      const delta = createDelta(creator, host)
        .setProperty('entity-1', 'name', 'Test Entity')
        .buildV2();

      expect(delta.pointers).toHaveProperty('name', 'Test Entity');
      expect(delta.pointers).toHaveProperty('entity', { 'entity-1': 'name' });
    });

    test('should create a V2 delta with relationships', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'user-2', 'follows')
        .buildV2();

      expect(delta.pointers).toHaveProperty('_rel_source');
      const [relId] = Object.entries(delta.pointers._rel_source!)[0];
      expect(delta.pointers).toHaveProperty('_rel_source', { [relId]: 'source' });
      expect(delta.pointers).toHaveProperty('_rel_target', { [relId]: 'target' });
      expect(delta.pointers).toHaveProperty('_rel_type', { [relId]: 'type' });
      expect(delta.pointers).toHaveProperty('source', 'user-1');
      expect(delta.pointers).toHaveProperty('target', 'user-2');
      expect(delta.pointers).toHaveProperty('type', 'follows');

      const lossless = new Lossless(node);
      const lossy = new TimestampResolver(lossless);
      lossless.ingestDelta(delta);
      const result = lossy.resolve([relId]);
      expect(result).toBeDefined();
      expect(result![relId]).toMatchObject({
        properties: {
          source: 'user-1',
          target: 'user-2',
          type: 'follows'
        }
      });
    });

    test('should create a V2 delta with relationships and properties', () => {
      const delta = createDelta(creator, host)
        .relate('user-1', 'user-2', 'follows', { version: 1})
        .buildV2();

      expect(delta.pointers).toHaveProperty('_rel_source');
      const [relId] = Object.entries(delta.pointers._rel_source!)[0];
      expect(delta.pointers).toHaveProperty('_rel_source', { [relId]: 'source' });
      expect(delta.pointers).toHaveProperty('_rel_target', { [relId]: 'target' });
      expect(delta.pointers).toHaveProperty('_rel_type', { [relId]: 'type' });
      expect(delta.pointers).toHaveProperty('_rel_version', { [relId]: 'version' });
      expect(delta.pointers).toHaveProperty('source', 'user-1');
      expect(delta.pointers).toHaveProperty('target', 'user-2');
      expect(delta.pointers).toHaveProperty('type', 'follows');
      expect(delta.pointers).toHaveProperty('version', 1);

      const lossless = new Lossless(node);
      const lossy = new TimestampResolver(lossless);
      lossless.ingestDelta(delta);
      const result = lossy.resolve([relId]);
      expect(result).toBeDefined();
      expect(result![relId]).toMatchObject({
        properties: {
          source: 'user-1',
          target: 'user-2',
          type: 'follows',
          version: 1
        }
      });
    });
  });

  describe('Common functionality', () => {
    test('should support custom IDs', () => {
      const customId = 'custom-delta-id';
      const delta = createDelta(creator, host)
        .withId(customId)
        .buildV1();

      expect(delta.id).toBe(customId);
    });

    test('should support transactions', () => {
      const txId = 'tx-123';
      const delta = createDelta(creator, host)
        .inTransaction(txId)
        .buildV1();

      // Check for transaction ID in pointers
      expect(delta.pointers).toContainEqual({
        localContext: '_transaction',
        target: txId,
        targetContext: 'deltas'
      });
    });

    test('should support transactions in V2', () => {
      const txId = 'tx-123';
      const delta = createDelta(creator, host)
        .inTransaction(txId)
        .buildV2();

      // Check for transaction ID in V2 pointers
      expect(delta.pointers['_transaction']).toEqual({ [txId]: 'deltas' });
    });

    test('should support negation', () => {
      const negatedId = 'delta-to-negate';
      const delta = createDelta(creator, host)
        .negate(negatedId)
        .buildV1();

      // Check for negation in pointers
      const negationPointer = delta.pointers.find(p => p.localContext === '_negates');
      expect(negationPointer).toBeDefined();
      expect(negationPointer?.target).toBe(negatedId);
    });

    test('should support custom timestamps', () => {
      const timestamp = Date.now();
      const delta = createDelta(creator, host)
        .withTimestamp(timestamp)
        .buildV1();

      expect(delta.timeCreated).toBe(timestamp);
    });
  });
});
