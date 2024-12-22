// The goal here is to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

type Property = {
  name: string,
  type: number | string;
}

class EntityType {
  name: string;
  properties?: Property[];
  constructor(name: string) {
    this.name = name;
  }
}

class Entity {
  type: EntityType;
  properties?: object;
  constructor(type: EntityType) {
    this.type = type;
  }
}

class Collection {
  entities = new Map<string, Entity>();
  // update(entityId, properties)
  // ...
}

export class Collections {
  collections = new Map<string, Collection>();
}
