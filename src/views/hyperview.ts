// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import Debug from 'debug';
import EventEmitter from 'events';
import {Delta, DeltaFilter, DeltaID, DeltaNetworkImageV1, DeltaV2} from '../core/delta';
import {RhizomeNode} from '../node';
import {Transactions} from '../features/transactions';
import {DomainEntityID, PropertyID, PropertyTypes, TransactionID, ViewMany} from "../core/types";
import {Negation} from '../features/negation';
import {NegationHelper} from '../features/negation';
const debug = Debug('rz:hyperview');

export type CollapsedPointer = {[key: PropertyID]: PropertyTypes};

export type CollapsedDelta = Omit<DeltaNetworkImageV1, 'pointers'> & {
  pointers: CollapsedPointer[];
};

// Extract a particular value from a delta's pointers
export function valueFromDelta(
  key: string,
  delta: Delta | CollapsedDelta
): PropertyTypes | undefined {
  let result: PropertyTypes | undefined;
  for (const pointer of delta.pointers) {
    // Should be equivalent to delta instanceof Delta
    if (['localContext', 'target'].every(k => k in pointer)) {
      if (pointer.localContext === key) {
        if (result) {
          debug(`multiple values for key ${key} in delta ${delta.id}`);
          throw new Error(`Multiple values for key ${key} in delta ${delta.id}`);
        }
        result = pointer.target;
      }
    } else {
      for (const [k, value] of Object.entries(pointer)) {
        if (k === key) {
          if (result) {
            debug(`multiple values for key ${key} in delta ${delta.id}`);
            throw new Error(`Multiple values for key ${key} in delta ${delta.id}`);
          }
          result = value;
        }
      }
    }
  }
  return result;
}

// TODO: Store property deltas as references to reduce memory footprint
export type HyperviewViewOne = {
  id: DomainEntityID,
  referencedAs?: string[];
  propertyDeltas: {
    [key: PropertyID]: Delta[]
  }
}

export type CollapsedViewOne = Omit<HyperviewViewOne, 'propertyDeltas'> & {
  propertyCollapsedDeltas: {
    [key: PropertyID]: CollapsedDelta[]
  }
};

export type HyperviewViewMany = ViewMany<HyperviewViewOne>;
export type CollapsedViewMany = ViewMany<CollapsedViewOne>;

class HyperviewEntityMap extends Map<DomainEntityID, HyperviewEntity> {};

class HyperviewEntity {
  properties = new Map<PropertyID, Set<Delta>>();

  constructor(readonly hyperview: Hyperview, readonly id: DomainEntityID) {}

  addDelta(delta: Delta | DeltaV2) {
    // Convert DeltaV2 to DeltaV1 if needed
    if (delta instanceof DeltaV2) {
      delta = delta.toV1();
    }
    const targetContexts = delta.pointers
      .filter(({target}) => target === this.id)
      .map(({targetContext}) => targetContext)
      .filter((targetContext) => typeof targetContext === 'string');

    for (const targetContext of targetContexts) {
      let propertyDeltas = this.properties.get(targetContext);
      if (!propertyDeltas) {
        propertyDeltas = new Set<Delta>();
        this.properties.set(targetContext, propertyDeltas);
      }

      propertyDeltas.add(delta);
    }

    debug(`[${this.hyperview.rhizomeNode.config.peerId}]`, `entity ${this.id} added delta:`, JSON.stringify(delta));
  }

  toJSON() {
    const properties: {[key: PropertyID]: number} = {};
    for (const [key, deltas] of this.properties.entries()) {
      properties[key] = deltas.size;
    }
    return {
      id: this.id,
      referencedAs: Array.from(this.hyperview.referencedAs.get(this.id) ?? []),
      properties
    };
  }
}

export class Hyperview {
  domainEntities = new HyperviewEntityMap();
  transactions: Transactions;
  eventStream = new EventEmitter();

  // TODO: This referencedAs map doesn't really belong at this layer of abstraction
  referencedAs = new Map<string, Set<string>>();
  
  // Track all deltas by ID for negation processing
  private allDeltas = new Map<DeltaID, Delta>();
  // Track which entities are affected by each delta
  private deltaToEntities = new Map<DeltaID, Set<DomainEntityID>>();

