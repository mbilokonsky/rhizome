// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import Debug from 'debug';
import EventEmitter from 'events';
import {Delta, DeltaFilter, DeltaNetworkImage} from './delta.js';
import {Transactions} from './transactions.js';
import {DomainEntityID, PropertyID, PropertyTypes, TransactionID, ViewMany} from "./types.js";
const debug = Debug('lossless');

export type CollapsedPointer = {[key: PropertyID]: PropertyTypes};

export type CollapsedDelta = Omit<DeltaNetworkImage, 'pointers'> & {
  pointers: CollapsedPointer[];
};

export type LosslessViewOne = {
  referencedAs: string[];
  properties: {
    [key: PropertyID]: CollapsedDelta[]
  }
};

export type LosslessViewMany = ViewMany<LosslessViewOne>;

class LosslessEntityMap extends Map<DomainEntityID, LosslessEntity> {};

class LosslessEntity {
  id: DomainEntityID;
  properties = new Map<PropertyID, Set<Delta>>();

  constructor(id: DomainEntityID) {
    this.id = id;
  }

  addDelta(delta: Delta) {
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
  transactions = new Transactions();
  referencedAs = new Map<string, Set<DomainEntityID>>();
  eventStream = new EventEmitter();

  constructor() {
    this.transactions.eventStream.on("completed", (transactionId) => {
      debug(`completed transaction ${transactionId}`);
      const transaction = this.transactions.get(transactionId);
      if (!transaction) return;
      for (const id of transaction.entityIds) {
        this.eventStream.emit("updated", id);
      }
    });
  }

  ingestDelta(delta: Delta): TransactionID | undefined {
    const targets = delta.pointers
      .filter(({targetContext}) => !!targetContext)
      .map(({target}) => target)
      .filter((target) => typeof target === 'string')

    for (const target of targets) {
      let ent = this.domainEntities.get(target);

      if (!ent) {
        ent = new LosslessEntity(target);
        this.domainEntities.set(target, ent);
      }

      ent.addDelta(delta);
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
        this.eventStream.emit("updated", id);
      }
    }
    return transactionId;
  }

  view(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): LosslessViewMany {
    const view: LosslessViewMany = {};
    entityIds = entityIds ?? Array.from(this.domainEntities.keys());
    for (const id of entityIds) {
      const ent = this.domainEntities.get(id);
      if (!ent) continue;

      const referencedAs = new Set<string>();
      const properties: {
        [key: PropertyID]: CollapsedDelta[]
      } = {};

      for (const [key, deltas] of ent.properties.entries()) {
        properties[key] = properties[key] || [];

        for (const delta of deltas) {
          // If this delta is part of a transaction,
          // we need to be able to wait for the whole transaction.
          if (delta.transactionId) {
            if (!this.transactions.isComplete(delta.transactionId)) {
              // TODO: Test this condition
              debug(`excluding delta ${delta.id} because transaction ${delta.transactionId} is not completed`);
              continue;
            }
          }

          if (deltaFilter) {
            const include = deltaFilter(delta);
            if (!include) continue;
          }

          const pointers: CollapsedPointer[] = [];

          for (const {localContext, target} of delta.pointers) {
            pointers.push({[localContext]: target});
            if (target === ent.id) {
              referencedAs.add(localContext);
            }
          }

          const collapsedDelta: CollapsedDelta = {
            ...delta,
            pointers
          };

          properties[key].push(collapsedDelta);
        }
      }

      view[ent.id] = {
        referencedAs: Array.from(referencedAs.values()),
        properties
      };
    }
    return view;
  }

  // TODO: point-in-time queries
}
