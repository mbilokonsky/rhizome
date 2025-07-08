import { RhizomeNode, type RhizomeNodeConfig } from '../../node';
import { PeerAddress } from '../../network';
import { BaseOrchestrator } from '../base-orchestrator';
import { NodeConfig, NodeHandle, NodeStatus, NetworkPartition } from '../types';
import { getRandomPort } from '../docker-orchestrator/utils/port-utils';
import { BasicCollection } from '../../collections/collection-basic';
import Debug from 'debug';

const debug = Debug('rz:test-orchestrator');

/**
 * In-memory implementation of NodeOrchestrator for testing
 */
export class TestOrchestrator extends BaseOrchestrator {
  private nodes: Map<string, { handle: NodeHandle; node: RhizomeNode }> = new Map();

  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${Date.now()}`;
    // Use getRandomPort instead of 0 for auto-selection
    const httpPort = config.network?.port || getRandomPort();
    const requestPort = config.network?.requestPort || getRandomPort();
    
    // Map NodeConfig to RhizomeNodeConfig with all required properties
    const nodeConfig: RhizomeNodeConfig = {
      // Required network properties
      requestBindHost: '0.0.0.0',
      requestBindPort: requestPort,
      publishBindHost: '0.0.0.0',
      publishBindPort: getRandomPort(), // Use a random port for publish socket
      httpAddr: '0.0.0.0',
      httpPort: httpPort,
      httpEnable: true,
      
      // Required peer properties
      peerId: nodeId,
      creator: 'test-orchestrator',
      
      // Map network bootstrap peers to seedPeers if provided
      seedPeers: config.network?.bootstrapPeers?.map(peer => {
        const [host, port] = peer.split(':');
        return new PeerAddress(host, parseInt(port));
      }) || [],
      
      // Storage configuration with defaults
      storage: {
        type: 'memory',
        path: config.storage?.path || `./data/${nodeId}`,
        ...(config.storage || {})
      }
    };

    const node = new RhizomeNode(nodeConfig);
    
    // Create and connect a user collection
    const userCollection = new BasicCollection('user');
    // Connect the collection to the node before serving it
    userCollection.rhizomeConnect(node);
    // Now serve the collection through the HTTP API
    node.httpServer.httpApi.serveCollection(userCollection);
    
    // Start the node and wait for all components to be ready
    debug(`[${nodeId}] Starting node and waiting for it to be fully ready...`);
    try {
      await node.start();
      debug(`[${nodeId}] Node is fully started and ready`);
    } catch (error) {
      debug(`[${nodeId}] Error starting node:`, error);
      throw error;
    }

    // Get the actual port the server is using
    const serverAddress = node.httpServer.server?.address();
    let actualPort = httpPort;
    
    // Handle different address types (string or AddressInfo)
    if (serverAddress) {
      actualPort = typeof serverAddress === 'string' 
        ? httpPort 
        : serverAddress.port || httpPort;
    }
    
    const handle: NodeHandle = {
      id: nodeId,
      config: {
        ...config,
        id: nodeId,
        network: {
          ...config.network,
          port: actualPort,
          requestPort: requestPort
        }
      },
      status: async () => this.getNodeStatus(handle),
      getApiUrl: () => `http://localhost:${actualPort}/api`,
      stop: async () => {
        await node.stop();
        this.nodes.delete(nodeId);
      },
      getRequestPort: () => requestPort,
    };

    this.nodes.set(nodeId, { handle, node });
    return handle;
  }

  async stopNode(handle: NodeHandle): Promise<void> {
    const node = this.nodes.get(handle.id);
    if (node) {
      await node.node.stop();
      this.nodes.delete(handle.id);
    }
  }

  async getNodeStatus(handle: NodeHandle): Promise<NodeStatus> {
    const node = this.nodes.get(handle.id);
    if (!node) {
      return {
        id: handle.id,
        status: 'stopped',
        error: 'Node not found',
        network: {
          address: '127.0.0.1',
          httpPort: 0,
          requestPort: 0,
          peers: []
        },
        resources: {
          cpu: { usage: 0, limit: 0 },
          memory: { usage: 0, limit: 0 }
        }
      };
    }


    // Since we don't have a direct way to check if the node is running,
    // we'll assume it's running if it's in our nodes map
    // In a real implementation, we would check the actual node state
    const status: NodeStatus = {
      id: handle.id,
      status: 'running',
      network: {
        address: '127.0.0.1',
        httpPort: node.node.config.httpPort || 0,
        requestPort: node.node.config.requestBindPort || 0,
        peers: node.node.peers ? Array.from(node.node.peers.peers).map(p => p.reqAddr.toAddrString()) : []
      },
      resources: {
        cpu: {
          usage: 0,
          limit: 0,
        },
        memory: {
          usage: 0,
          limit: 0,
        },
      }
    };

    return status;
  }

  async connectNodes(node1: NodeHandle, node2: NodeHandle): Promise<void> {
    const n1 = this.nodes.get(node1.id)?.node;
    const n2 = this.nodes.get(node2.id)?.node;

    if (!n1 || !n2) {
      throw new Error('One or both nodes not found');
    }

    // In a real implementation, we would connect the nodes here
    // For testing, we'll just log the connection attempt
  }

  async partitionNetwork(partitions: NetworkPartition): Promise<void> {
    // In a real implementation, we would create network partitions
    // For testing, we'll just log the partition attempt
  }

  async setResourceLimits(
    handle: NodeHandle,
    limits: Partial<NodeConfig['resources']>
  ): Promise<void> {
    // In-memory nodes don't have real resource limits
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      Array.from(this.nodes.values()).map(({ node }) => node.stop())
    );
    this.nodes.clear();
  }
}
