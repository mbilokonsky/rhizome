import Debug from 'debug';
import {CREATOR, HTTP_API_ADDR, HTTP_API_ENABLE, HTTP_API_PORT, PEER_ID, PUBLISH_BIND_ADDR, PUBLISH_BIND_HOST, PUBLISH_BIND_PORT, REQUEST_BIND_ADDR, REQUEST_BIND_HOST, REQUEST_BIND_PORT, SEED_PEERS} from './config';
import {DeltaStream} from './delta-stream';
import {HttpServer} from './http/index';
import {Lossless} from './lossless';
import {parseAddressList, PeerAddress, Peers} from './peers';
import {PubSub} from './pub-sub';
import {RequestReply} from './request-reply';
import {QueryEngine} from './query-engine';
import {DefaultSchemaRegistry} from './schema-registry';
const debug = Debug('rz:rhizome-node');

export type RhizomeNodeConfig = {
  requestBindAddr: string;
  requestBindHost: string;
  requestBindPort: number;
  publishBindAddr: string;
  publishBindHost: string;
  publishBindPort: number;
  httpAddr: string;
  httpPort: number;
  httpEnable: boolean;
  seedPeers: PeerAddress[];
  peerId: string;
  creator: string; // TODO each host should be able to support multiple users
};

// So that we can run more than one instance in the same process (for testing)
export class RhizomeNode {
  config: RhizomeNodeConfig;
  pubSub: PubSub;
  requestReply: RequestReply;
  httpServer: HttpServer;
  deltaStream: DeltaStream;
  lossless: Lossless;
  peers: Peers;
  queryEngine: QueryEngine;
  schemaRegistry: DefaultSchemaRegistry;
  myRequestAddr: PeerAddress;
  myPublishAddr: PeerAddress;

  constructor(config?: Partial<RhizomeNodeConfig>) {
    this.config = {
      requestBindAddr: REQUEST_BIND_ADDR,
      requestBindHost: REQUEST_BIND_HOST,
      requestBindPort: REQUEST_BIND_PORT,
      publishBindAddr: PUBLISH_BIND_ADDR,
      publishBindHost: PUBLISH_BIND_HOST,
      publishBindPort: PUBLISH_BIND_PORT,
      httpAddr: HTTP_API_ADDR,
      httpPort: HTTP_API_PORT,
      httpEnable: HTTP_API_ENABLE,
      seedPeers: parseAddressList(SEED_PEERS),
      peerId: PEER_ID,
      creator: CREATOR,
      ...config
    };
    debug(`[${this.config.peerId}]`, 'Config', this.config);
    this.myRequestAddr = new PeerAddress(
      this.config.requestBindHost,
      this.config.requestBindPort
    );
    this.myPublishAddr = new PeerAddress(
      this.config.publishBindHost,
      this.config.publishBindPort
    );
    this.pubSub = new PubSub(this);
    this.requestReply = new RequestReply(this);
    this.httpServer = new HttpServer(this);
    this.deltaStream = new DeltaStream(this);
    this.peers = new Peers(this);
    this.lossless = new Lossless(this);
    this.schemaRegistry = new DefaultSchemaRegistry();
    this.queryEngine = new QueryEngine(this.lossless, this.schemaRegistry);
  }

  async start(syncOnStart = false) {
    // Connect our lossless view to the delta stream
    this.deltaStream.subscribeDeltas((delta) => this.lossless.ingestDelta(delta));

    // Bind ZeroMQ publish socket
    // TODO: Config option to enable zmq pubsub
    await this.pubSub.startZmq();

    // Bind ZeroMQ request socket
    // TODO: request/reply via libp2p?
    // TODO: config options to enable request/reply, or configure available commands
    this.requestReply.start();

    // Start HTTP server
    if (this.config.httpEnable) {
      this.httpServer.start();
    }

    {
      // Wait a short time for sockets to initialize
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Subscribe to seed peers
      this.peers.subscribeToSeeds();

      // Wait a short time for sockets to initialize
      // await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (syncOnStart) {
      // Ask all peers for all deltas
      this.peers.askAllPeersForDeltas();

      // Wait to receive all deltas
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async stop() {
    this.peers.stop();
    await this.pubSub.stop();
    await this.requestReply.stop();
    await this.httpServer.stop();
    debug(`[${this.config.peerId}]`, 'Stopped');
  }
}
