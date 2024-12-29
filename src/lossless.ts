// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import Debug from 'debug';
import {Delta, DeltaFilter} from './delta';
import {DomainEntityID, PropertyID, PropertyTypes, ViewMany} from "./types";
const debug = Debug('lossless');

export type CollapsedPointer = {[key: string]: PropertyTypes};

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

export class Lossless {
  domainEntities = new DomainEntityMap();

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

      debug('before add, domain entity:', JSON.stringify(ent));

      ent.addDelta(delta);

      debug('after add, domain entity:', JSON.stringify(ent));
    }
  }

  //TODO: json logic -- view(deltaFilter?: FilterExpr) {
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
