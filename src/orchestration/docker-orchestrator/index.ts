import { Container, Network } from 'dockerode';
import { BaseOrchestrator } from '../base-orchestrator';
import { NodeConfig, NodeHandle, NodeStatus, NetworkPartition } from '../types';
import { DockerNodeHandle, DockerOrchestratorOptions } from './types';
import { ContainerManager } from './managers/container-manager';
import { NetworkManager } from './managers/network-manager';
import { ResourceManager } from './managers/resource-manager';
import { StatusManager } from './managers/status-manager';
import { ImageManager } from './managers/image-manager';
import { getRandomPort } from './utils/port-utils';
import Debug from 'debug';

const debug = Debug('rz:docker:orchestrator');

const DEFAULT_OPTIONS: DockerOrchestratorOptions = {
  image: 'rhizome-node-test',
  containerWorkDir: '/app',
  autoBuildTestImage: true,
};

export class DockerOrchestrator extends BaseOrchestrator {
  private options: DockerOrchestratorOptions;
  private containers: Map<string, Container> = new Map();
  private networks: Map<string, Network> = new Map();
  private containerLogStreams: Map<string, NodeJS.ReadableStream> = new Map();
  private nodeHandles: Map<string, DockerNodeHandle> = new Map();
  
  // Managers
  // Visible for testing
  readonly containerManager: ContainerManager;
  private readonly networkManager: NetworkManager;
  private readonly resourceManager: ResourceManager;
  private readonly statusManager: StatusManager;
  private readonly imageManager: ImageManager;

  constructor(options: Partial<DockerOrchestratorOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    // Initialize managers
    this.containerManager = new ContainerManager();
    this.networkManager = new NetworkManager();
    this.resourceManager = new ResourceManager();
    this.statusManager = new StatusManager();
    this.imageManager = new ImageManager();
  }

