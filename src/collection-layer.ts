// The goal here is to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import EventEmitter from "node:events";
import { deltasAccepted, publishDelta, subscribeDeltas } from "./deltas";
import { Entity, EntityProperties, EntityPropertiesDeltaBuilder } from "./object-layer";
import { Delta } from "./types";
import { randomUUID } from "node:crypto";

// type Property = {
//   name: string,
//   type: number | string;
// }

// class EntityType {
//   name: string;
//   properties?: Property[];
//   constructor(name: string) {
//     this.name = name;
//   }
// }

// class Entity {
//   type: EntityType;
//   properties?: object;
//   constructor(type: EntityType) {
//     this.type = type;
//   }
// }

// class Collection {
  
  // update(entityId, properties)
  // ...
// }

// export class Collections {
//   collections = new Map<string, Collection>();
// }


export class Collection {
  entities = new Map<string, Entity>();
  eventStream = new EventEmitter();
  constructor() {
    subscribeDeltas((delta: Delta) => {
      // TODO: Make sure this is the kind of delta we're looking for
      this.applyDelta(delta);
    });
    this.eventStream.on('create', (entity: Entity) => {
      console.log(`new entity!`, entity);
    });
  }

  // Applies the javascript rules for updating object values,
  // e.g. set to `undefined` to delete a property
  updateEntity(entityId?: string, properties?: object, local = false, deltas?: Delta[]): Entity {
    let entity: Entity | undefined;
    let eventType: 'create' | 'update' | 'delete' | undefined;
    entityId = entityId ?? randomUUID();
    entity = this.entities.get(entityId);
    if (!entity) {
      entity = new Entity(entityId);
      entity.id = entityId;
      eventType = 'create';
    }
    const deltaBulider = new EntityPropertiesDeltaBuilder(entityId);
    console.log('deltaBulider -->', deltaBulider.delta);

    if (!properties) {
      // Let's interpret this as entity deletion
      this.entities.delete(entityId);
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
     
      this.entities.set(entityId, entity);
      if (anyChanged) {
        deltas?.push(deltaBulider.delta);
        eventType = eventType || 'update';
      }
    }
    if (eventType) {
      this.eventStream.emit(eventType, entity);
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

  applyDelta(delta: Delta) {
    // TODO: handle delta representing entity deletion
    console.log('applying delta:', delta);
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
    this.updateEntity(entityId, properties);
  }

  onCreate(cb: (entity: Entity) => void) {
    this.eventStream.on('create', (entity: Entity) => {
      cb(entity);
    });
  }
  onUpdate(cb: (entity: Entity) => void) {
    this.eventStream.on('update', (entity: Entity) => {
      cb(entity);
    });
  }
  put(entityId: string | undefined, properties: object): Entity {
    const deltas: Delta[] = [];
    const entity = this.updateEntity(entityId, properties, true, deltas);
    deltas.forEach(async (delta: Delta) => {
      deltasAccepted.push(delta);
      await publishDelta(delta);
    });
    return entity;
  }
  del(entityId: string) {
    const deltas: Delta[] = [];
    this.updateEntity(entityId, undefined, true, deltas);
    deltas.forEach(async (delta: Delta) => {
      deltasAccepted.push(delta);
      await publishDelta(delta);
    });
  }
  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }
  getIds(): string[] {
    return Array.from(this.entities.keys());
  }
}
