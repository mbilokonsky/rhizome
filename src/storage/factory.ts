import Debug from 'debug';
import { DeltaStorage, DeltaQueryStorage, StorageConfig } from './interface';
import { MemoryDeltaStorage } from './memory';
import { LevelDBDeltaStorage } from './leveldb';

const debug = Debug('rz:storage:factory');

/**
 * Factory for creating delta storage instances based on configuration
 */
export class StorageFactory {
  /**
   * Create a storage instance based on configuration
   */
  static create(config: StorageConfig): DeltaQueryStorage {
    switch (config.type) {
      case 'memory':
        return new MemoryDeltaStorage();
        
      case 'leveldb': {
        const dbPath = config.path || './data/deltas';
        return new LevelDBDeltaStorage(dbPath);
      }
        
      case 'sqlite':
        // TODO: Implement SQLite storage
        throw new Error('SQLite storage not yet implemented');
        
      case 'postgres':
        // TODO: Implement PostgreSQL storage
        throw new Error('PostgreSQL storage not yet implemented');
        
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }

  /**
   * Create a memory storage instance (convenience method)
   */
  static createMemory(): DeltaQueryStorage {
    return new MemoryDeltaStorage();
  }

  /**
   * Create a LevelDB storage instance (convenience method)
   */
  static createLevelDB(path: string = './data/deltas'): DeltaQueryStorage {
    return new LevelDBDeltaStorage(path);
  }

  /**
   * Migrate data from one storage backend to another
   */
  static async migrate(
    source: DeltaStorage, 
    target: DeltaStorage,
    options: { batchSize?: number } = {}
  ): Promise<void> {
    const batchSize = options.batchSize || 1000;
    
    debug('Starting storage migration...');
    
    const allDeltas = await source.getAllDeltas();
    debug(`Found %d deltas to migrate`, allDeltas.length);
    
    // Migrate in batches to avoid memory issues
    for (let i = 0; i < allDeltas.length; i += batchSize) {
      const batch = allDeltas.slice(i, i + batchSize);
      
      for (const delta of batch) {
        await target.storeDelta(delta);
      }
      
      debug('Migrated %d / %d deltas', Math.min(i + batchSize, allDeltas.length), allDeltas.length);
    }
    
    debug('Migration completed successfully');
    
    // Verify migration
    const sourceStats = await source.getStats();
    const targetStats = await target.getStats();
    
    if (sourceStats.totalDeltas !== targetStats.totalDeltas) {
      const errorMsg = `Migration verification failed: source has ${sourceStats.totalDeltas} deltas, target has ${targetStats.totalDeltas}`;
      debug(errorMsg);
      throw new Error(errorMsg);
    }
    
    debug('Migration verified: %d deltas migrated successfully', targetStats.totalDeltas);
  }
}