  constructor(readonly rhizomeNode: RhizomeNode) {
    this.transactions = new Transactions(this);
    this.transactions.eventStream.on("completed", (transactionId, deltaIds) => {
      debug(`[${this.rhizomeNode.config.peerId}]`, `Completed transaction ${transactionId}`);
      const transaction = this.transactions.get(transactionId);
      if (!transaction) return;
      for (const id of transaction.entityIds) {
        this.eventStream.emit("updated", id, deltaIds);
      }
    });
  }

  ingestDelta(delta: Delta | DeltaV2): TransactionID | undefined {
    // Convert DeltaV2 to DeltaV1 if needed
    if (delta instanceof DeltaV2) {
      delta = delta.toV1();
    }
    
    // Store delta for negation processing
    this.allDeltas.set(delta.id, delta);

    let targets: string[] = [];

    // Handle negation deltas specially
    if (NegationHelper.isNegationDelta(delta)) {
      const negatedDeltaId = NegationHelper.getNegatedDeltaId(delta);
      if (negatedDeltaId) {
        // Find which entities were affected by the negated delta
        const affectedEntities = this.deltaToEntities.get(negatedDeltaId);
        if (affectedEntities) {
          targets = Array.from(affectedEntities);
          // Track which entities this negation delta affects
          this.deltaToEntities.set(delta.id, affectedEntities);
          
          // Add the negation delta to all affected entities
          for (const entityId of affectedEntities) {
            let ent = this.domainEntities.get(entityId);
            if (!ent) {
              ent = new HyperviewEntity(this, entityId);
              this.domainEntities.set(entityId, ent);
            }
            // Add negation delta to the entity
            // For negation deltas, we need to add them to a special property
            // since they don't directly target the entity
            let negationDeltas = ent.properties.get('_negates');
            if (!negationDeltas) {
              negationDeltas = new Set<Delta>();
              ent.properties.set('_negates', negationDeltas);
            }
            negationDeltas.add(delta);
          }
        }
      }
    } else {
      // Regular delta processing
      targets = delta.pointers
        .filter(({targetContext}) => !!targetContext)
        .map(({target}) => target)
        .filter((target) => typeof target === 'string');

      // Track which entities this delta affects
      this.deltaToEntities.set(delta.id, new Set(targets));

      for (const target of targets) {
        let ent = this.domainEntities.get(target);

        if (!ent) {
          ent = new HyperviewEntity(this, target);
          this.domainEntities.set(target, ent);
        }

        ent.addDelta(delta);
      }
    }

    const transactionId = this.transactions.ingestDelta(delta, targets);

    if (!transactionId) {
      // No transaction -- we can issue an update event immediately
      for (const id of targets) {
        this.eventStream.emit("updated", id, [delta.id]);
      }
    }
    return transactionId;
  }

  decompose(view: HyperviewViewOne): Delta[] {
    const allDeltas: Delta[] = [];
    const seenDeltaIds = new Set<DeltaID>();
    
    // Collect all deltas from all properties
    for (const [_propertyId, deltas] of Object.entries(view.propertyDeltas)) {
      for (const delta of deltas) {
        if (!seenDeltaIds.has(delta.id)) {
          seenDeltaIds.add(delta.id);
          allDeltas.push(delta);
        }
      }
    }
    
    return allDeltas;
  }

