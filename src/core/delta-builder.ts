import { 
  DeltaID, 
  Delta, 
  DeltaV1, 
  DeltaV2, 
  DeltaNetworkImageV1, 
  DeltaNetworkImageV2, 
  PointerTarget,
  PointersV2
} from './delta';
import { randomUUID } from 'crypto';
import { microtime } from '../utils/time';

type DeltaVersion = 'v1' | 'v2';

// Local type for V1 pointers
interface PointerV1 {
  localContext: string;
  target: PointerTarget;
  targetContext?: string;
}

/**
 * A fluent builder for creating Delta objects with proper validation and type safety.
 * Supports both V1 and V2 delta formats.
 */
export class DeltaBuilder {
  private id: string;
  private timeCreated: number;
  private host: string;
  private creator: string;
  private version: DeltaVersion = 'v2'; // Default to V2
  private pointersV1: Array<{ localContext: string; target: PointerTarget; targetContext?: string }> = [];
  private pointersV2: Record<string, any> = {};
  private transactionId?: string;
  private isNegation: boolean = false;
  private negatedDeltaId?: string;

  /**
   * Create a new DeltaBuilder instance
   * @param creator - The ID of the entity creating this delta
   * @param host - The host where this delta is being created
   * @param version - The delta version to use ('v1' or 'v2')
   */
  constructor(creator: string, host: string, version: DeltaVersion = 'v2') {
    this.id = randomUUID();
    this.timeCreated = microtime.now();
    this.creator = creator;
    this.host = host;
    this.version = version;
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
   * Mark this delta as a negation of another delta
   */
  negate(deltaId: string): this {
    this.isNegation = true;
    this.negatedDeltaId = deltaId;
    return this;
  }

  /**
   * Add a pointer to the delta (V1 style)
   */
  addPointer(localContext: string, target: string | number | boolean, targetContext?: string): this {
    if (this.version === 'v1') {
      this.pointersV1.push({ localContext, target, targetContext });
    } else {
      // For V2, we need to handle the target context differently
      if (targetContext && typeof target === 'string') {
        this.pointersV2[localContext] = { [target]: targetContext };
      } else {
        this.pointersV2[localContext] = target;
      }
    }
    return this;
  }

  /**
   * Set a property on an entity (shorthand for addPointer with 'value' local context)
   */
  setProperty(entityId: string, property: string, value: string | number | boolean, targetContext?: string): this {
    if (this.version === 'v1') {
      // For V1, we need to ensure target is a valid type
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        this.pointersV1.push({ 
          localContext: property, 
          target: value, // We've checked it's a valid type
          targetContext: property
        });
        // Add a reference to the entity
        this.pointersV1.push({
          localContext: 'entity',
          target: entityId,
          targetContext: property
        });
      }
    } else {
      // V2 format
      if (targetContext) {
        this.pointersV2[property] = { [String(value)]: targetContext };
      } else {
        this.pointersV2[property] = value;
      }
      this.pointersV2.entity = { [entityId]: property };
    }
    return this;
  }

  /**
   * Create a relationship between two entities
   */
  relate(sourceId: string, relationship: string, targetId: string): this {
    if (this.version === 'v1') {
      this.pointersV1.push({
        localContext: relationship,
        target: targetId,
        targetContext: relationship
      });
      this.pointersV1.push({
        localContext: 'source',
        target: sourceId,
        targetContext: relationship
      });
    } else {
      this.pointersV2[relationship] = { [targetId]: relationship };
      this.pointersV2.source = { [sourceId]: relationship };
    }
    return this;
  }

  /**
   * Build and return a Delta instance
   */
  build(): Delta {
    if (this.version === 'v1') {
      return this.buildV1();
    } else {
      return this.buildV2().toV1();
    }
  }

  /**
   * Build and return a DeltaV2 instance
   */
  buildV2(): DeltaV2 {
    // For V2, we'll store transaction and negation info in the pointers object
    const pointers = { ...this.pointersV2 };
    
    if (this.transactionId) {
      pointers['_transaction'] = this.transactionId;
    }

    if (this.isNegation && this.negatedDeltaId) {
      pointers['_negation'] = this.negatedDeltaId;
    }

    // Create the delta with all pointers
    return new DeltaV2({
      id: this.id,
      timeCreated: this.timeCreated,
      host: this.host,
      creator: this.creator,
      pointers
    });
  }

  /**
   * Build and return a DeltaV1 instance
   */
  private buildV1(): DeltaV1 {
    // For V1, we'll store transaction and negation info in the pointers
    const pointers = [...this.pointersV1];
    
    if (this.transactionId) {
      pointers.push({
        localContext: '_transaction',
        target: this.transactionId
      });
    }

    if (this.isNegation && this.negatedDeltaId) {
      pointers.push({
        localContext: '_negation',
        target: this.negatedDeltaId
      });
    }

    // Create the delta with all pointers
    return new DeltaV1({
      id: this.id,
      timeCreated: this.timeCreated,
      host: this.host,
      creator: this.creator,
      pointers
    });
  }
}

/**
 * Create a new DeltaBuilder instance (convenience function)
 */
export function createDelta(creator: string, host: string, version: DeltaVersion = 'v2'): DeltaBuilder {
  return new DeltaBuilder(creator, host, version);
}
