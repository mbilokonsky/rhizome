// Deltas target entities.
// We can maintain a record of all the targeted entities, and the deltas that targeted them

import {Delta, DeltaFilter, PropertyTypes} from "./types";

type DomainEntityID = string;
type PropertyID = string;

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
export type LosslessViewMany = {
  [key: DomainEntityID]: LosslessViewOne;
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

  //TODO: json logic -- view(deltaFilter?: FilterExpr) {
  view(deltaFilter?: DeltaFilter): LosslessViewMany {
    const view: LosslessViewMany = {};
    for (const ent of this.domainEntities.values()) {
      const referencedAs = new Set<string>();
      view[ent.id] = {
        referencedAs: [],
        properties: {}
      };
      for (const prop of ent.properties.values()) {
        view[ent.id].properties[prop.id] = view[ent.id].properties[prop.id] || [];
        for (const delta of prop.deltas) {
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
          view[ent.id].referencedAs = Array.from(referencedAs.values());
          view[ent.id].properties[prop.id].push(collapsedDelta);
        }
      }
    }
    return view;
  }
}
