// The goal here is to provide a translation for
// entities and their properties
// to and from (sequences of) deltas.
 
// How can our caller define the entities and their properties?
// - As typescript types?
// - As typescript interfaces?
// - As typescript classes?

import { CREATOR, HOST_ID } from "./config";
import { Delta, PropertyTypes } from "./types";

export type EntityProperties = {
  [key: string]: PropertyTypes
};

export class Entity {
  id: string;
  properties: EntityProperties;
  ahead = 0;
  constructor(id: string) {
    this.id = id;
    this.properties = {};
  }
}

// TODO: Use leveldb for storing view snapshots

export class EntityPropertiesDeltaBuilder {
  delta: Delta;
  constructor(entityId: string) {
    this.delta = {
      creator: CREATOR,
      host: HOST_ID,
      pointers: [{
        localContext: 'id',
        target: entityId,
        targetContext: 'properties'
      }]
    };
  }
  add(localContext: string, target: PropertyTypes) {
    this.delta.pointers.push({localContext, target});
  }
}

