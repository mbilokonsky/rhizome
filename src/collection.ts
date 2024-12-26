// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import Debug from 'debug';
import {randomUUID} from "node:crypto";
import EventEmitter from "node:events";
import {Entity} from "./entity";
import {Lossless, LosslessViewMany} from "./lossless";
import {firstValueFromLosslessViewOne, Lossy, LossyViewMany, LossyViewOne} from "./lossy";
import {RhizomeNode} from "./node";
import {Delta} from "./types";
const debug = Debug('collection');

export class Collection {
  rhizomeNode?: RhizomeNode;
  name: string;
  entities = new Map<string, Entity>();
  eventStream = new EventEmitter();
  lossless = new Lossless(); // TODO: Really just need one global Lossless instance

  constructor(name: string) {
    this.name = name;
  }

  // Instead of trying to update our final view of the entity with every incoming delta,
  // let's try this: 
  // - keep a lossless view (of everything)
  // - build a lossy view when needed
  // This approach is simplistic, but can then be optimized and enhanced.

  rhizomeConnect(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;

    rhizomeNode.deltaStream.subscribeDeltas((delta: Delta) => {
      // TODO: Make sure this is the kind of delta we're looking for
      debug(`collection ${this.name} received delta ${JSON.stringify(delta)}`);
      this.lossless.ingestDelta(delta);
    });

    rhizomeNode.httpApi.serveCollection(this);

    debug(`connected ${this.name} to rhizome`);
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

    if (!properties) {
      // Let's interpret this as entity deletion
      this.entities.delete(entityId);
      // TODO: prepare and publish a delta
      // TODO: execute hooks
      eventType = 'delete';
    } else {
      let anyChanged = false;
      Object.entries(properties).forEach(([key, value]) => {
        if (key === 'id') return;
        let changed = false;
        if (entity.properties && entity.properties[key] !== value) {
          entity.properties[key] = value;
          changed = true;
        }
        if (local && changed) {
          // If this is a change, let's generate a delta
          if (!this.rhizomeNode) throw new Error(`${this.name} collection not connected to rhizome`);
          const delta: Delta = {
            creator: this.rhizomeNode.config.creator,
            host: this.rhizomeNode.config.peerId,
            pointers: [{
              localContext: this.name,
              target: entityId,
              targetContext: key
            }, {
              localContext: key,
              target: value
            }]
          };
          deltas?.push(delta);

          // We append to the array the caller may provide
          // We can update this count as we receive network confirmation for deltas
          entity.ahead += 1;
        }
        anyChanged = anyChanged || changed;
      });

      this.entities.set(entityId, entity);

      if (anyChanged) {
        eventType = eventType || 'update';
      }
    }
    if (eventType) {
      // TODO: Reconcile this with lossy view approach
      this.eventStream.emit(eventType, entity);
    }
    return entity;
  }

  onCreate(cb: (entity: Entity) => void) {
    // TODO: Reconcile this with lossy view approach
    this.eventStream.on('create', (entity: Entity) => {
      cb(entity);
    });
  }

  onUpdate(cb: (entity: Entity) => void) {
    // TODO: Reconcile this with lossy view approach
    this.eventStream.on('update', (entity: Entity) => {
      cb(entity);
    });
  }

  put(entityId: string | undefined, properties: object): Entity {
    const deltas: Delta[] = [];
    const entity = this.updateEntity(entityId, properties, true, deltas);

    debug(`put ${entityId} generated deltas:`, JSON.stringify(deltas));

    // updateEntity may have generated some deltas for us to store and publish
    deltas.forEach(async (delta: Delta) => {

      // record this delta just as if we had received it from a peer
      delta.receivedFrom = this.rhizomeNode!.myRequestAddr;
      this.rhizomeNode!.deltaStream.deltasAccepted.push(delta);

      // publish the delta to our subscribed peers
      await this.rhizomeNode!.deltaStream.publishDelta(delta);
      debug(`published delta ${JSON.stringify(delta)}`);

      // ingest the delta as though we had received it from a peer
      this.lossless.ingestDelta(delta);
    });
    return entity;
  }

  get(id: string): LossyViewOne | undefined {
    // Now with lossy view approach, instead of just returning what we already have,
    // let's compute our view now.
    // return this.entities.get(id);
    const lossy = new Lossy(this.lossless);
    const resolver = (losslessView: LosslessViewMany) => {
      const lossyView: LossyViewMany = {};
      debug('lossless view', JSON.stringify(losslessView));
      for (const [id, ent] of Object.entries(losslessView)) {
        lossyView[id] = {id, properties: {}};
        for (const key of Object.keys(ent.properties)) {
          const {value} = firstValueFromLosslessViewOne(ent, key) || {};
          debug(`[ ${key} ] = ${value}`);
          lossyView[id].properties[key] = value;
        }
      }
      return lossyView;
    };
    const res = lossy.resolve(resolver, [id]) as LossyViewMany;;
    return res[id];
  }

  getIds(): string[] {
    return Array.from(this.entities.keys());
  }
}
