import express, {Router} from "express";
import {Collection} from "src/collection";
import {Delta} from "src/delta";
import {RhizomeNode} from "src/node";

export class HttpApi {
  router = Router();

  constructor(readonly rhizomeNode: RhizomeNode) {
    // --------------- deltas ----------------

    // Serve list of all deltas accepted
    // TODO: This won't scale well
    this.router.get("/deltas", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted);
    });

    // Get the number of deltas ingested by this node
    this.router.get("/deltas/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted.length);
    });

    // --------------- peers ----------------

    // Get the list of peers seen by this node (including itself)
    this.router.get("/peers", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.peers.peers.map(({reqAddr, publishAddr, isSelf, isSeedPeer}) => {
        const deltasAcceptedCount = this.rhizomeNode.deltaStream.deltasAccepted
          .filter((delta: Delta) => {
            return delta.receivedFrom?.addr == reqAddr.addr &&
              delta.receivedFrom?.port == reqAddr.port;
          })
          .length;
        const peerInfo = {
          reqAddr: reqAddr.toAddrString(),
          publishAddr: publishAddr?.toAddrString(),
          isSelf,
          isSeedPeer,
          deltaCount: {
            accepted: deltasAcceptedCount
          }
        };
        return peerInfo;
      }));
    });

    // Get the number of peers seen by this node (including itself)
    this.router.get("/peers/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.peers.peers.length);
    });
  }

  serveCollection(collection: Collection) {
    const {name} = collection;

    // Get the ID of all domain entities
    this.router.get(`/${name}/ids`, (_req: express.Request, res: express.Response) => {
      res.json({ids: collection.getIds()});
    });

    // Get a single domain entity by ID
    this.router.get(`/${name}/:id`, (req: express.Request, res: express.Response) => {
      const {params: {id}} = req;
      const ent = collection.resolve(id);
      if (!ent) {
        res.status(404).send({error: "Not Found"});
        return;
      }
      res.json(ent);
    });

    // Add a new domain entity
    // TODO: schema validation
    this.router.put(`/${name}`, async (req: express.Request, res: express.Response) => {
      const {body: {id, properties}} = req;
      const ent = await collection.put(id, properties);
      res.json(ent);
    });

    // Update a domain entity
    this.router.put(`/${name}/:id`, async (req: express.Request, res: express.Response) => {
      const {body: properties, params: {id}} = req;
      if (properties.id && properties.id !== id) {
        res.status(400).json({error: "ID Mismatch", param: id, property: properties.id});
        return;
      }
      const ent = await collection.put(id, properties);
      res.json(ent);
    });
  }
}
