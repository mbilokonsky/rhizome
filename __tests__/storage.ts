import { MemoryDeltaStorage, LevelDBDeltaStorage, StorageFactory } from '../src/storage';
import { createDelta } from '../src/core/delta-builder';
import { Delta } from '../src/core';
import { DeltaQueryStorage } from '../src/storage/interface';

describe('Delta Storage', () => {
  const testDeltas = [
    createDelta('alice', 'host1')
      .withId('delta1')
      .withTimestamp(Date.now() - 1000)
      .setProperty('user1', 'name', 'Alice', 'user')
      .buildV1(),
    createDelta('bob', 'host1')
      .withId('delta2')
      .withTimestamp(Date.now() - 500)
      .setProperty('user1', 'age', 25, 'user')
      .buildV1(),
    createDelta('alice', 'host2')
      .withId('delta3')
      .withTimestamp(Date.now())
      .setProperty('user2', 'name', 'Bob', 'user')
      .buildV1()
  ];

  describe('Memory Storage', () => {
    let storage: DeltaQueryStorage;

    beforeEach(() => {
      storage = new MemoryDeltaStorage();
    });

    afterEach(async () => {
      await storage.close();
    });

    runStorageTests(() => storage as DeltaQueryStorage);
  });

  describe('LevelDB Storage', () => {
    let storage: DeltaQueryStorage;

    beforeEach(async () => {
      storage = new LevelDBDeltaStorage('./test-data/leveldb-test');
      await (storage as LevelDBDeltaStorage).open();
      await (storage as LevelDBDeltaStorage).clearAll();
    });

    afterEach(async () => {
      await storage.close();
    });

    runStorageTests(() => storage);
  });

  describe('Storage Factory', () => {
    it('creates memory storage', () => {
      const storage = StorageFactory.create({ type: 'memory' });
      expect(storage).toBeInstanceOf(MemoryDeltaStorage);
    });

    it('creates LevelDB storage', () => {
      const storage = StorageFactory.create({ 
        type: 'leveldb', 
        path: './test-data/factory-test' 
      });
      expect(storage).toBeInstanceOf(LevelDBDeltaStorage);
    });

    it('throws on unknown storage type', () => {
      expect(() => {
        StorageFactory.create({ type: 'unknown' as 'memory' | 'leveldb' });
      }).toThrow('Unknown storage type: unknown');
    });
  });

  function runStorageTests(getStorage: () => DeltaQueryStorage) {
    it('stores and retrieves deltas', async () => {
      const storage = getStorage();
      
      // Store deltas
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      // Retrieve individual deltas
      const delta1 = await storage.getDelta('delta1');
      expect(delta1).toBeDefined();
      expect(delta1!.id).toBe('delta1');
      expect(delta1!.creator).toBe('alice');

      // Test non-existent delta
      const nonExistent = await storage.getDelta('nonexistent');
      expect(nonExistent).toBeNull();
    });

    it('gets all deltas', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      const allDeltas = await storage.getAllDeltas();
      expect(allDeltas).toHaveLength(3);
      
      const deltaIds = allDeltas.map(d => d.id);
      expect(deltaIds).toContain('delta1');
      expect(deltaIds).toContain('delta2');
      expect(deltaIds).toContain('delta3');
    });

    it('filters deltas', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      // Filter by creator
      const aliceDeltas = await storage.getAllDeltas(d => d.creator === 'alice');
      expect(aliceDeltas).toHaveLength(2);
      expect(aliceDeltas.every(d => d.creator === 'alice')).toBe(true);
    });

    it('gets deltas for entity', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      const user1Deltas = await storage.getDeltasForEntity('user1');
      expect(user1Deltas).toHaveLength(2);
      
      const user2Deltas = await storage.getDeltasForEntity('user2');
      expect(user2Deltas).toHaveLength(1);
      
      const nonExistentDeltas = await storage.getDeltasForEntity('user999');
      expect(nonExistentDeltas).toHaveLength(0);
    });

    it('gets deltas by context', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      const nameDeltas = await storage.getDeltasByContext('user1', 'name');
      expect(nameDeltas).toHaveLength(1);
      expect(nameDeltas[0].id).toBe('delta1');
      
      const ageDeltas = await storage.getDeltasByContext('user1', 'age');
      expect(ageDeltas).toHaveLength(1);
      expect(ageDeltas[0].id).toBe('delta2');
      
      const nonExistentDeltas = await storage.getDeltasByContext('user1', 'email');
      expect(nonExistentDeltas).toHaveLength(0);
    });

    it('queries deltas with complex criteria', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      // Query by creator
      const aliceDeltas = await storage.queryDeltas({ creator: 'alice' });
      expect(aliceDeltas).toHaveLength(2);
      
      // Query by host
      const host1Deltas = await storage.queryDeltas({ host: 'host1' });
      expect(host1Deltas).toHaveLength(2);
      
      // Query by entity
      const user1Deltas = await storage.queryDeltas({ targetEntities: ['user1'] });
      expect(user1Deltas).toHaveLength(2);
      
      // Query by context
      const nameDeltas = await storage.queryDeltas({ contexts: ['name'] });
      expect(nameDeltas).toHaveLength(2);
      
      // Combined query
      const aliceUser1Deltas = await storage.queryDeltas({ 
        creator: 'alice', 
        targetEntities: ['user1'] 
      });
      expect(aliceUser1Deltas).toHaveLength(1);
      expect(aliceUser1Deltas[0].id).toBe('delta1');
    });

    it('applies pagination to queries', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      // Test limit
      const limitedDeltas = await storage.queryDeltas({ limit: 2 });
      expect(limitedDeltas).toHaveLength(2);
      
      // Test offset
      const offsetDeltas = await storage.queryDeltas({ offset: 1 });
      expect(offsetDeltas).toHaveLength(2);
      
      // Test limit + offset
      const pagedDeltas = await storage.queryDeltas({ offset: 1, limit: 1 });
      expect(pagedDeltas).toHaveLength(1);
    });

    it('counts deltas', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      const totalCount = await storage.countDeltas({});
      expect(totalCount).toBe(3);
      
      const aliceCount = await storage.countDeltas({ creator: 'alice' });
      expect(aliceCount).toBe(2);
      
      const user1Count = await storage.countDeltas({ targetEntities: ['user1'] });
      expect(user1Count).toBe(2);
    });

    it('provides storage statistics', async () => {
      const storage = getStorage();
      
      for (const delta of testDeltas) {
        await storage.storeDelta(delta);
      }

      const stats = await storage.getStats();
      expect(stats.totalDeltas).toBe(3);
      expect(stats.totalEntities).toBe(2); // user1 and user2
      expect(stats.oldestDelta).toBeDefined();
      expect(stats.newestDelta).toBeDefined();
      expect(stats.oldestDelta! <= stats.newestDelta!).toBe(true);
    });
  }
});