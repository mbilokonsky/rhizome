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
const debug = Debug('rz:lossless');

export type CollapsedPointer = {[key: PropertyID]: PropertyTypes};

export type CollapsedDelta = Omit<DeltaNetworkImageV1, 'pointers'> & {
  pointers: CollapsedPointer[];
};

export type LosslessViewOne = {
  id: DomainEntityID,
  referencedAs: string[];
  propertyDeltas: {
    [key: PropertyID]: CollapsedDelta[]
  }
};

export type LosslessViewMany = ViewMany<LosslessViewOne>;

class LosslessEntityMap extends Map<DomainEntityID, LosslessEntity> {};

class LosslessEntity {
  properties = new Map<PropertyID, Set<Delta>>();

  constructor(readonly lossless: Lossless, readonly id: DomainEntityID) {}

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
      debug(`[${this.lossless.rhizomeNode.config.peerId}]`, `entity ${this.id} added delta:`, JSON.stringify(delta));
    }
  }

  toJSON() {
    const properties: {[key: PropertyID]: number} = {};
    for (const [key, deltas] of this.properties.entries()) {
      properties[key] = deltas.size;
    }
    return {
      id: this.id,
      properties
    };
  }
}

export class Lossless {
  domainEntities = new LosslessEntityMap();
  transactions: Transactions;
  referencedAs = new Map<string, Set<DomainEntityID>>();
  eventStream = new EventEmitter();
  
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
              ent = new LosslessEntity(this, entityId);
              this.domainEntities.set(entityId, ent);
            }
            // Add negation delta to the entity
            // For negation deltas, we need to add them to a special property
            // since they don't directly target the entity
            let negationDeltas = ent.properties.get('_negations');
            if (!negationDeltas) {
              negationDeltas = new Set<Delta>();
              ent.properties.set('_negations', negationDeltas);
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
          ent = new LosslessEntity(this, target);
          this.domainEntities.set(target, ent);
        }

        ent.addDelta(delta);
      }
    }

    for (const {target, localContext} of delta.pointers) {
      if (typeof target === "string" && this.domainEntities.has(target)) {
        if (this.domainEntities.has(target)) {
          let referencedAs = this.referencedAs.get(localContext);
          if (!referencedAs) {
            referencedAs = new Set<string>();
            this.referencedAs.set(localContext, referencedAs);
          }
          referencedAs.add(target);
        }
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

  viewSpecific(entityId: DomainEntityID, deltaIds: DeltaID[], deltaFilter?: DeltaFilter): LosslessViewOne | undefined {
    const combinedFilter = (delta: Delta) => {
      if (!deltaIds.includes(delta.id)) {
        return false;
      }
      if (!deltaFilter) return true;
      return deltaFilter(delta);
    };
    const res = this.compose([entityId], (delta) => combinedFilter(delta));
    return res[entityId];
  }

  decompose(view: LosslessViewOne): Delta[] {
    const allDeltas: Delta[] = [];
    const seenDeltaIds = new Set<DeltaID>();
    
    // Collect all deltas from all properties
    for (const [propertyId, deltas] of Object.entries(view.propertyDeltas)) {
      for (const delta of deltas) {
        if (!seenDeltaIds.has(delta.id)) {
          seenDeltaIds.add(delta.id);
          // Convert CollapsedDelta back to Delta
          const fullDelta = new Delta({
            id: delta.id,
            creator: delta.creator,
            host: delta.host,
            timeCreated: delta.timeCreated,
            pointers: delta.pointers.map(pointer => {
              // Convert back to V1 pointer format for Delta constructor
              const pointerEntries = Object.entries(pointer);
              if (pointerEntries.length === 1) {
                const [localContext, target] = pointerEntries[0];
                if (typeof target === 'string' && this.domainEntities.has(target)) {
                  // This is a reference pointer to an entity
                  // The targetContext is the property ID this delta appears under
                  return { localContext, target, targetContext: propertyId };
                } else {
                  // Scalar pointer
                  return { localContext, target: target as PropertyTypes };
                }
              }
              // Fallback for unexpected pointer structure
              return { localContext: 'unknown', target: 'unknown' };
            })
          });
          allDeltas.push(fullDelta);
        }
      }
    }
    
    return allDeltas;
  }

  // Backward compatibility alias
  view(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): LosslessViewMany {
    return this.compose(entityIds, deltaFilter);
  }

  compose(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): LosslessViewMany {
    const view: LosslessViewMany = {};
    entityIds = entityIds ?? Array.from(this.domainEntities.keys());

    for (const id of entityIds) {
      const ent = this.domainEntities.get(id);
      if (!ent) continue;


      const referencedAs = new Set<string>();
      const propertyDeltas: {
        [key: PropertyID]: CollapsedDelta[]
      } = {};

      let hasVisibleDeltas = false;

      // First, collect all deltas for this entity to properly apply negations
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
        const visibleDeltas: CollapsedDelta[] = [];

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

          const pointers: CollapsedPointer[] = [];

          for (const {localContext, target} of delta.pointers) {
            pointers.push({[localContext]: target});
            if (target === ent.id) {
              referencedAs.add(localContext);
            }
          }

          visibleDeltas.push({
            ...delta,
            pointers
          });
          hasVisibleDeltas = true;
        }

        if (visibleDeltas.length > 0) {
          propertyDeltas[key] = visibleDeltas;
        }
      }

      // Only include entity in view if it has visible deltas
      if (hasVisibleDeltas) {
        view[ent.id] = {
          id: ent.id,
          referencedAs: Array.from(referencedAs.values()),
          propertyDeltas
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
      // Skip the special _negations property in the per-property stats
      if (property === '_negations') {
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

    const negationProperty = ent.properties.get('_negations');
    if (!negationProperty) return [];

    return Array.from(negationProperty);
  }

  // TODO: point-in-time queries
}
