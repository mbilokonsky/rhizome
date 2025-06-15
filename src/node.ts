import Debug from 'debug';
import {CREATOR, HTTP_API_ADDR, HTTP_API_ENABLE, HTTP_API_PORT, PEER_ID, PUBLISH_BIND_ADDR, PUBLISH_BIND_HOST, PUBLISH_BIND_PORT, REQUEST_BIND_ADDR, REQUEST_BIND_HOST, REQUEST_BIND_PORT, SEED_PEERS, STORAGE_TYPE, STORAGE_PATH} from './config';
import {DeltaStream, parseAddressList, PeerAddress, Peers, PubSub, RequestReply} from './network';
import {HttpServer} from './http/index';
import {Lossless} from './views';
import {QueryEngine, StorageQueryEngine} from './query';
import {DefaultSchemaRegistry} from './schema';
import {DeltaQueryStorage, StorageFactory, StorageConfig} from './storage';
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
  storage?: StorageConfig; // Optional storage configuration
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
  storageQueryEngine: StorageQueryEngine;
  schemaRegistry: DefaultSchemaRegistry;
  deltaStorage: DeltaQueryStorage;
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
      storage: {
        type: STORAGE_TYPE as 'memory' | 'leveldb',
        path: STORAGE_PATH
      },
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
    
    // Initialize storage backend
    this.deltaStorage = StorageFactory.create(this.config.storage!);
    
    // Initialize query engines (both lossless-based and storage-based)
    this.queryEngine = new QueryEngine(this.lossless, this.schemaRegistry);
    this.storageQueryEngine = new StorageQueryEngine(this.deltaStorage, this.schemaRegistry);
  }

  async start(syncOnStart = false) {
    // Connect our lossless view to the delta stream
    this.deltaStream.subscribeDeltas(async (delta) => {
      // Ingest into lossless view
      this.lossless.ingestDelta(delta);
      
      // Also store in persistent storage
      try {
        await this.deltaStorage.storeDelta(delta);
      } catch (error) {
        debug(`[${this.config.peerId}]`, 'Error storing delta to persistent storage:', error);
      }
    });

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
    
    // Close storage
    try {
      await this.deltaStorage.close();
      debug(`[${this.config.peerId}]`, 'Storage closed');
    } catch (error) {
      debug(`[${this.config.peerId}]`, 'Error closing storage:', error);
    }
    
    debug(`[${this.config.peerId}]`, 'Stopped');
  }

  /**
   * Sync existing lossless view data to persistent storage
   * Useful for migrating from memory-only to persistent storage
   */
  async syncToStorage(): Promise<void> {
    debug(`[${this.config.peerId}]`, 'Syncing lossless view to storage');
    
    const allDeltas = this.deltaStream.deltasAccepted;
    let synced = 0;
    
    for (const delta of allDeltas) {
      try {
        await this.deltaStorage.storeDelta(delta);
        synced++;
      } catch (error) {
        debug(`[${this.config.peerId}]`, `Error syncing delta ${delta.id}:`, error);
      }
    }
    
    debug(`[${this.config.peerId}]`, `Synced ${synced}/${allDeltas.length} deltas to storage`);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    return await this.deltaStorage.getStats();
  }
}
