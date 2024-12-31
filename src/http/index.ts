import Debug from "debug";
import express from "express";
import {Server} from "http";
import {RhizomeNode} from "../node.js";
import {HttpApi} from "./api.js";
import {HttpHtml} from "./html.js";
const debug = Debug('rz:http-api');

export class HttpServer {
  app = express();
  httpHtml: HttpHtml;
  httpApi: HttpApi;
  server?: Server;

  constructor(readonly rhizomeNode: RhizomeNode) {
    this.httpHtml = new HttpHtml(this.rhizomeNode);
    this.httpApi = new HttpApi(this.rhizomeNode);

    this.app.use(express.json());
    this.app.use('/html', this.httpHtml.router);
    this.app.use('/api', this.httpApi.router);
  }

  start() {
    const {httpAddr, httpPort} = this.rhizomeNode.config;
    this.server = this.app.listen({
      port: httpPort,
      host: httpAddr,
      exclusive: true
    }, () => {
      debug(`[${this.rhizomeNode.config.peerId}]`, `HTTP API bound to ${httpAddr}:${httpPort}`);
    });
  }

  async stop() {
    this.server?.close();
    this.httpHtml.close();
  }
}
