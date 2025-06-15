import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { RhizomeNode, type RhizomeNodeConfig } from './node';
import { PeerAddress } from './network';
import { BasicCollection } from './collections/collection-basic';

const start = 5000;
const range = 5000;
const getRandomPort = () => Math.floor(start + range * Math.random());

/**
 * Node Orchestration Layer
 * 
 * Provides an abstraction for managing Rhizome nodes across different environments
 * (local, containerized, cloud) with consistent interfaces for lifecycle management,
 * network configuration, and resource allocation.
 */

export interface NodeConfig {
  /** Unique identifier for the node */
  id: string;
  
  /** Network configuration */
  network?: {
    /** Port to listen on (0 = auto-select) */
    port?: number;
    /** Port for request/reply communication */
    requestPort?: number;
    /** Known peers to connect to */
    bootstrapPeers?: string[];
  };
  
  /** Resource constraints */
  resources?: {
    /** CPU shares (0-1024) */
    cpu?: number;
    /** Memory limit in MB */
    memory?: number;
  };
  
  /** Storage configuration */
  storage?: {
    /** Path to data directory */
    path?: string;
    /** Maximum storage in MB */
    limit?: number;
  };
  
  /** Additional configuration options */
  [key: string]: any;
}

export interface NodeStatus {
  id: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  network?: {
    address: string;
    port: number;
    peers: string[];
  };
  resources?: {
    cpu: number;
    memory: {
      used: number;
      total: number;
    };
  };
  error?: string;
}

export interface NodeHandle {
  id: string;
  config: NodeConfig;
  status: () => Promise<NodeStatus>;
  stop: () => Promise<void>;
  /** Get API URL if applicable */
  getApiUrl?: () => string;
  getRequestPort: () => number;
}

export interface NetworkPartition {
  groups: string[][];
}

export interface NodeOrchestrator {
  /** Start a new node with the given configuration */
  startNode(config: NodeConfig): Promise<NodeHandle>;
  
  /** Stop a running node */
  stopNode(handle: NodeHandle): Promise<void>;
  
  /** Get status of a node */
  getNodeStatus(handle: NodeHandle): Promise<NodeStatus>;
  
  /** Connect two nodes */
  connectNodes(node1: NodeHandle, node2: NodeHandle): Promise<void>;
  
  /** Create network partitions */
  partitionNetwork(partitions: NetworkPartition): Promise<void>;
  
  /** Set resource limits for a node */
  setResourceLimits(handle: NodeHandle, limits: NonNullable<Partial<NodeConfig['resources']>>): Promise<void>;
}

/**
 * In-memory implementation of NodeOrchestrator for testing
 */
export class InMemoryOrchestrator implements NodeOrchestrator {
  private nodes: Map<string, { handle: NodeHandle, node: RhizomeNode }> = new Map();
  
  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${Date.now()}`;
    
    // Create RhizomeNode configuration
    const nodeConfig: Partial<RhizomeNodeConfig> = {
      peerId: nodeId,
      httpEnable: true,
      seedPeers: (config.network?.bootstrapPeers || []).map(peer => {
        const [addr, port] = peer.split(':');
        return new PeerAddress(addr, parseInt(port));
      }),
      creator: 'orchestrator',
      publishBindPort: getRandomPort(),
      requestBindPort: getRandomPort(),
      httpPort: getRandomPort(),
    };
    
    // Create and start the RhizomeNode
    const node = new RhizomeNode(nodeConfig);
    
    // Set up basic collections
    const users = new BasicCollection("user");
    users.rhizomeConnect(node);
    
    // Start the node
    await node.start();
    
    const handle: NodeHandle = {
      id: nodeId,
      config: {
        ...config,
        id: nodeId,
      },
      status: async () => ({
        id: nodeId,
        status: 'running',
        network: {
          address: '127.0.0.1',
          port: node.config.httpPort,
          peers: [],
        },
        resources: {
          cpu: config.resources?.cpu || 0,
          memory: {
            used: 0,
            total: config.resources?.memory || 0,
          },
        },
      }),
      stop: async () => {
        await this.stopNode(handle);
      },
      getApiUrl: () => `http://${node.config.httpAddr}:${node.config.httpPort}/api`,
      getRequestPort: () => node.config.requestBindPort,
    };
    
    this.nodes.set(nodeId, { handle, node });
    return handle;
  }
  
  async stopNode(handle: NodeHandle): Promise<void> {
    const nodeData = this.nodes.get(handle.id);
    if (nodeData) {
      await nodeData.node.stop();
      this.nodes.delete(handle.id);
    }
  }
  
  async getNodeStatus(handle: NodeHandle): Promise<NodeStatus> {
    return handle.status();
  }
  
  async connectNodes(node1: NodeHandle, node2: NodeHandle): Promise<void> {
    // In-memory implementation would update peer lists
    // Real implementation would establish network connection
  }
  
  async partitionNetwork(partitions: NetworkPartition): Promise<void> {
    // In-memory implementation would update network topology
  }
  async setResourceLimits(handle: NodeHandle, limits: NonNullable<Partial<NodeConfig['resources']>>): Promise<void> {
    handle.config.resources = {
      ...(handle.config.resources || {}),
      ...(limits.memory !== undefined ? { memory: limits.memory } : {}),
      ...(limits.cpu !== undefined ? { cpu: limits.cpu } : {})
    };
  }
}

