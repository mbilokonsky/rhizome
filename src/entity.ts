// The goal here is to provide a translation for
// entities and their properties
// to and from (sequences of) deltas.

// How can our caller define the entities and their properties?
// - As typescript types?
// - As typescript interfaces?
// - As typescript classes?

import {Collection} from "./collection";
import {PropertyTypes} from "./types";

export type EntityProperties = {
  [key: string]: PropertyTypes;
};

export class Entity {
  properties: EntityProperties = {};
  ahead = 0;

  constructor(
    readonly id: string,
    readonly collection?: Collection
  ) {}

  async save() {
    if (!this.collection) throw new Error('to save this entity you must specify the collection');
    return this.collection.put(this.id, this.properties);
  }
}
