// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import Debug from 'debug';
import {Delta, DeltaFilter, DeltaID} from './delta';
import {DomainEntityID, PropertyID, PropertyTypes, TransactionID, ViewMany} from "./types";
const debug = Debug('lossless');

export type CollapsedPointer = {[key: PropertyID]: PropertyTypes};

export type CollapsedDelta = Omit<Delta, 'pointers'> & {
  pointers: CollapsedPointer[];
};

export type LosslessViewOne = {
  referencedAs: string[];
  properties: {
    [key: PropertyID]: CollapsedDelta[]
  }
};

export type LosslessViewMany = ViewMany<LosslessViewOne>;

class DomainEntityMap extends Map<DomainEntityID, DomainEntity> {};

class DomainEntity {
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

      debug(`adding delta for entity ${this.id}`);
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

class Transaction {
  size?: number;
  receivedDeltaIds = new Set<DeltaID>();
}

class Transactions {
  transactions = new Map<TransactionID, Transaction>();

  getOrInit(id: TransactionID): Transaction {
    let t = this.transactions.get(id);
    if (!t) {
      t = new Transaction();
      this.transactions.set(id, t);
    }
    return t;
  }

  receivedDelta(id: TransactionID, deltaId: DeltaID) {
    const t = this.getOrInit(id);
    t.receivedDeltaIds.add(deltaId);
  }

  isComplete(id: TransactionID) {
    const t = this.getOrInit(id);
    return t.size !== undefined && t.receivedDeltaIds.size === t.size;
  }

  setSize(id: TransactionID, size: number) {
    const t = this.getOrInit(id);
    t.size = size;
  }

  get ids() {
    return Array.from(this.transactions.keys());
  }
}

export class Lossless {
  domainEntities = new DomainEntityMap();
  transactions = new Transactions();
  referencedAs = new Map<string, Set<DomainEntityID>>();
  // referencingAs = new Map<string, Set<DomainEntityID>>();

  ingestDelta(delta: Delta) {
    const targets = delta.pointers
      .filter(({targetContext}) => !!targetContext)
      .map(({target}) => target)
      .filter((target) => typeof target === 'string')

    for (const target of targets) {
      let ent = this.domainEntities.get(target);

      if (!ent) {
        ent = new DomainEntity(target);
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

    const {target: transactionId} = delta.pointers.find(({
      localContext,
      target,
      targetContext
    }) =>
      localContext === "_transaction" &&
      typeof target === "string" &&
      targetContext === "deltas"
    ) || {};

    if (transactionId) {
      // This delta is part of a transaction
      this.transactions.receivedDelta(transactionId as string, delta.id);
    } else {
      const {target: transactionId} = delta.pointers.find(({
        localContext,
        target,
        targetContext
      }) =>
        localContext === "_transaction" &&
        typeof target === "string" &&
        targetContext === "size"
      ) || {};

      if (transactionId) {
        // This delta describes a transaction
        const {target: size} = delta.pointers.find(({
          localContext,
          target
        }) =>
          localContext === "size" &&
          typeof target === "number"
        ) || {};

        this.transactions.setSize(transactionId as string, size as number);
      }
    }
  }

  view(entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): LosslessViewMany {
    const view: LosslessViewMany = {};
    entityIds = entityIds ?? Array.from(this.domainEntities.keys());
    for (const id of entityIds) {
      const ent = this.domainEntities.get(id);
      if (!ent) continue;

      debug(`domain entity ${id}`, JSON.stringify(ent));

      const referencedAs = new Set<string>();
      const properties: {
        [key: PropertyID]: CollapsedDelta[]
      } = {};

      for (const [key, deltas] of ent.properties.entries()) {
        properties[key] = properties[key] || [];

        for (const delta of deltas) {

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
