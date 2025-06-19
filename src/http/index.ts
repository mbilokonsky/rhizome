import Debug from "debug";
import express from "express";
import {Server} from "http";
import {RhizomeNode} from "../node";
import {HttpApi} from "./api";
import {HttpHtml} from "./html";
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

  /**
   * Start the HTTP server
   */
  start() {
    const {httpAddr, httpPort} = this.rhizomeNode.config;
    debug(`[${this.rhizomeNode.config.peerId}]`, `Starting HTTP server on ${httpAddr}:${httpPort}...`);
    
    try {
      this.httpHtml.start();
      
      // Create the server
      this.server = this.app.listen({
        port: httpPort,
        host: httpAddr,
        exclusive: true
      });
      
      // Add error handler
      this.server.on('error', (error) => {
        debug(`[${this.rhizomeNode.config.peerId}]`, `HTTP server error:`, error);
      });
      
      // Add callback for logging
      this.server.on('listening', () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'string' ? httpPort : address?.port;
        debug(`[${this.rhizomeNode.config.peerId}]`, `HTTP server bound to ${httpAddr}:${actualPort}`);
      });
      
      debug(`[${this.rhizomeNode.config.peerId}]`, 'HTTP server start initiated');
    } catch (error) {
      debug(`[${this.rhizomeNode.config.peerId}]`, 'Error starting HTTP server:', error);
      throw error;
    }
  }

  /**
   * Start the HTTP server and return a promise that resolves when the server is listening
   */
  async startAndWait(): Promise<void> {
    // If server is already listening, resolve immediately
    if (this.server?.listening) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`HTTP server failed to start within 10 seconds`));
      }, 10000);

      const onListening = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.server?.off('listening', onListening);
        this.server?.off('error', onError);
      };

      // Start the server if not already started
      if (!this.server) {
        this.start();
      }

      // Add event listeners
      this.server?.on('listening', onListening);
      this.server?.on('error', onError);
    });
  }

  async stop() {
    this.server?.close();
    this.httpHtml.stop();
  }
}
