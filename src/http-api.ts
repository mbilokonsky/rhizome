import Debug from "debug";
import express from "express";
import {readdirSync, readFileSync, watch} from "fs";
import path, {join} from "path";
import {Converter} from "showdown";
import {Collection} from "./collection";
import {HTTP_API_ADDR, HTTP_API_PORT} from "./config";
import {deltasAccepted} from "./deltas";
import {peers} from "./peers";
import {Delta} from "./types";
const debug = Debug('http-api');

type CollectionsToServe = {
  [key: string]: Collection;
};

const docConverter = new Converter({
  simpleLineBreaks: true,
  completeHTMLDocument: true
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
    watch('./markdown', null, (eventType, filename) => {
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
    watch('./README.md', null, (eventType, filename) => {
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
}

export function runHttpApi(collections?: CollectionsToServe) {
  const app = express();
  app.use(express.json());

  // Get list of markdown files
  const mdFiles = new MDFiles();
  mdFiles.readDir();
  mdFiles.readReadme();
  mdFiles.watchDir();
  mdFiles.watchReadme();

  // Serve README
  app.get('/html/README', (_req: express.Request, res: express.Response) => {
    const html = mdFiles.getReadmeHTML();
    res.setHeader('content-type', 'text/html').send(html);
  });

  // Serve markdown files as html
  app.get('/html/:name', (req: express.Request, res: express.Response) => {
    let html = mdFiles.getHtml(req.params.name);
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
    for (const name of mdFiles.list()) {
      md += `- [${name}](./${name})\n`;
    }
    const html = htmlDocFromMarkdown(md);

    app.get('/html', (_req: express.Request, res: express.Response) => {
      res.setHeader('content-type', 'text/html').send(html);
    });
  }

  // Set up API routes

  if (collections) {
    for (const [name, collection] of Object.entries(collections)) {
      debug(`collection: ${name}`);

      // Get the ID of all domain entities
      app.get(`/${name}/ids`, (_req: express.Request, res: express.Response) => {
        res.json({ids: collection.getIds()});
      });

      // Add a new domain entity
      // TODO: schema validation
      app.put(`/${name}`, (req: express.Request, res: express.Response) => {
        const {body: properties} = req;
        const ent = collection.put(undefined, properties);
        res.json(ent);
      });

      // Update a domain entity
      app.put(`/${name}/:id`, (req: express.Request, res: express.Response) => {
        const {body: properties, params: {id}} = req;
        if (properties.id && properties.id !== id) {
          res.status(400).json({error: "ID Mismatch", param: id, property: properties.id});
          return;
        }
        const ent = collection.put(id, properties);
        res.json(ent);
      });
    }
  }

  app.get("/deltas", (_req: express.Request, res: express.Response) => {
    // TODO: streaming
    res.json(deltasAccepted);
  });

  // Get the number of deltas ingested by this node
  app.get("/deltas/count", (_req: express.Request, res: express.Response) => {
    res.json(deltasAccepted.length);
  });

  // Get the list of peers seen by this node (including itself)
  app.get("/peers", (_req: express.Request, res: express.Response) => {
    res.json(peers.map(({reqAddr, publishAddr, isSelf, isSeedPeer}) => {
      const deltasAcceptedCount = deltasAccepted
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
  app.get("/peers/count", (_req: express.Request, res: express.Response) => {
    res.json(peers.length);
  });

  app.listen(HTTP_API_PORT, HTTP_API_ADDR, () => {
    debug(`HTTP API bound to http://${HTTP_API_ADDR}:${HTTP_API_PORT}`);
  });
}
