// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import Debug from 'debug';
import {randomUUID} from "node:crypto";
import EventEmitter from "node:events";
import {Delta, DeltaFilter} from "./delta.js";
import {Entity, EntityProperties} from "./entity.js";
import {Lossy, ResolvedViewOne, Resolver} from "./lossy.js";
import {RhizomeNode} from "./node.js";
import {DomainEntityID} from "./types.js";
const debug = Debug('rz:collection');

export class Collection {
  rhizomeNode?: RhizomeNode;
  name: string;
  eventStream = new EventEmitter();
  lossy?: Lossy;

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

    this.lossy = new Lossy(this.rhizomeNode.lossless);

    // Listen for completed transactions, and emit updates to event stream
    this.rhizomeNode.lossless.eventStream.on("updated", (id) => {
      // TODO: Filter so we only get members of our collection

      // TODO: Reslover / Delta Filter?
      const res = this.resolve(id);
      this.eventStream.emit("update", res);
    });

    rhizomeNode.httpServer.httpApi.serveCollection(this);

    debug(`[${this.rhizomeNode.config.peerId}]`, `Connected ${this.name} to rhizome`);
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
  ): {
    transactionDelta: Delta | undefined,
    deltas: Delta[]
  } {
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

    let transactionDelta: Delta | undefined;

    if (deltas.length > 1) {
      // We can generate a separate delta describing this transaction
      transactionDelta = new Delta({
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

      // Also need to annotate the deltas with the transactionId
      for (const delta of deltas) {
        delta.pointers.unshift({
          localContext: "_transaction",
          target: transactionId,
          targetContext: "deltas"
        });
      }
    }

    return {transactionDelta, deltas};
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

    const {transactionDelta, deltas} = this.generateDeltas(
      entityId,
      properties,
      this.rhizomeNode?.config.creator,
      this.rhizomeNode?.config.peerId,
      resolver,
    );

    const ingested = new Promise<boolean>((resolve) => {
      this.rhizomeNode!.lossless.eventStream.on("updated", (id: DomainEntityID) => {
        if (id === entityId) resolve(true);
      })
    });

    if (transactionDelta) {
      deltas.unshift(transactionDelta);
    }

    deltas.forEach(async (delta: Delta) => {
      // record this delta just as if we had received it from a peer
      delta.receivedFrom = this.rhizomeNode!.myRequestAddr;
      this.rhizomeNode!.deltaStream.deltasAccepted.push(delta);

      // publish the delta to our subscribed peers
      await this.rhizomeNode!.deltaStream.publishDelta(delta);

      // ingest the delta as though we had received it from a peer
      this.rhizomeNode!.lossless.ingestDelta(delta);
    });

    // Return updated view of this entity
    // Let's wait for an event notifying us that the entity has been updated.
    // This means all of our deltas have been applied.

    await ingested;

    const res = this.resolve(entityId, resolver);
    if (!res) throw new Error("could not get what we just put!");
    return res;
  }

  resolve<T = ResolvedViewOne>(
    id: string,
    resolver?: Resolver,
    deltaFilter?: DeltaFilter
  ): T | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.lossy) throw new Error('lossy view not initialized');

    const res = this.lossy.resolve(resolver, [id], deltaFilter) || {};

    return res[id] as T;
  }
}
