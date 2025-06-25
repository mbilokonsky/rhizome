// The goal here is to provide a translation for
// entities and their properties
// to and from (sequences of) deltas.

// How can our caller define the entities and their properties?
// - As typescript types?
// - As typescript interfaces?
// - As typescript classes?

import {PropertyTypes} from "./types";

export type EntityProperties = {
  [key: string]: PropertyTypes;
};

export type EntityRecord = {
  id: string;
  properties: EntityProperties;
};

export class Entity {
  properties: EntityProperties = {};
  ahead = 0;

  constructor(
    readonly id: string,
  ) {}
}