  compose(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): HyperviewViewMany {
    const view: HyperviewViewMany = {};
    entityIds = entityIds ?? Array.from(this.domainEntities.keys());

    for (const entityId of entityIds) {
      const ent = this.domainEntities.get(entityId);
      if (!ent) continue;

      const referencedAs = new Set<string>();

      const propertyDeltas: {
        [key: PropertyID]: Delta[]
      } = {};

      let hasVisibleDeltas = false;

      // First, collect all deltas for this entity to properly apply negations
      // TODO: This is very inefficient. We need a better algorithm for applying negations.
      const allEntityDeltas: Delta[] = [];
      for (const deltas of ent.properties.values()) {
        allEntityDeltas.push(...Array.from(deltas));
      }
      
      // Apply negation filtering to all deltas for this entity
      const nonNegatedDeltas = Negation.filterNegatedDeltas(allEntityDeltas);
      const nonNegatedDeltaIds = new Set(nonNegatedDeltas.map(d => d.id));

      for (const [key, deltas] of ent.properties.entries()) {
        // Filter deltas for this property based on negation status
        const filteredDeltas = Array.from(deltas).filter(delta => nonNegatedDeltaIds.has(delta.id));
        const visibleDeltas: Delta[] = [];

        for (const delta of filteredDeltas) {
          if (deltaFilter && !deltaFilter(delta)) {
            continue;
          }

          // If this delta is part of a transaction,
          // we need to be able to wait for the whole transaction.
          if (delta.transactionId) {
            if (!this.transactions.isComplete(delta.transactionId)) {
              debug(`[${this.rhizomeNode.config.peerId}]`, `Excluding delta ${delta.id} because transaction ${delta.transactionId} is not completed`);
              continue;
            }
          }

          const ref = delta.pointers.find(p => p.target === entityId)
          if (ref) {
            referencedAs.add(ref.localContext);
          }

          visibleDeltas.push(delta);
          hasVisibleDeltas = true;
        }

        if (visibleDeltas.length > 0) {
          propertyDeltas[key] = visibleDeltas;
        }
      }

      if (this.referencedAs.has(ent.id)) {
        for (const ref of referencedAs) {
          this.referencedAs.get(ent.id)!.add(ref);
        }
      } else { 
        this.referencedAs.set(ent.id, referencedAs);
      }

      // Only include entity in view if it has visible deltas
      if (hasVisibleDeltas) {
        view[entityId] = {
          id: entityId,
          referencedAs: Array.from(referencedAs.values()),
          propertyDeltas,
        };
      }
    }

    return view;
  }

  // Get negation statistics for an entity
  getNegationStats(entityId: DomainEntityID): {
    totalDeltas: number;
    negationDeltas: number;
    negatedDeltas: number;
    effectiveDeltas: number;
    negationsByProperty: { [key: PropertyID]: { negated: number; total: number } };
  } {
    const ent = this.domainEntities.get(entityId);
    if (!ent) {
      return {
        totalDeltas: 0,
        negationDeltas: 0,
        negatedDeltas: 0,
        effectiveDeltas: 0,
        negationsByProperty: {}
      };
    }

    // Get all deltas for this entity, including negation deltas
    const allEntityDeltas: Delta[] = [];
    for (const deltas of ent.properties.values()) {
      allEntityDeltas.push(...Array.from(deltas));
    }

    let totalDeltas = 0;
    let totalNegationDeltas = 0;
    let totalNegatedDeltas = 0;
    let totalEffectiveDeltas = 0;
    const negationsByProperty: { [key: PropertyID]: { negated: number; total: number } } = {};

    // Get all negation deltas for this entity
    const negationDeltas = this.getNegationDeltas(entityId);
    const negatedDeltaIds = new Set<DeltaID>();
    
    for (const negDelta of negationDeltas) {
      const negatedId = NegationHelper.getNegatedDeltaId(negDelta);
      if (negatedId) {
        negatedDeltaIds.add(negatedId);
      }
    }

    for (const [property, deltas] of ent.properties.entries()) {
      // Skip the special _negates property in the per-property stats
      if (property === '_negates') {
        totalDeltas += deltas.size;
        totalNegationDeltas += deltas.size;
        continue;
      }

      const deltaArray = Array.from(deltas);
      const propertyNegatedCount = deltaArray.filter(d => negatedDeltaIds.has(d.id)).length;
      const propertyTotal = deltaArray.length;
      
      totalDeltas += propertyTotal;
      totalNegatedDeltas += propertyNegatedCount;
      totalEffectiveDeltas += (propertyTotal - propertyNegatedCount);

      negationsByProperty[property] = {
        negated: propertyNegatedCount,
        total: propertyTotal
      };
    }

    return {
      totalDeltas,
      negationDeltas: totalNegationDeltas,
      negatedDeltas: totalNegatedDeltas,
      effectiveDeltas: totalEffectiveDeltas,
      negationsByProperty
    };
  }

  // Get all negation deltas for an entity
  getNegationDeltas(entityId: DomainEntityID): Delta[] {
    const ent = this.domainEntities.get(entityId);
    if (!ent) return [];

    const negationProperty = ent.properties.get('_negates');
    if (!negationProperty) return [];

    return Array.from(negationProperty);
  }

  // TODO: point-in-time queries
}