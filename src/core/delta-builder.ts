import { DeltaV1, DeltaV2 } from './delta';
import { randomUUID } from 'crypto';
import { PropertyTypes } from './types';
import { PointersV2 } from './delta';

/**
 * A fluent builder for creating Delta objects with proper validation and type safety.
 * Supports both V1 and V2 delta formats.
 */
export class DeltaBuilder {
  private id: string;
  private timeCreated?: number;
  private host: string;
  private creator: string;
  private pointers: PointersV2 = {};

  /**
   * Create a new DeltaBuilder instance
   * @param creator - The ID of the entity creating this delta
   * @param host - The host where this delta is being created
   */
  constructor(creator: string, host: string) {
    this.id = randomUUID();
    this.creator = creator;
    this.host = host;
  }

  /**
   * Set a custom ID for the delta
   */
  withId(id: string): this {
    this.id = id;
    return this;
  }

  /**
   * Set a custom creation timestamp
   */
  withTimestamp(timestamp: number): this {
    this.timeCreated = timestamp;
    return this;
  }

  /**
   * Set the transaction ID for this delta
   */
  inTransaction(transactionId: string): this {
    this.addPointer('_transaction', transactionId, 'deltas');
    return this;
  }
  
  /**
   * Declare a transaction with a size
   * @param transactionId The ID of the transaction
   * @param size The size of the transaction
   * @returns 
   */
  declareTransaction(transactionId: string, size: number): this {
    this.setProperty(transactionId, 'size', size, '_transaction');
    return this;
  }

  /**
   * Mark this delta as a negation of another delta
   */
  negate(deltaId: string): this {
    this.addPointer('_negates', deltaId, 'negated_by');
    return this;
  }

  /**
   * Add a pointer to the delta
   * @param localContext The local context for the pointer
   * @param target The target value (string, number, boolean, or null)
   * @param targetContext Optional target context for the pointer
   */
  addPointer(localContext: string, target: string | number | boolean | null, targetContext?: string): this {
    const pointerTarget =  (targetContext && typeof target === 'string') 
      ? { [target]: targetContext } : target;
    if (this.pointers[localContext] && 
      JSON.stringify(this.pointers[localContext]) !== JSON.stringify(pointerTarget)
    ) {
      throw new Error(`Pointer for ${localContext} already exists with different value`);
    }
    this.pointers[localContext] = pointerTarget;
    return this;
  }

  /**
   * Set a property on an entity
   * ! Note that the way we are doing this is awkward/problematic for deltas that set multiple properties.
   * ! entityLabel and property each need to be unique within a given delta
   */
  setProperty(entityId: string, property: string, value: string | number | boolean | null, entityLabel = "entity"): this {
    this.addPointer(entityLabel, entityId, property)
    this.addPointer(property, value);
    return this;
  }

  /**
   * Create a relationship between two entities
   * @param sourceId The ID of the source entity
   * @param targetId The ID of the target entity
   * @param relationship The type of relationship
   * @param properties Optional properties for the relationship
   */
  relate(sourceId: string, targetId: string, relationship: string, properties?: Record<string, PropertyTypes>): this {
    const relId = randomUUID();
    this.setProperty(relId, 'source', sourceId, '_rel_source');
    this.setProperty(relId, 'target', targetId, '_rel_target');
    this.setProperty(relId, 'type', relationship, '_rel_type');
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        this.setProperty(relId, key, value, `_rel_${key}`);
      }
    }
    
    return this;
  }

  /**
   * Build and return a DeltaV2 instance
   */
  buildV2(): DeltaV2 {
    // For V2, we'll store transaction and negation info in the pointers object
    const pointers = { ...this.pointers };
    
    // Create the delta with all pointers
    return new DeltaV2({
      id: this.id,
      host: this.host,
      creator: this.creator,
      timeCreated: this.timeCreated,
      pointers
    });
  }

  /**
   * Build and return a DeltaV1 instance
   */
  buildV1(): DeltaV1 {
    return this.buildV2().toV1();
  }

  /**
   * Default to V1 for now
   */
  build(): DeltaV1 {
    return this.buildV1();
  }
}

/**
 * Create a new DeltaBuilder instance (convenience function)
 */
export function createDelta(creator: string, host: string): DeltaBuilder {
  return new DeltaBuilder(creator, host);
}