/**
 * Docker-based implementation of NodeOrchestrator
 */
export class DockerOrchestrator implements NodeOrchestrator {
  private docker: Docker;
  private containers: Map<string, Docker.Container> = new Map();
  private networks: Map<string, Docker.Network> = new Map();
  private nodeHandles: Map<string, NodeHandle> = new Map();

  constructor() {
    this.docker = new Docker();
  }

  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${uuidv4()}`;
    const port = config.network?.port || 0;
    const networkName = `rhizome-${uuidv4()}`;

    try {
      // Create a Docker network for this node
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        CheckDuplicate: true,
      });
      this.networks.set(nodeId, network);

      // Pull the latest image (you might want to pin to a specific version)
      await new Promise<void>((resolve, reject) => {
        this.docker.pull('node:latest', (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          
          this.docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });

      // Create and start the container
      const container = await this.docker.createContainer({
        Image: 'node:latest',
        name: `rhizome-${nodeId}`,
        Cmd: ['sh', '-c', 'tail -f /dev/null'], // Keep container running
        ExposedPorts: {
          '3000/tcp': {}
        },
        HostConfig: {
          PortBindings: port ? {
            '3000/tcp': [{ HostPort: port.toString() }]
          } : {},
          NetworkMode: networkName,
          Memory: config.resources?.memory ? config.resources.memory * 1024 * 1024 : undefined,
          NanoCpus: config.resources?.cpu ? Math.floor(config.resources.cpu * 1e9) : undefined,
        },
        Env: [
          `NODE_ID=${nodeId}`,
          ...(config.network?.bootstrapPeers ? [`BOOTSTRAP_PEERS=${config.network.bootstrapPeers.join(',')}`] : []),
        ],
      });

      // Start the container and store the container instance
      const startedContainer = await container.start()
        .then(() => container) // Return the container instance after starting
        .catch(err => {
          console.error(`Failed to start container: ${err.message}`);
          throw new Error(`Failed to start container: ${err.message}`);
        });
      
      this.containers.set(nodeId, startedContainer);

      // Get container details
      const inspect = await startedContainer.inspect();
      const networkInfo = inspect.NetworkSettings.Networks[networkName];

      // Generate a random port for request port if not specified
      const requestPort = getRandomPort();
      
      const handle: NodeHandle = {
        id: nodeId,
        config: {
          ...config,
          network: {
            ...config.network,
            requestPort,
          },
        },
        status: async () => {
          const container = this.containers.get(nodeId);
          if (!container) {
            return { id: nodeId, status: 'stopped' };
          }
          
          const inspect = await container.inspect();
          const status: 'running' | 'stopped' | 'error' = 
            inspect.State.Running ? 'running' : 
            inspect.State.ExitCode === 0 ? 'stopped' : 'error';
          
          return {
            id: nodeId,
            status,
            network: {
              address: networkInfo?.IPAddress || '127.0.0.1',
              port: port || 3000,
              requestPort,
              peers: [],
              containerId: container.id,
              networkId: network.id
            },
            resources: {
              cpu: config.resources?.cpu || 0,
              memory: {
                used: inspect.State.Running ? inspect.State.Pid * 1024 * 1024 : 0, // Rough estimate
                total: config.resources?.memory || 0
              }
            },
            getApiUrl: () => `http://${networkInfo?.IPAddress || 'localhost'}:${port || 3000}`,
          };
        },
        stop: async () => {
          await this.stopNode(handle);
        },
        getRequestPort: () => requestPort,
      };

      this.nodeHandles.set(nodeId, handle);
      return handle;
    } catch (error) {
      // Cleanup on error
      await this.cleanupNode(nodeId);
      throw error;
    }
  }

  async stopNode(handle: NodeHandle): Promise<void> {
    await this.cleanupNode(handle.id);
  }

  async getNodeStatus(handle: NodeHandle): Promise<NodeStatus> {
    const nodeHandle = this.nodeHandles.get(handle.id);
    if (!nodeHandle) {
      return { id: handle.id, status: 'stopped' };
    }
    return nodeHandle.status();
  }

  async connectNodes(node1: NodeHandle, node2: NodeHandle): Promise<void> {
    const container1 = this.containers.get(node1.id);
    const container2 = this.containers.get(node2.id);
    
    if (!container1 || !container2) {
      throw new Error('Both nodes must be running to connect them');
    }

    const network1 = this.networks.get(node1.id);
    const network2 = this.networks.get(node2.id);

    if (network1 && network2) {
      // Connect containers to each other's networks
      await network1.connect({ Container: (await container2.inspect()).Id });
      await network2.connect({ Container: (await container1.inspect()).Id });
    }
  }

  async partitionNetwork(partitions: NetworkPartition): Promise<void> {
    // For each partition group, create a new network and connect all containers in the group
    for (const group of partitions.groups) {
      const networkName = `partition-${uuidv4()}`;
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge'
      });

      for (const nodeId of group) {
        const container = this.containers.get(nodeId);
        if (container) {
          await network.connect({ Container: container.id });
        }
      }
    }
  }

  async setResourceLimits(handle: NodeHandle, limits: NonNullable<Partial<NodeConfig['resources']>>): Promise<void> {
    const container = this.containers.get(handle.id);
    if (!container) {
      throw new Error(`Container for node ${handle.id} not found`);
    }

    // Update container resources
    await container.update({
      Memory: limits.memory ? limits.memory * 1024 * 1024 : undefined,
      NanoCPUs: limits.cpu ? limits.cpu * 1e9 : undefined,
    });

    // Update the handle's config
    const nodeHandle = this.nodeHandles.get(handle.id);
    if (nodeHandle) {
      Object.assign(nodeHandle.config.resources ||= {}, limits);
    }
  }

  private async cleanupNode(nodeId: string): Promise<void> {
    const container = this.containers.get(nodeId);
    const network = this.networks.get(nodeId);

    if (container) {
      try {
        await container.stop();
        await container.remove({ force: true });
      } catch (error) {
        console.error(`Error cleaning up container ${nodeId}:`, error);
      }
      this.containers.delete(nodeId);
    }

    if (network) {
      try {
        await network.remove();
      } catch (error) {
        console.error(`Error cleaning up network for ${nodeId}:`, error);
      }
      this.networks.delete(nodeId);
    }

    this.nodeHandles.delete(nodeId);
  }
}

/**
 * Factory function to create an appropriate orchestrator based on environment
 */
export function createOrchestrator(type: 'in-memory' | 'docker' | 'kubernetes' = 'in-memory'): NodeOrchestrator {
  switch (type) {
    case 'in-memory':
      return new InMemoryOrchestrator();
    case 'docker':
      return new DockerOrchestrator();
    case 'kubernetes':
      throw new Error(`Orchestrator type '${type}' not yet implemented`);
    default:
      throw new Error(`Unknown orchestrator type: ${type}`);
  }
}
