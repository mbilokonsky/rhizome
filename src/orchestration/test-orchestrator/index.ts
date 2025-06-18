import { RhizomeNode, type RhizomeNodeConfig } from '../../node';
import { PeerAddress } from '../../network';
import { BaseOrchestrator } from '../base-orchestrator';
import { NodeConfig, NodeHandle, NodeStatus, NetworkPartition } from '../types';

/**
 * In-memory implementation of NodeOrchestrator for testing
 */
export class TestOrchestrator extends BaseOrchestrator {
  private nodes: Map<string, { handle: NodeHandle; node: RhizomeNode }> = new Map();

  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${Date.now()}`;
    const httpPort = config.network?.port || 0; // 0 = auto-select port
    const requestPort = config.network?.requestPort || 0;
    
    // Map NodeConfig to RhizomeNodeConfig with all required properties
    const nodeConfig: RhizomeNodeConfig = {
      // Required network properties
      requestBindAddr: '0.0.0.0',
      requestBindHost: '0.0.0.0',
      requestBindPort: requestPort,
      publishBindAddr: '0.0.0.0',
      publishBindHost: '0.0.0.0',
      publishBindPort: 0, // Auto-select port
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

    await node.start();

    const handle: NodeHandle = {
      id: nodeId,
      config: {
        ...config,
        id: nodeId,
        network: {
          ...config.network,
          port: httpPort,
          requestPort: requestPort,
        },
      },
      status: async () => this.getNodeStatus({ id: nodeId } as NodeHandle),
      stop: async () => {
        await node.stop();
        this.nodes.delete(nodeId);
      },
      getRequestPort: () => config.network?.requestPort || 0,
      getApiUrl: () => `http://localhost:${httpPort}/api`,
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
    console.log(`Connecting nodes ${node1.id} and ${node2.id}`);
  }

  async partitionNetwork(partitions: NetworkPartition): Promise<void> {
    // In a real implementation, we would create network partitions
    // For testing, we'll just log the partition attempt
    console.log('Creating network partitions:', partitions);
  }

  async setResourceLimits(
    handle: NodeHandle,
    limits: Partial<NodeConfig['resources']>
  ): Promise<void> {
    // In-memory nodes don't have real resource limits
    console.log(`Setting resource limits for ${handle.id}:`, limits);
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
