// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import Debug from 'debug';
import {randomUUID} from "node:crypto";
import EventEmitter from "node:events";
import {Delta, DeltaID} from "./delta";
import {Entity, EntityProperties} from "./entity";
import {Lossy, ResolvedViewOne, Resolver} from "./lossy";
import {RhizomeNode} from "./node";
import {DomainEntityID} from "./types";
const debug = Debug('collection');

export class Collection {
  rhizomeNode?: RhizomeNode;
  name: string;
  eventStream = new EventEmitter();

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
      this.ingestDelta(delta);
    });

    rhizomeNode.httpServer.httpApi.serveCollection(this);

    debug(`connected ${this.name} to rhizome`);
  }

  ingestDelta(delta: Delta) {
    if (!this.rhizomeNode) return;

    const updated = this.rhizomeNode.lossless.ingestDelta(delta);

    this.eventStream.emit('ingested', delta);
    this.eventStream.emit('updated', updated);
  }

  // Applies the javascript rules for updating object values,
  // e.g. set to `undefined` to delete a property.
  // This function is here instead of Entity so that it can:
  // - read the current state in order to build its delta
  // - include the collection name in the delta it produces
  generateDeltas(
    entityId: DomainEntityID,
    newProperties: EntityProperties,
    creator: string,
    host: string,
    resolver?: Resolver
  ): Delta[] {
    const deltas: Delta[] = [];
    let oldProperties: EntityProperties = {};

    if (entityId) {
      const entity = this.resolve(entityId, resolver);
      if (entity) {
        oldProperties = entity.properties;
      }
    }

    // Generate a transaction ID
    const transactionId = `transaction-${randomUUID()}`;

    // Generate a delta for each changed property
    Object.entries(newProperties).forEach(([key, value]) => {
      // Disallow property named "id" 
      if (key === 'id') return;

      if (oldProperties[key] !== value && host && creator) {
        deltas.push(new Delta({
          creator,
          host,
          pointers: [{
            localContext: "_transaction",
            target: transactionId,
            targetContext: "deltas"
          }, {
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

    // We can generate a separate delta describing this transaction
    const transactionDelta = new Delta({
      creator,
      host,
      pointers: [{
        localContext: "_transaction",
        target: transactionId,
        targetContext: "size"
      }, {
        localContext: "size",
        target: deltas.length
      }]
    });

    return [transactionDelta, ...deltas];
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

  getIds(): string[] {
    if (!this.rhizomeNode) return [];
    const set = this.rhizomeNode.lossless.referencedAs.get(this.name);
    if (!set) return [];
    return Array.from(set.values());
  }

  // THIS PUT SHOULD CORRESOND TO A PARTICULAR MATERIALIZED VIEW...
  // How can we encode that?
  // Well, we have a way to do that, we just need the same particular inputs.
  // We take a resolver as an optional argument.
  async put(
    entityId: DomainEntityID | undefined,
    properties: EntityProperties,
    resolver?: Resolver
  ): Promise<ResolvedViewOne> {
    if (!this.rhizomeNode) throw new Error('collection not connecte to rhizome');

    // For convenience, we allow setting id via properties.id
    if (!entityId && !!properties.id && typeof properties.id === 'string') {
      entityId = properties.id;
    }
    // Generate an ID if none is provided
    if (!entityId) {
      entityId = randomUUID();
    }

    const deltas = this.generateDeltas(
      entityId,
      properties,
      this.rhizomeNode?.config.creator,
      this.rhizomeNode?.config.peerId,
      resolver,
    );

    debug(`put ${entityId} generated deltas:`, JSON.stringify(deltas));

    // Here we set up a listener so we can wait for all our deltas to be
    // ingested into our lossless view before proceeding.
    // TODO: Hoist this into a more generic transaction mechanism.

    // 

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

    const res = this.resolve(entityId, resolver);
    if (!res) throw new Error("could not get what we just put!");

    this.eventStream.emit("update", res);

    return res;
  }

  resolve<T = ResolvedViewOne>(id: string, resolver?: Resolver): T | undefined {
    // Now with lossy view approach, instead of just returning what we
    // already have, let's compute our view now.
    // return this.entities.resolve(id);
    // TODO: Caching

    if (!this.rhizomeNode) return undefined;

    const lossy = new Lossy(this.rhizomeNode.lossless);
    // TODO: deltaFilter
    const res = lossy.resolve(resolver, [id]);
    debug('lossy view', res);

    return res[id] as T;
  }
}
