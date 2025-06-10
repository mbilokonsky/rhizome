import Debug from 'debug';
import { Delta, DeltaID, DeltaFilter } from '../core/delta';
import { DomainEntityID } from '../core/types';
import { DeltaStorage, DeltaQueryStorage, DeltaQuery, StorageStats } from './interface';

const debug = Debug('rz:storage:memory');

/**
 * In-memory delta storage implementation
 * Fast but non-persistent, suitable for development and testing
 */
export class MemoryDeltaStorage implements DeltaQueryStorage {
  private deltas = new Map<DeltaID, Delta>();
  private entityIndex = new Map<DomainEntityID, Set<DeltaID>>();
  private contextIndex = new Map<string, Set<DeltaID>>(); // entityId:context -> deltaIds

  async storeDelta(delta: Delta): Promise<void> {
    debug(`Storing delta ${delta.id}`);
    
    // Store the delta
    this.deltas.set(delta.id, delta);

    // Update entity index
    for (const pointer of delta.pointers) {
      if (typeof pointer.target === 'string' && pointer.targetContext) {
        const entityId = pointer.target;
        
        // Add to entity index
        if (!this.entityIndex.has(entityId)) {
          this.entityIndex.set(entityId, new Set());
        }
        this.entityIndex.get(entityId)!.add(delta.id);

        // Add to context index
        const contextKey = `${entityId}:${pointer.targetContext}`;
        if (!this.contextIndex.has(contextKey)) {
          this.contextIndex.set(contextKey, new Set());
        }
        this.contextIndex.get(contextKey)!.add(delta.id);
      }
    }
  }

  async getDelta(id: DeltaID): Promise<Delta | null> {
    return this.deltas.get(id) || null;
  }

  async getAllDeltas(filter?: DeltaFilter): Promise<Delta[]> {
    let results = Array.from(this.deltas.values());
    
    if (filter) {
      results = results.filter(filter);
    }
    
    return results;
  }

  async getDeltasForEntity(entityId: DomainEntityID): Promise<Delta[]> {
    const deltaIds = this.entityIndex.get(entityId);
    if (!deltaIds) return [];

    const results: Delta[] = [];
    for (const deltaId of deltaIds) {
      const delta = this.deltas.get(deltaId);
      if (delta) {
        results.push(delta);
      }
    }
    
    return results;
  }

  async getDeltasByContext(entityId: DomainEntityID, context: string): Promise<Delta[]> {
    const contextKey = `${entityId}:${context}`;
    const deltaIds = this.contextIndex.get(contextKey);
    if (!deltaIds) return [];

    const results: Delta[] = [];
    for (const deltaId of deltaIds) {
      const delta = this.deltas.get(deltaId);
      if (delta) {
        results.push(delta);
      }
    }
    
    return results;
  }

  async queryDeltas(query: DeltaQuery): Promise<Delta[]> {
    let results = Array.from(this.deltas.values());

    // Apply filters
    if (query.creator) {
      results = results.filter(d => d.creator === query.creator);
    }
    
    if (query.host) {
      results = results.filter(d => d.host === query.host);
    }
    
    if (query.timeCreatedAfter) {
      results = results.filter(d => d.timeCreated >= query.timeCreatedAfter!);
    }
    
    if (query.timeCreatedBefore) {
      results = results.filter(d => d.timeCreated <= query.timeCreatedBefore!);
    }

    if (query.targetEntities && query.targetEntities.length > 0) {
      const targetSet = new Set(query.targetEntities);
      results = results.filter(d => 
        d.pointers.some(p => typeof p.target === 'string' && targetSet.has(p.target))
      );
    }

    if (query.contexts && query.contexts.length > 0) {
      const contextSet = new Set(query.contexts);
      results = results.filter(d =>
        d.pointers.some(p => p.targetContext && contextSet.has(p.targetContext))
      );
    }

    // Sort by creation time
    results.sort((a, b) => a.timeCreated - b.timeCreated);

    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async countDeltas(query: DeltaQuery): Promise<number> {
    const results = await this.queryDeltas({ ...query, limit: undefined, offset: undefined });
    return results.length;
  }

  async getStats(): Promise<StorageStats> {
    const deltas = Array.from(this.deltas.values());
    const entities = new Set<DomainEntityID>();
    
    let oldestDelta: number | undefined;
    let newestDelta: number | undefined;

    for (const delta of deltas) {
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
    }

    return {
      totalDeltas: this.deltas.size,
      totalEntities: entities.size,
      oldestDelta,
      newestDelta
    };
  }

  async close(): Promise<void> {
    debug('Closing memory storage');
    this.deltas.clear();
    this.entityIndex.clear();
    this.contextIndex.clear();
  }

  // Memory-specific methods for inspection
  getInternalState() {
    return {
      deltasCount: this.deltas.size,
      entitiesCount: this.entityIndex.size,
      contextsCount: this.contextIndex.size
    };
  }
}