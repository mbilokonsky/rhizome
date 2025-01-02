import express, {Router} from "express";
import {RhizomeNode} from "../node";
import {htmlDocFromMarkdown, MDFiles} from "../util/md-files";

export class HttpHtml {
  router = Router();
  mdFiles: MDFiles;

  constructor(readonly rhizomeNode: RhizomeNode) {
    this.mdFiles = new MDFiles(this.rhizomeNode);

    // Serve README
    this.router.get('/README', (_req: express.Request, res: express.Response) => {
      const html = this.mdFiles.getReadmeHTML();
      res.setHeader('content-type', 'text/html').send(html);
    });

    // Serve markdown files as html
    this.router.get('/:name', (req: express.Request, res: express.Response) => {
      const {name} = req.params;
      let html = this.mdFiles.getHtml(name);
      if (!html) {
        res.status(404);
        html = htmlDocFromMarkdown(`# 404 Not Found: ${name}\n\n ## [Index](/html)`);
      }
      res.setHeader('content-type', 'text/html');
      res.send(html);
    });

    // Serve index
    this.router.get('/', (_req: express.Request, res: express.Response) => {
      res.setHeader('content-type', 'text/html').send(this.mdFiles.indexHtml);
    });
  }

  start() {
    // Scan and watch for markdown files
    this.mdFiles.readDir();
    this.mdFiles.readReadme();
    this.mdFiles.watchDir();
    this.mdFiles.watchReadme();
  }

  stop() {
    this.mdFiles.stop();
  }
}
