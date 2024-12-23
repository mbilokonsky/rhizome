import express from "express";
import {HTTP_API_ADDR, HTTP_API_PORT} from "./config";
import {deltasAccepted} from "./deltas";
import {peers} from "./peers";
import {Delta} from "./types";
import {readdirSync, readFileSync} from "fs";
import Debug from "debug";
import {Collection} from "./collection";
import {Converter} from "showdown";
import path from "path";
const debug = Debug('http-api');

type CollectionsToServe = {
  [key: string]: Collection;
};

const docConverter = new Converter({
  simpleLineBreaks: true,
  completeHTMLDocument: true
});
const htmlDocFromMarkdown = (md: string): string => docConverter.makeHtml(md);

export function runHttpApi(collections?: CollectionsToServe) {
  const app = express();
  app.use(express.json());

  // Convert markdown to HTML and serve it
  const mdFiles = readdirSync('./markdown/')
    .filter((f) => f.endsWith('.md'))
    .map((name) => path.parse(name).name);

  debug('mdFiles:', mdFiles);

  app.get('/html', (_req: express.Request, res: express.Response) => {
    let md = `# Files\n\n`;
    for (const name of mdFiles) {
      md += `- [${name}](./${name})\n`;
    }
    const html = htmlDocFromMarkdown(md);
    res.setHeader('content-type', 'text/html').send(html);
  });

  for (const name of mdFiles) {
    const md = readFileSync(`./markdown/${name}.md`).toString();
    const html = htmlDocFromMarkdown(md);
    app.get(`/html/${name}`, (_req: express.Request, res: express.Response) => {
      res.setHeader('content-type', 'text/html').send(html);
    });
  }

  // Set up API routes

  if (collections) {
    for (const [name, collection] of Object.entries(collections)) {
      debug(`collection: ${name}`);

      app.get(`/${name}/ids`, (_req: express.Request, res: express.Response) => {
        res.json({ids: collection.getIds()});
      });

      app.put(`/${name}`, (req: express.Request, res: express.Response) => {
        const {body: properties} = req;
        const ent = collection.put(undefined, properties);
        res.json(ent);
      });

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

  app.get("/deltas/count", (_req: express.Request, res: express.Response) => {
    res.json(deltasAccepted.length);
  });

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

  app.get("/peers/count", (_req: express.Request, res: express.Response) => {
    res.json(peers.length);
  });

  app.listen(HTTP_API_PORT, HTTP_API_ADDR, () => {
    debug(`HTTP API bound to http://${HTTP_API_ADDR}:${HTTP_API_PORT}`);
  });
}