  /**
   * Start a new node with the given configuration
   */
  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${Date.now()}`;
    config.network = config.network || {};
    config.network.port = config.network.port || getRandomPort();
    config.network.requestPort = config.network.requestPort || getRandomPort();

    try {
      // Ensure test image is built
      if (this.options.autoBuildTestImage) {
        await this.imageManager.buildTestImage(this.options.image);
      }
      
      // Create a network for this node using NetworkManager
      const network = await this.networkManager.createNetwork(nodeId);
      this.networks.set(nodeId, network);
      
      // Create container using ContainerManager
      const container = await this.containerManager.createContainer(
        nodeId,
        config,
        network.id
      );

      // Store container reference before starting it
      this.containers.set(nodeId, container);

      // Start the container
      await this.containerManager.startContainer(container);

      // Create node handle
      const handle: DockerNodeHandle = {
        id: nodeId,
        containerId: container.id,
        networkId: network.id,
        config,
        status: () => this.getNodeStatus({ id: nodeId } as NodeHandle),
        stop: () => this.stopNode({ id: nodeId } as NodeHandle),
        getRequestPort: () => config.network?.requestPort,
        getApiUrl: () => `http://localhost:${config.network?.port}/api`,
      };

      // Store handle
      this.nodeHandles.set(nodeId, handle);

      // Wait for node to be ready using StatusManager
      await this.statusManager.waitForNodeReady( container, config.network.port);

      return handle;
    } catch (error) {
      await this.cleanupFailedStart(nodeId);
      throw error;
    }
  }

  /**
   * Stop a running node
   */
  async stopNode(handle: NodeHandle): Promise<void> {
    const nodeId = handle.id;
    const container = this.containers.get(nodeId);
    
    if (!container) {
      throw new Error(`No container found for node ${nodeId}`);
    }

    try {
      // Stop and remove the container using ContainerManager
      try {
        await this.containerManager.stopContainer(container);
        await this.containerManager.removeContainer(container);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debug(`Error managing container ${nodeId}: %s`, errorMessage);
        // Continue with cleanup even if container operations fail
      }
      
      // Clean up network using NetworkManager
      const network = this.networks.get(nodeId);
      if (network) {
        try {
          await this.networkManager.removeNetwork(network.id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          debug(`Error removing network for node ${nodeId}: %s`, errorMessage);
        } finally {
          this.networks.delete(nodeId);
        }
      }
      
      // Clean up log stream
      this.cleanupLogStream(nodeId);
      
      // Remove from internal maps
      this.containers.delete(nodeId);
      this.nodeHandles.delete(nodeId);
      
      debug(`Stopped and cleaned up node ${nodeId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug(`Error during cleanup of node ${nodeId}: %s`, errorMessage);
      throw new Error(`Failed to stop node ${nodeId}: ${errorMessage}`);
    }
  }

  /**
   * Clean up log stream for a node
   * @private
   */
  private cleanupLogStream(nodeId: string): void {
    const logStream = this.containerLogStreams.get(nodeId);
    if (!logStream) return;
    
    try {
      if ('destroy' in logStream) {
        (logStream as { destroy: () => void }).destroy();
      } else if ('end' in logStream) {
        (logStream as { end: () => void }).end();
      }
    } catch (error) {
      debug(`Error cleaning up log stream for node ${nodeId}: %o`, error);
    } finally {
      this.containerLogStreams.delete(nodeId);
    }
  }

  /**
   * Get status of a node
   */
  async getNodeStatus(handle: NodeHandle): Promise<NodeStatus> {
    const container = this.containers.get(handle.id);
    
    // If container not found, return stopped status
    if (!container) {
      return {
        id: handle.id,
        status: 'stopped',
        error: 'Container not found',
        network: {
          address: '',
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

    try {
      // Delegate to StatusManager to get the node status
      return await this.statusManager.getNodeStatus(handle, container);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug(`Error getting status for node ${handle.id}: %s`, errorMessage);
      
      return {
        id: handle.id,
        status: 'error',
        error: errorMessage,
        network: {
          address: '',
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
  }

  /**
   * Create network partitions
   */
  async partitionNetwork(_partitions: NetworkPartition): Promise<void> {
    // Implementation for network partitioning
    // This is a simplified version - in a real implementation, you would:
    // 1. Create separate networks for each partition
    // 2. Connect containers to their respective partition networks
    // 3. Disconnect them from other networks
    debug('Network partitioning not fully implemented');
  }

  /**
   * Set resource limits for a node
   */
  async setResourceLimits(
    handle: NodeHandle,
    limits: Partial<NodeConfig['resources']> = {}
  ): Promise<void> {
    const container = this.containers.get(handle.id);
    if (!container) {
      throw new Error(`No container found for node ${handle.id}`);
    }

    try {
      // Delegate to ResourceManager
      await this.resourceManager.setResourceLimits(container, {
        cpu: limits.cpu,
        memory: limits.memory,
        memorySwap: limits.memory // Default to same as memory limit if not specified
      });
      
      debug(`Updated resource limits for node %s: %o`, handle.id, limits);
    } catch (error) {
      debug(`Failed to update resource limits for node ${handle.id}: %o`, error);
      throw new Error(`Failed to update resource limits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Connect two nodes in the network
   */
  async connectNodes(handle1: NodeHandle, handle2: NodeHandle): Promise<void> {
    const dockerHandle1 = handle1 as DockerNodeHandle;
    const dockerHandle2 = handle2 as DockerNodeHandle;
    
    const container1 = this.containers.get(handle1.id);
    const container2 = this.containers.get(handle2.id);

    if (!container1 || !container2) {
      throw new Error('One or both containers not found');
    }

    try {
      // Get the network from the first container
      const networkId = dockerHandle1.networkId;
      if (!networkId) {
        throw new Error(`No network found for node ${handle1.id}`);
      }

      // Connect the second container to the same network
      const network = this.networks.get(handle1.id);
      if (!network) {
        throw new Error(`Network not found for node ${handle1.id}`);
      }

      await network.connect({
        Container: container2.id,
        EndpointConfig: {
          Aliases: [`node-${handle2.id}`]
        }
      });

      // Update the network ID in the second handle
      dockerHandle2.networkId = networkId;
    } catch (error) {
      debug(`Error connecting nodes ${handle1.id} and ${handle2.id}: %o`, error);
      throw error;
    }
  }


  /**
   * Cleans up resources for a specific node that failed to start properly.
   * 
   * This method is automatically called when a node fails to start during the `startNode` process.
   * It handles cleanup of both the container and network resources associated with the failed node,
   * and ensures all internal state is properly cleaned up.
   * 
   * @remarks
   * - Runs container and network cleanup in parallel for efficiency
   * - Handles errors gracefully by logging them without rethrowing
   * - Cleans up internal state for just the specified node
   * - Used internally by the orchestrator during error handling
   * 
   * @param nodeId - The unique identifier of the node that failed to start
   * @private
   */
  private async cleanupFailedStart(nodeId: string): Promise<void> {
    debug(`Cleaning up failed start for node ${nodeId}...`);
    
    // Get references to resources before starting cleanup
    const container = this.containers.get(nodeId);
    const network = this.networks.get(nodeId);
    
    // Create a map of containers to clean up
    const containersToCleanup = new Map<string, Container>();
    if (container) {
      containersToCleanup.set(nodeId, container);
    }
    
    // Create a map of networks to clean up
    const networksToCleanup = new Map<string, Network>();
    if (network) {
      networksToCleanup.set(nodeId, network);
    }
    
    try {
      // Run container and network cleanup in parallel
      const [containerErrors, networkErrors] = await Promise.all([
        // Clean up containers using ContainerManager
        this.containerManager.cleanupContainers(containersToCleanup),
        // Clean up networks using NetworkManager
        this.networkManager.cleanupNetworks(networksToCleanup)
      ]);
      
      // Log any errors that occurred during cleanup
      if (containerErrors.length > 0) {
        debug(`Encountered ${containerErrors.length} error(s) while cleaning up containers for node ${nodeId}:`);
        containerErrors.forEach(({ resource, error }) => {
          console.warn(`- ${resource}:`, error instanceof Error ? error.message : 'Unknown error');
        });
      }
      
      if (networkErrors.length > 0) {
        debug(`Encountered ${networkErrors.length} error(s) while cleaning up networks for node ${nodeId}:`);
        networkErrors.forEach(({ resource, error }) => {
          console.warn(`- ${resource}:`, error instanceof Error ? error.message : 'Unknown error');
        });
      }
      
      debug(`Completed cleanup for node ${nodeId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug(`Unexpected error during cleanup of node ${nodeId}: %s`, errorMessage);
    } finally {
      // Always clean up internal state, even if errors occurred
      this.containers.delete(nodeId);
      this.networks.delete(nodeId);
      this.nodeHandles.delete(nodeId);
      this.containerLogStreams.delete(nodeId);
    }
  }

  /**
   * Get a container by ID
   * @param containerId The ID of the container to retrieve
   * @returns The container instance or undefined if not found
   */
  async getContainer(containerId: string): Promise<Container | undefined> {
    // First try to get from our containers map
    const container = this.containers.get(containerId);
    if (container) {
      return container;
    }
    
    // If not found, try to get it from the container manager
    try {
      return await this.containerManager.getContainer(containerId);
    } catch (error) {
      debug(`Failed to get container ${containerId}: %o`, error);
      return undefined;
    }
  }

  /**
   * Cleans up all resources managed by this orchestrator.
   * 
   * This method should be called during shutdown or when you need to completely tear down
   * all containers and networks created by this orchestrator instance.
   * 
   * @remarks
   * - Stops and removes all containers first
   * - Then removes all networks (sequential execution)
   * - Clears all internal state including node handles and log streams
   * - Throws any errors that occur during cleanup
   * - Should be called when the orchestrator is being shut down
   * 
   * @throws {Error} If any error occurs during the cleanup process
   */
  async cleanup(): Promise<void> {
    debug('Starting cleanup of all resources...');
    
    // Create copies of the maps to avoid modification during iteration
    const containersToCleanup = new Map(this.containers);
    const networksToCleanup = new Map(this.networks);
    
    try {
      // First, clean up all containers
      debug('Stopping and removing all containers...');
      const containerErrors = await this.containerManager.cleanupContainers(containersToCleanup);
      
      // Wait a short time to ensure all container cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then clean up all networks
      debug('Removing all networks...');
      const networkErrors = await this.networkManager.cleanupNetworks(networksToCleanup);
      
      // Log any errors that occurred during cleanup
      if (containerErrors.length > 0) {
        debug(`Encountered ${containerErrors.length} error(s) while cleaning up containers:`);
        containerErrors.forEach(({ resource, error }) => {
          console.warn(`- ${resource}:`, error instanceof Error ? error.message : 'Unknown error');
        });
      }
      
      if (networkErrors.length > 0) {
        debug(`Encountered ${networkErrors.length} error(s) while cleaning up networks:`);
        networkErrors.forEach(({ resource, error }) => {
          console.warn(`- ${resource}:`, error instanceof Error ? error.message : 'Unknown error');
        });
      }
      
      debug('Completed cleanup of all resources');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug('Unexpected error during cleanup: %s', errorMessage);
      throw error; // Re-throw to allow callers to handle the error
    } finally {
      // Always clear internal state, even if errors occurred
      this.containers.clear();
      this.networks.clear();
      this.nodeHandles.clear();
      this.containerLogStreams.clear();
    }
  }
}
