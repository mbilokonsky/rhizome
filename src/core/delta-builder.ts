import { DeltaV1, DeltaV2 } from './delta';
import { randomUUID } from 'crypto';
import Debug from 'debug';
const debug = Debug('rz:delta-builder');

/**
 * A fluent builder for creating Delta objects with proper validation and type safety.
 * Supports both V1 and V2 delta formats.
 */
export class DeltaBuilder {
  private id: string;
  private timeCreated?: number;
  private host: string;
  private creator: string;
  private pointers: Record<string, any> = {};
  private transactionId?: string;
  private isNegation: boolean = false;
  private negatedDeltaId?: string;

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
    this.transactionId = transactionId;
    return this;
  }
  
  /**
   * Declare a transaction with a size
   * @param transactionId The ID of the transaction
   * @param size The size of the transaction
   * @returns 
   */
  declareTransaction(transactionId: string, size: number): this {
    this.addPointer('_transaction', transactionId, 'size');
    this.addPointer('size', size)
    return this;
  }

  /**
   * Mark this delta as a negation of another delta
   */
  negate(deltaId: string): this {
    this.isNegation = true;
    this.negatedDeltaId = deltaId;
    return this;
  }

  /**
   * Add a pointer to the delta
   */
  addPointer(localContext: string, target: string | number | boolean, targetContext?: string): this {
    if (targetContext && typeof target === 'string') {
      this.pointers[localContext] = { [target]: targetContext };
    } else {
      this.pointers[localContext] = target;
    }
    return this;
  }

  /**
   * Set a property on an entity
   */
  setProperty(entityId: string, property: string, value: string | number | boolean, entityLabel = "entity"): this {
    this.addPointer(entityLabel, entityId, property)
    this.addPointer(property, value);
    return this;
  }

  /**
   * Create a relationship between two entities
   */
  relate(sourceId: string, relationship: string, targetId: string): this {
    this.pointers[relationship] = { [targetId]: relationship };
    this.pointers.source = { [sourceId]: relationship };
    return this;
  }

  /**
   * Build and return a DeltaV2 instance
   */
  buildV2(): DeltaV2 {
    // For V2, we'll store transaction and negation info in the pointers object
    const pointers = { ...this.pointers };
    
    if (this.transactionId) {
      pointers['_transaction'] = { [this.transactionId]: 'deltas' };
    }

    if (this.isNegation && this.negatedDeltaId) {
      pointers['_negation'] = this.negatedDeltaId;
    }

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
