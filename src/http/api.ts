import Debug from 'debug';
import express, {Router} from "express";
import {Collection} from "../collections";
import {Delta, DeltaFilter} from "../core";
import {RhizomeNode} from "../node";

const debug = Debug('rz:http:api');

export class HttpApi {
  router = Router();

  constructor(readonly rhizomeNode: RhizomeNode) {
    this.setupRoutes();
  }

  private setupRoutes() {
    // --------------- health ----------------

    this.router.get("/health", (_req: express.Request, res: express.Response) => {
      res.json({
        status: "ok"
      });
    });

    // --------------- deltas ----------------

    // Serve list of all deltas accepted
    // TODO: This won't scale well
    this.router.get("/deltas", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted);
    });

    this.router.get("/delta/ids", (_req: express.Request, res: express.Response) => {
      res.json({
        ids: this.rhizomeNode.deltaStream.deltasAccepted.map(({id}) => id)
      });
    });

    // Get the number of deltas ingested by this node
    this.router.get("/deltas/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted.length);
    });

    // --------------- peers ----------------

    // Get the list of peers seen by this node (including itself)
    this.router.get("/peers", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.peers.peers.map(
        ({reqAddr, publishAddr, isSelf, isSeedPeer}) => {
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

    // Initialize hyperview and query endpoints
    this.serveHyperview();
    this.serveQuery();
  }

  // serveCollection<T extends Collection>(collection: T) {
  serveCollection<View>(collection: Collection<View>) {
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

  serveHyperview() {
    // Get all domain entity IDs. TODO: This won't scale
    this.router.get('/hyperview/ids', (_req: express.Request, res: express.Response) => {
      res.json({
        ids: Array.from(this.rhizomeNode.hyperview.domainEntities.keys())
      });
    });

    // Get all transaction IDs. TODO: This won't scale
    this.router.get('/transaction/ids', (_req: express.Request, res: express.Response) => {
      const set = this.rhizomeNode.hyperview.referencedAs.get("_transaction");
      res.json({
        ids: set ? Array.from(set.values()) : []
      });
    });

    // View a single transaction
    this.router.get('/transaction/:id', (req: express.Request, res: express.Response) => {
      const {params: {id}} = req;
      const v = this.rhizomeNode.hyperview.compose([id]);
      const ent = v[id];
      if (!ent.referencedAs?.includes("_transaction")) {
        res.status(400).json({error: "Entity is not a transaction", id});
        return;
      }

      res.json({
        ...ent,
        isComplete: this.rhizomeNode.hyperview.transactions.isComplete(id)
      });
    });

    // Get a hyperview view of a single domain entity
    this.router.get('/hyperview/:id', (req: express.Request, res: express.Response) => {
      const {params: {id}} = req;
      const v = this.rhizomeNode.hyperview.compose([id]);
      const ent = v[id];

      res.json({
        ...ent,
        isComplete: this.rhizomeNode.hyperview.transactions.isComplete(id)
      });
    });
  }

  serveQuery() {
    // Query entities by schema with optional JSON Logic filter
    this.router.post('/query/:schemaId', async (req: express.Request, res: express.Response) => {
      try {
        const { schemaId } = req.params;
        const { filter, maxResults, deltaFilter } = req.body;
        
        const options: { maxResults?: number; deltaFilter?: DeltaFilter } = {};
        if (maxResults) options.maxResults = maxResults;
        if (deltaFilter) {
          // Note: deltaFilter would need to be serialized/deserialized properly in a real implementation
          debug('deltaFilter not supported in HTTP API yet');
        }

        const result = await this.rhizomeNode.queryEngine.query(schemaId, filter, options);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get a single entity by ID with schema validation
    this.router.get('/query/:schemaId/:entityId', async (req: express.Request, res: express.Response) => {
      try {
        const { schemaId, entityId } = req.params;
        
        const result = await this.rhizomeNode.queryEngine.queryOne(schemaId, entityId);
        
        if (result) {
          res.json({
            success: true,
            data: result
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Entity not found or does not match schema'
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get query engine statistics
    this.router.get('/query/stats', (_req: express.Request, res: express.Response) => {
      try {
        const stats = this.rhizomeNode.queryEngine.getStats();
        res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // List all registered schemas
    this.router.get('/schemas', (_req: express.Request, res: express.Response) => {
      try {
        const schemas = this.rhizomeNode.schemaRegistry.list();
        res.json({
          success: true,
          data: schemas
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get a specific schema
    this.router.get('/schemas/:schemaId', (req: express.Request, res: express.Response) => {
      try {
        const { schemaId } = req.params;
        const schema = this.rhizomeNode.schemaRegistry.get(schemaId);
        
        if (schema) {
          res.json({
            success: true,
            data: schema
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Schema not found'
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
}
