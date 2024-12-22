// The goal here is to provide a translation for
// entities and their properties
// to and from (sequences of) deltas.
 
// How can our caller define the entities and their properties?
// - As typescript types?
// - As typescript interfaces?
// - As typescript classes?

import EventEmitter from "node:events";
import { CREATOR, HOST } from "./config";
import { publishDelta, subscribeDeltas } from "./deltas";
import { Delta, PropertyTypes } from "./types";
import { randomUUID } from "node:crypto";

const entityEventStream = new EventEmitter();

type EntityProperties = {
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
  onUpdate(cb: (entity: Entity) => void) {
    // TODO: This doesn't seem like it will scale well.
    entityEventStream.on('update', (entity: Entity) => {
      if (entity.id === this.id) {
        cb(entity);
      }
    });
  }
}

const entities = new Map<string, Entity>();
// TODO: Use leveldb for storing view snapshots

class EntityPropertiesDeltaBuilder {
  delta: Delta;
  constructor(entityId: string) {
    this.delta = {
      creator: CREATOR,
      host: HOST,
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

// Applies the javascript rules for updating object values,
// e.g. set to `undefined` to delete a property
function updateEntity(entityId?: string, properties?: object, local = false, deltas?: Delta[]): Entity {
  let entity: Entity | undefined;
  let eventType: 'create' | 'update' | 'delete' | undefined;
  entityId = entityId ?? randomUUID();
  entity = entities.get(entityId);
  if (!entity) {
    entity = new Entity(entityId);
    entity.id = entityId;
    eventType = 'create';
  }
  const deltaBulider = new EntityPropertiesDeltaBuilder(entityId);

  if (!properties) {
    // Let's interpret this as entity deletion
    entities.delete(entityId);
    // TODO: prepare and publish a delta
    // TODO: execute hooks
    eventType = 'delete';
  } else {
    let anyChanged = false;
    Object.entries(properties).forEach(([key, value]) => {
      let changed = false;
      if (entity.properties && entity.properties[key] !== value) {
        entity.properties[key] = value;
        changed = true;
      }
      if (local && changed) {
        // If this is a change, let's generate a delta
        deltaBulider.add(key, value);
        // We append to the array the caller may provide
        // We can update this count as we receive network confirmation for deltas
        entity.ahead += 1;
      }
      anyChanged = anyChanged || changed;
    });
    // We've noted that we may be ahead of the server, let's update our
    // local image of this entity.
    //* In principle, this system can recreate past or alternative states.
    //* At worst, by replaying all the deltas up to a particular point.
    //* Some sort of checkpointing strategy would probably be helpful.
    //* Furthermore, if we can implement reversible transformations,
    //* it would then be efficient to calculate the state of the system with 
    //* specific deltas removed. We could use it to extract a measurement
    //* of the effects of some deltas' inclusion or exclusion, the
    //* evaluation of which may lend evidence to some possible arguments.
   
    entities.set(entityId, entity);
    if (anyChanged) {
      deltas?.push(deltaBulider.delta);
      eventType = eventType || 'update';
    }
  }
  if (eventType) {
    entityEventStream.emit(eventType, entity);
  }
  return entity;
}

// We can update our local image of the entity, but we should annotate it
// to indicate that we have not yet received any confirmation of this delta
// having been propagated.
// Later when we receive deltas regarding this entity we can detect when
// we have received back an image that matches our target.

// So we need a function to generate one or more deltas for each call to put/
// maybe we stage them and wait for a call to commit() that initiates the
// assembly and transmission of one or more deltas

function applyDelta(delta: Delta) {
  // TODO: handle delta representing entity deletion
  const idPtr = delta.pointers.find(({localContext}) => localContext === 'id');
  if (!idPtr) {
    console.error('encountered delta with no entity id', delta);
    return;
  }
  const properties: EntityProperties = {};
  delta.pointers.filter(({localContext}) => localContext !== 'id')
    .forEach(({localContext: key, target: value}) => {
      properties[key] = value;
    }, {});
  const entityId = idPtr.target as string;
  // TODO: Handle the scenario where this update has been superceded by a newer one locally
  updateEntity(entityId, properties);
}

subscribeDeltas((delta: Delta) => {
  // TODO: Make sure this is the kind of delta we're looking for
  applyDelta(delta);
});

export class Entities {
  constructor() {
   entityEventStream.on('create', (entity: Entity) => {
     console.log(`new entity!`, entity);
   });
  }
  put(entityId: string | undefined, properties: object): Entity {
    const deltas: Delta[] = [];
    const entity = updateEntity(entityId, properties, true, deltas);
    deltas.forEach(async (delta: Delta) => {
      await publishDelta(delta);
    });
    return entity;
  }
  del(entityId: string) {
    const deltas: Delta[] = [];
    updateEntity(entityId, undefined, true, deltas);
    deltas.forEach(async (delta: Delta) => {
      await publishDelta(delta);
    });
  }
  get(id: string): Entity | undefined {
    return entities.get(id);
  }
  getIds(): string[] {
    return Array.from(entities.keys());
  }
}
