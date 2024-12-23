// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import {Delta, PropertyTypes} from "./types";

type DomainEntityID = string;
type PropertyID = string;

export type LosslessView = {[key: string]: {[key: string]: Delta[]}};
export type CollapsedPointer = {[key: string]: PropertyTypes};
export type CollapsedDelta = Omit<Delta, 'pointers'> & {
  pointers: CollapsedPointer[];
};

class DomainEntityMap extends Map<DomainEntityID, DomainEntity> {};

class DomainEntityProperty {
  id: PropertyID;
  deltas = new Set<Delta>();

  constructor(id: PropertyID) {
    this.id = id;
  }
}

class DomainEntity {
  id: DomainEntityID;
  properties = new Map<PropertyID, DomainEntityProperty>();

  constructor(id: DomainEntityID) {
    this.id = id;
  }

  addDelta(delta: Delta) {
    const targetContexts = delta.pointers
      .filter(({target}) => target === this.id)
      .map(({targetContext}) => targetContext)
      .filter((targetContext) => typeof targetContext === 'string');
    for (const targetContext of targetContexts) {
      let property = this.properties.get(targetContext);
      if (!property) {
        property = new DomainEntityProperty(targetContext);
        this.properties.set(targetContext, property);
      }
      property.deltas.add(delta);
    }
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
      ent.addDelta(delta);
    }
  }

  view() {
    const view: {[key: DomainEntityID]: {[key: PropertyID]: CollapsedDelta[]}} = {};
    for (const ent of this.domainEntities.values()) {
      const obj: {[key: PropertyID]: CollapsedDelta[]} = {};
      view[ent.id] = obj;
      for (const prop of ent.properties.values()) {
        obj[prop.id] = obj[prop.id] || [];
        for (const delta of prop.deltas) {
          const collapsedDelta: CollapsedDelta = {
            ...delta,
            pointers: delta.pointers.map(({localContext, target}) => ({
              [localContext]: target
            }))
          };
          obj[prop.id].push(collapsedDelta);
        }
      }
    }
    return view;
  }
}
