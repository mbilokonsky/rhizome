import Debug from "debug";
import express, {Express, Router} from "express";
import {Server} from "http";
import {Collection} from "./collection";
import {RhizomeNode} from "./node";
import {Delta} from "./types";
import {htmlDocFromMarkdown, MDFiles} from "./util/md-files";
const debug = Debug('http-api');

export class HttpApi {
  rhizomeNode: RhizomeNode;
  app: Express;
  router: Router;
  mdFiles = new MDFiles();
  server?: Server;

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    this.app = express();
    this.router = Router();

    this.app.use(express.json());
    this.app.use(this.router);
  }

  start() {
    // Scan and watch for markdown files
    this.mdFiles.readDir();
    this.mdFiles.readReadme();
    this.mdFiles.watchDir();
    this.mdFiles.watchReadme();

    // Serve README
    this.router.get('/html/README', (_req: express.Request, res: express.Response) => {
      const html = this.mdFiles.getReadmeHTML();
      res.setHeader('content-type', 'text/html').send(html);
    });

    // Serve markdown files as html
    this.router.get('/html/:name', (req: express.Request, res: express.Response) => {
      let html = this.mdFiles.getHtml(req.params.name);
      if (!html) {
        res.status(404);
        html = htmlDocFromMarkdown('# 404\n\n## [Index](/html)');
      }
      res.setHeader('content-type', 'text/html');
      res.send(html);
    });

    // Serve index
    {
      let md = `# Files\n\n`;
      md += `[README](/html/README)\n\n`;
      for (const name of this.mdFiles.list()) {
        md += `- [${name}](./${name})\n`;
      }
      const html = htmlDocFromMarkdown(md);

      this.router.get('/html', (_req: express.Request, res: express.Response) => {
        res.setHeader('content-type', 'text/html').send(html);
      });
    }

    // Serve list of all deltas accepted
    // TODO: This won't scale well
    this.router.get("/deltas", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted);
    });

    // Get the number of deltas ingested by this node
    this.router.get("/deltas/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted.length);
    });

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

    const {httpAddr, httpPort} = this.rhizomeNode.config;
    this.server = this.app.listen({
      port: httpPort,
      host: httpAddr,
      exclusive: true
    }, () => {
      debug(`HTTP API bound to ${httpAddr}:${httpPort}`);
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
      const ent = collection.get(id);
      if (!ent) {
        res.status(404).send({error: "Not Found"});
        return;
      }
      res.json(ent);
    });

    // Add a new domain entity
    // TODO: schema validation
    this.router.put(`/${name}`, (req: express.Request, res: express.Response) => {
      const {body: {id, properties}} = req;
      const ent = collection.put(id, properties);
      res.json(ent);
    });

    // Update a domain entity
    this.router.put(`/${name}/:id`, (req: express.Request, res: express.Response) => {
      const {body: properties, params: {id}} = req;
      if (properties.id && properties.id !== id) {
        res.status(400).json({error: "ID Mismatch", param: id, property: properties.id});
        return;
      }
      const ent = collection.put(id, properties);
      res.json(ent);
    });
  }

  async stop() {
    this.server?.close();
    this.mdFiles.close();
  }
}
