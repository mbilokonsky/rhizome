import Debug from 'debug';
import { Level } from 'level';
import { Delta, DeltaID, DeltaFilter } from '../core/delta';
import { DomainEntityID } from '../core/types';
import { DeltaQueryStorage, DeltaQuery, StorageStats } from './interface';

const debug = Debug('rz:storage:leveldb');

/**
 * LevelDB-based delta storage implementation
 * Provides persistent storage with efficient lookups
 */
export class LevelDBDeltaStorage implements DeltaQueryStorage {
  private db: Level<string, string>;
  private readonly dbPath: string;

  constructor(dbPath: string = './data/deltas') {
    this.dbPath = dbPath;
    this.db = new Level<string, string>(dbPath);
    debug(`Initialized LevelDB storage at ${dbPath}`);
  }

  async open(): Promise<void> {
    if (!this.db.status.includes('open')) {
      await this.db.open();
    }
  }

  private async ensureOpen(): Promise<void> {
    if (this.db.status !== 'open') {
      await this.db.open();
    }
  }

  async storeDelta(delta: Delta): Promise<void> {
    await this.ensureOpen();
    debug(`Storing delta ${delta.id} to LevelDB`);
    
    const batch = this.db.batch();

    // Store the main delta record
    batch.put(`delta:${delta.id}`, JSON.stringify(delta));

    // Create index entries for efficient lookups
    
    // Index by creation time for temporal queries
    batch.put(`time:${delta.timeCreated.toString().padStart(16, '0')}:${delta.id}`, delta.id);
    
    // Index by creator
    batch.put(`creator:${delta.creator}:${delta.id}`, delta.id);
    
    // Index by host
    batch.put(`host:${delta.host}:${delta.id}`, delta.id);

    // Index by entity and context for efficient entity queries
    for (const pointer of delta.pointers) {
      if (typeof pointer.target === 'string' && pointer.targetContext) {
        const entityId = pointer.target;
        const context = pointer.targetContext;
        
        // Entity index: entity:entityId:deltaId -> deltaId
        batch.put(`entity:${entityId}:${delta.id}`, delta.id);
        
        // Context index: context:entityId:context:deltaId -> deltaId
        batch.put(`context:${entityId}:${context}:${delta.id}`, delta.id);
      }
    }

    await batch.write();
  }

