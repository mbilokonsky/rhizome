// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import Debug from 'debug';
import EventEmitter from 'events';
import {Delta, DeltaFilter, DeltaID, DeltaNetworkImageV1} from './delta';
import {RhizomeNode} from './node';
import {Transactions} from './transactions';
import {DomainEntityID, PropertyID, PropertyTypes, TransactionID, ViewMany} from "./types";
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

  ingestDelta(delta: Delta): TransactionID | undefined {
    const targets = delta.pointers
      .filter(({targetContext}) => !!targetContext)
      .map(({target}) => target)
      .filter((target) => typeof target === 'string')

    for (const target of targets) {
      let ent = this.domainEntities.get(target);

      if (!ent) {
        ent = new LosslessEntity(this, target);
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
        this.eventStream.emit("updated", id, [delta.id]);
      }
    }
    return transactionId;
  }

  viewSpecific(entityId: DomainEntityID, deltaIds: DeltaID[], deltaFilter?: DeltaFilter): LosslessViewOne | undefined {
    const combinedFilter = (delta: Delta) => {
      if (!deltaIds.includes(delta.id)) {
        debug(`[${this.rhizomeNode.config.peerId}]`, `Excluding delta ${delta.id} because it's not in the requested list of deltas`);
        return false;
      }
      if (!deltaFilter) return true;
      return deltaFilter(delta);
    };
    const res = this.view([entityId], (delta) => combinedFilter(delta));
    return res[entityId];
  }

  view(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): LosslessViewMany {
    const view: LosslessViewMany = {};
    entityIds = entityIds ?? Array.from(this.domainEntities.keys());

    for (const id of entityIds) {
      const ent = this.domainEntities.get(id);
      if (!ent) continue;


      const referencedAs = new Set<string>();
      const propertyDeltas: {
        [key: PropertyID]: CollapsedDelta[]
      } = {};

      for (const [key, deltas] of ent.properties.entries()) {
        propertyDeltas[key] = propertyDeltas[key] || [];

        for (const delta of deltas) {
          if (deltaFilter && !deltaFilter(delta)) {
            continue;
          }

          // If this delta is part of a transaction,
          // we need to be able to wait for the whole transaction.
          if (delta.transactionId) {
            if (!this.transactions.isComplete(delta.transactionId)) {
              // TODO: Test this condition
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

          propertyDeltas[key].push({
            ...delta,
            pointers
          });
        }
      }

      view[ent.id] = {
        id: ent.id,
        referencedAs: Array.from(referencedAs.values()),
        propertyDeltas
      };
    }

    return view;
  }

  // TODO: point-in-time queries
}
