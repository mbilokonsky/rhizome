import Debug from "debug";
import express from "express";
import {FSWatcher} from "fs";
import {readdirSync, readFileSync, watch} from "fs";
import {Server} from "http";
import path, {join} from "path";
import {Converter} from "showdown";
import {Collection} from "./collection";
import {RhizomeNode} from "./node";
import {Delta} from "./types";
const debug = Debug('http-api');

const docConverter = new Converter({
  completeHTMLDocument: true,
  // simpleLineBreaks: true,
  tables: true,
  tasklists: true
});

const htmlDocFromMarkdown = (md: string): string => docConverter.makeHtml(md);

type mdFileInfo = {
  name: string,
  md: string,
  html: string
};

class MDFiles {
  files = new Map<string, mdFileInfo>();
  readme?: mdFileInfo;
  dirWatcher?: FSWatcher;
  readmeWatcher?: FSWatcher;

  readFile(name: string) {
    const md = readFileSync(join('./markdown', `${name}.md`)).toString();
    const html = htmlDocFromMarkdown(md);
    this.files.set(name, {name, md, html});
  }

  readReadme() {
    const md = readFileSync('./README.md').toString();
    const html = htmlDocFromMarkdown(md);
    this.readme = {name: 'README', md, html};
  }

  getReadmeHTML() {
    return this.readme?.html;
  }

  getHtml(name: string): string | undefined {
    return this.files.get(name)?.html;
  }

  list(): string[] {
    return Array.from(this.files.keys());
  }

  readDir() {
    // Read list of markdown files from directory and
    // render each markdown file as html
    readdirSync('./markdown/')
      .filter((f) => f.endsWith('.md'))
      .map((name) => path.parse(name).name)
      .forEach((name) => this.readFile(name));
  }

  watchDir() {
    this.dirWatcher = watch('./markdown', null, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".md")) return;

      const name = path.parse(filename).name;

      switch (eventType) {
        case 'rename': {
          debug(`file ${name} renamed`);
          // Remove it from memory and re-scan everything
          this.files.delete(name);
          this.readDir();
          break;
        }
        case 'change': {
          debug(`file ${name} changed`);
          // Re-read this file
          this.readFile(name)
          break;
        }
      }
    });
  }

  watchReadme() {
   this.readmeWatcher = watch('./README.md', null, (eventType, filename) => {
      if (!filename) return;

      switch (eventType) {
        case 'change': {
          debug(`README file changed`);
          // Re-read this file
          this.readReadme()
          break;
        }
      }
    });
  }

  close() {
    this.dirWatcher?.close();
    this.readmeWatcher?.close();
  }
}

export class HttpApi {
  rhizomeNode: RhizomeNode;
  app = express();
  mdFiles = new MDFiles();
  server?: Server;

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    this.app.use(express.json());
  }

  start() {
    // Scan and watch for markdown files
    this.mdFiles.readDir();
    this.mdFiles.readReadme();
    this.mdFiles.watchDir();
    this.mdFiles.watchReadme();

    // Serve README
    this.app.get('/html/README', (_req: express.Request, res: express.Response) => {
      const html = this.mdFiles.getReadmeHTML();
      res.setHeader('content-type', 'text/html').send(html);
    });

    // Serve markdown files as html
    this.app.get('/html/:name', (req: express.Request, res: express.Response) => {
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

      this.app.get('/html', (_req: express.Request, res: express.Response) => {
        res.setHeader('content-type', 'text/html').send(html);
      });
    }

    // Serve list of all deltas accepted
    // TODO: This won't scale well
    this.app.get("/deltas", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted);
    });

    // Get the number of deltas ingested by this node
    this.app.get("/deltas/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.deltaStream.deltasAccepted.length);
    });

    // Get the list of peers seen by this node (including itself)
    this.app.get("/peers", (_req: express.Request, res: express.Response) => {
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
    this.app.get("/peers/count", (_req: express.Request, res: express.Response) => {
      res.json(this.rhizomeNode.peers.peers.length);
    });

    const {httpAddr, httpPort} = this.rhizomeNode.config;
    this.server = this.app.listen(httpPort, httpAddr, () => {
      debug(`HTTP API bound to ${httpAddr}:${httpPort}`);
    });
  }

  serveCollection(collection: Collection) {
    const {name} = collection;

    // Get the ID of all domain entities
    this.app.get(`/${name}/ids`, (_req: express.Request, res: express.Response) => {
      res.json({ids: collection.getIds()});
    });

    // Get a single domain entity by ID
    this.app.get(`/${name}/:id`, (req: express.Request, res: express.Response) => {
      const {params: {id}} = req;
      const ent = collection.get(id);
      res.json(ent);
    });

    // Add a new domain entity
    // TODO: schema validation
    this.app.put(`/${name}`, (req: express.Request, res: express.Response) => {
      const {body: properties} = req;
      const ent = collection.put(properties.id, properties);
      res.json(ent);
    });

    // Update a domain entity
    this.app.put(`/${name}/:id`, (req: express.Request, res: express.Response) => {
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
