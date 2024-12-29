// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import Debug from 'debug';
import {randomUUID} from "node:crypto";
import EventEmitter from "node:events";
import {Delta, DeltaID} from "./delta";
import {Entity, EntityProperties} from "./entity";
import {LosslessViewMany} from "./lossless";
import {firstValueFromLosslessViewOne, Lossy, LossyViewMany, LossyViewOne} from "./lossy";
import {RhizomeNode} from "./node";
import {DomainEntityID} from "./types";
const debug = Debug('collection');

export class Collection {
  rhizomeNode?: RhizomeNode;
  name: string;
  entities = new Map<string, Entity>();
  eventStream = new EventEmitter();

  constructor(name: string) {
    this.name = name;
  }

  ingestDelta(delta: Delta) {
    if (!this.rhizomeNode) return;

    const updated = this.rhizomeNode.lossless.ingestDelta(delta);

    this.eventStream.emit('ingested', delta);
    this.eventStream.emit('updated', updated);
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
      this.ingestDelta(delta);
    });

    rhizomeNode.httpServer.httpApi.serveCollection(this);

    debug(`connected ${this.name} to rhizome`);
  }

  onCreate(cb: (entity: Entity) => void) {
    // TODO: Trigger for changes received from peers
    this.eventStream.on('create', (entity: Entity) => {
      cb(entity);
    });
  }

  onUpdate(cb: (entity: Entity) => void) {
    // TODO: Trigger for changes received from peers
    this.eventStream.on('update', (entity: Entity) => {
      cb(entity);
    });
  }

  defaultResolver(losslessView: LosslessViewMany): LossyViewMany {
    const resolved: LossyViewMany = {};
    debug('default resolver, lossless view', JSON.stringify(losslessView));
    for (const [id, ent] of Object.entries(losslessView)) {
      resolved[id] = {id, properties: {}};
      for (const key of Object.keys(ent.properties)) {
        const {value} = firstValueFromLosslessViewOne(ent, key) || {};
        debug(`[ ${key} ] = ${value}`);
        resolved[id].properties[key] = value;
      }
    }
    return resolved;
  }

  // Applies the javascript rules for updating object values,
  // e.g. set to `undefined` to delete a property
  generateDeltas(
    entityId: DomainEntityID,
    newProperties: EntityProperties,
    creator?: string,
    host?: string
  ): Delta[] {
    const deltas: Delta[] = [];
    let oldProperties: EntityProperties = {};

    if (entityId) {
      const entity = this.get(entityId);
      if (entity) {
        oldProperties = entity.properties;
      }
    }

    // Generate a delta for each changed property
    Object.entries(newProperties).forEach(([key, value]) => {
      // Disallow property named "id" TODO: Clarify id semantics
      if (key === 'id') return;

      if (oldProperties[key] !== value && host && creator) {
        deltas.push(new Delta({
          creator,
          host,
          pointers: [{
            localContext: this.name,
            target: entityId,
            targetContext: key
          }, {
            localContext: key,
            target: value
          }]
        }));
      }
    });

    return deltas;
  }

  async put(
    entityId: DomainEntityID | undefined,
    properties: EntityProperties
  ): Promise<LossyViewOne> {
    // const deltas: Delta[] = [];
    // const entity = this.updateEntity(entityId, properties, true, deltas);

    // THIS PUT SHOULD CORRESOND TO A PARTICULAR MATERIALIZED VIEW...
    // How can we encode that?
    // Well, we have a way to do that, we just need the same particular inputs

    if (!entityId) {
      entityId = randomUUID();
    }

    const deltas = this.generateDeltas(
      entityId,
      properties,
      this.rhizomeNode?.config.creator,
      this.rhizomeNode?.config.peerId,
    );

    debug(`put ${entityId} generated deltas:`, JSON.stringify(deltas));

    const allIngested = new Promise<boolean>((resolve) => {
      const ingestedIds = new Set<DeltaID>();
      this.eventStream.on('ingested', (delta: Delta) => {
        // TODO: timeout
        if (deltas.map(({id}) => id).includes(delta.id)) {
          ingestedIds.add(delta.id);
          if (ingestedIds.size === deltas.length) {
            resolve(true);
          }
        }
      })
    });

    // updateEntity may have generated some deltas for us to store and publish
    deltas.forEach(async (delta: Delta) => {

      // record this delta just as if we had received it from a peer
      delta.receivedFrom = this.rhizomeNode!.myRequestAddr;
      this.rhizomeNode!.deltaStream.deltasAccepted.push(delta);

      // publish the delta to our subscribed peers
      await this.rhizomeNode!.deltaStream.publishDelta(delta);
      debug(`published delta ${JSON.stringify(delta)}`);

      // ingest the delta as though we had received it from a peer
      this.ingestDelta(delta);
    });

    // Return updated view of this entity
    // Let's wait for an event notifying us that the entity has been updated.
    // This means all of our deltas have been applied.

    await allIngested;

    const res = this.get(entityId);
    if (!res) throw new Error("could not get what we just put!");

    this.eventStream.emit("update", res);

    return res;
  }

  get(id: string): LossyViewOne | undefined {
    // Now with lossy view approach, instead of just returning what we already have,
    // let's compute our view now.
    // return this.entities.get(id);
    if (!this.rhizomeNode) return undefined;
    const lossy = new Lossy(this.rhizomeNode.lossless);
    const res = lossy.resolve((view) => this.defaultResolver(view), [id]);
    return res[id];
  }

  getIds(): string[] {
    if (!this.rhizomeNode) return [];
    return Array.from(this.rhizomeNode.lossless.domainEntities.keys());
  }
}
