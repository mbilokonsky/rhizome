import { Delta, DeltaID, DeltaFilter } from '../core/delta';
import { DomainEntityID } from '../core/types';

/**
 * Abstract interface for delta storage backends
 * Supports both in-memory and persistent storage implementations
 */
export interface DeltaStorage {
  /**
   * Store a delta
   */
  storeDelta(delta: Delta): Promise<void>;

  /**
   * Get a delta by ID
   */
  getDelta(id: DeltaID): Promise<Delta | null>;

  /**
   * Get all deltas (optionally filtered)
   */
  getAllDeltas(filter?: DeltaFilter): Promise<Delta[]>;

  /**
   * Get deltas that reference a specific entity
   */
  getDeltasForEntity(entityId: DomainEntityID): Promise<Delta[]>;

  /**
   * Get deltas by target context (property)
   */
  getDeltasByContext(entityId: DomainEntityID, context: string): Promise<Delta[]>;

  /**
   * Get statistics about stored deltas
   */
  getStats(): Promise<StorageStats>;

  /**
   * Clean up resources
   */
  close(): Promise<void>;
}

export interface StorageStats {
  totalDeltas: number;
  totalEntities: number;
  storageSize?: number; // bytes for persistent storage
  oldestDelta?: number; // timestamp
  newestDelta?: number; // timestamp
}

/**
 * Query interface for more advanced delta queries
 */
export interface DeltaQueryStorage extends DeltaStorage {
  /**
   * Query deltas with more complex criteria
   */
  queryDeltas(query: DeltaQuery): Promise<Delta[]>;

  /**
   * Count deltas matching criteria without fetching them
   */
  countDeltas(query: DeltaQuery): Promise<number>;

  /**
   * Create an index for faster queries (optional optimization)
   */
  createIndex?(fields: string[]): Promise<void>;
}

export interface DeltaQuery {
  creator?: string;
  host?: string;
  timeCreatedAfter?: number;
  timeCreatedBefore?: number;
  targetEntities?: DomainEntityID[];
  contexts?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Configuration for different storage backends
 */
export interface StorageConfig {
  type: 'memory' | 'leveldb' | 'sqlite' | 'postgres';
  path?: string; // for file-based storage
  options?: Record<string, any>;
}