  async getDelta(id: DeltaID): Promise<Delta | null> {
    await this.ensureOpen();
    try {
      const deltaJson = await this.db.get(`delta:${id}`);
      
      // Handle case where LevelDB returns string "undefined" for missing keys
      if (deltaJson === 'undefined' || deltaJson === undefined) {
        return null;
      }
      
      return JSON.parse(deltaJson);
    } catch (error) {
      if ((error as { code?: string }).code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  async getAllDeltas(filter?: DeltaFilter): Promise<Delta[]> {
    await this.ensureOpen();
    const deltas: Delta[] = [];
    
    // Iterate through all delta records
    for await (const [_key, value] of this.db.iterator({ 
      gte: 'delta:', 
      lt: 'delta:\xFF' 
    })) {
      try {
        const delta = JSON.parse(value);
        
        // Apply filter if provided
        if (!filter || filter(delta)) {
          deltas.push(delta);
        }
      } catch (error) {
        debug(`Error parsing delta from key ${_key}:`, error);
      }
    }

    return deltas;
  }

  async getDeltasForEntity(entityId: DomainEntityID): Promise<Delta[]> {
    await this.ensureOpen();
    const deltaIds: string[] = [];
    
    // Use entity index to find all deltas for this entity
    for await (const [_key, deltaId] of this.db.iterator({
      gte: `entity:${entityId}:`,
      lt: `entity:${entityId}:\xFF`
    })) {
      deltaIds.push(deltaId);
    }

    // Fetch the actual deltas
    const deltas: Delta[] = [];
    for (const deltaId of deltaIds) {
      const delta = await this.getDelta(deltaId);
      if (delta) {
        deltas.push(delta);
      }
    }

    return deltas;
  }

  async getDeltasByContext(entityId: DomainEntityID, context: string): Promise<Delta[]> {
    await this.ensureOpen();
    const deltaIds: string[] = [];
    
    // Use context index to find deltas for this specific entity+context
    for await (const [_key, deltaId] of this.db.iterator({
      gte: `context:${entityId}:${context}:`,
      lt: `context:${entityId}:${context}:\xFF`
    })) {
      deltaIds.push(deltaId);
    }

    // Fetch the actual deltas
    const deltas: Delta[] = [];
    for (const deltaId of deltaIds) {
      const delta = await this.getDelta(deltaId);
      if (delta) {
        deltas.push(delta);
      }
    }

    return deltas;
  }

  async queryDeltas(query: DeltaQuery): Promise<Delta[]> {
    await this.ensureOpen();
    let candidateDeltaIds: Set<string> | null = null;

    // Use indexes to narrow down candidates efficiently
    
    if (query.creator) {
      const creatorDeltaIds = new Set<string>();
      for await (const [_key, deltaId] of this.db.iterator({
        gte: `creator:${query.creator}:`,
        lt: `creator:${query.creator}:\xFF`
      })) {
        creatorDeltaIds.add(deltaId);
      }
      candidateDeltaIds = this.intersectSets(candidateDeltaIds, creatorDeltaIds);
    }

    if (query.host) {
      const hostDeltaIds = new Set<string>();
      for await (const [_key, deltaId] of this.db.iterator({
        gte: `host:${query.host}:`,
        lt: `host:${query.host}:\xFF`
      })) {
        hostDeltaIds.add(deltaId);
      }
      candidateDeltaIds = this.intersectSets(candidateDeltaIds, hostDeltaIds);
    }

    if (query.targetEntities && query.targetEntities.length > 0) {
      const entityDeltaIds = new Set<string>();
      for (const entityId of query.targetEntities) {
        for await (const [_key, deltaId] of this.db.iterator({
          gte: `entity:${entityId}:`,
          lt: `entity:${entityId}:\xFF`
        })) {
          entityDeltaIds.add(deltaId);
        }
      }
      candidateDeltaIds = this.intersectSets(candidateDeltaIds, entityDeltaIds);
    }

    // If no index queries were used, scan all deltas
    if (candidateDeltaIds === null) {
      candidateDeltaIds = new Set<string>();
      for await (const [key, _value] of this.db.iterator({
        gte: 'delta:',
        lt: 'delta:\xFF'
      })) {
        const deltaId = key.substring(6); // Remove 'delta:' prefix
        candidateDeltaIds.add(deltaId);
      }
    }

    // Fetch and filter the candidate deltas
    const results: Delta[] = [];
    for (const deltaId of candidateDeltaIds) {
      const delta = await this.getDelta(deltaId);
      if (!delta) continue;

      // Apply additional filters that couldn't be done via indexes
      if (query.timeCreatedAfter && delta.timeCreated < query.timeCreatedAfter) continue;
      if (query.timeCreatedBefore && delta.timeCreated > query.timeCreatedBefore) continue;
      
      if (query.contexts && query.contexts.length > 0) {
        const hasMatchingContext = delta.pointers.some(p => 
          p.targetContext && query.contexts!.includes(p.targetContext)
        );
        if (!hasMatchingContext) continue;
      }

      results.push(delta);
    }

    // Sort by creation time
    results.sort((a, b) => a.timeCreated - b.timeCreated);

    // Apply pagination
    let finalResults = results;
    if (query.offset) {
      finalResults = finalResults.slice(query.offset);
    }
    if (query.limit) {
      finalResults = finalResults.slice(0, query.limit);
    }

    return finalResults;
  }

  async countDeltas(query: DeltaQuery): Promise<number> {
    // For count queries, we can be more efficient by not fetching full delta objects
    const results = await this.queryDeltas({ ...query, limit: undefined, offset: undefined });
    return results.length;
  }

  async getStats(): Promise<StorageStats> {
    await this.ensureOpen();
    let totalDeltas = 0;
    const entities = new Set<DomainEntityID>();
    let oldestDelta: number | undefined;
    let newestDelta: number | undefined;

    // Count deltas and track entities
    for await (const [_key, value] of this.db.iterator({
      gte: 'delta:',
      lt: 'delta:\xFF'
    })) {
      totalDeltas++;
      
      try {
        const delta: Delta = JSON.parse(value);
        
        // Track entities
        for (const pointer of delta.pointers) {
          if (typeof pointer.target === 'string' && pointer.targetContext) {
            entities.add(pointer.target);
          }
        }

        // Track time range
        if (!oldestDelta || delta.timeCreated < oldestDelta) {
          oldestDelta = delta.timeCreated;
        }
        if (!newestDelta || delta.timeCreated > newestDelta) {
          newestDelta = delta.timeCreated;
        }
      } catch (error) {
        debug(`Error parsing delta for stats from key ${_key}:`, error);
      }
    }

    return {
      totalDeltas,
      totalEntities: entities.size,
      oldestDelta,
      newestDelta
      // Note: LevelDB doesn't easily expose storage size, would need filesystem queries
    };
  }

  async close(): Promise<void> {
    debug('Closing LevelDB storage');
    await this.db.close();
  }

  // Utility method for set intersection
  private intersectSets(setA: Set<string> | null, setB: Set<string>): Set<string> {
    if (setA === null) return setB;
    
    const result = new Set<string>();
    for (const item of setA) {
      if (setB.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  // LevelDB-specific methods
  async clearAll(): Promise<void> {
    await this.ensureOpen();
    debug('Clearing all data from LevelDB');
    await this.db.clear();
  }

  async compact(): Promise<void> {
    await this.ensureOpen();
    debug('Compacting LevelDB');
    // LevelDB compaction happens automatically, but we can trigger it
    // by iterating through all keys (this is a simple approach)
    for await (const [_key] of this.db.iterator()) {
      // Just iterating triggers compaction
    }
  }
}