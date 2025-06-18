import Docker, { Container, Network } from 'dockerode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as tar from 'tar-fs';
import { Headers } from 'tar-fs';
import { BaseOrchestrator } from '../base-orchestrator';
import { NodeConfig, NodeHandle, NodeStatus, NetworkPartition } from '../types';
import { DockerNodeHandle, DockerOrchestratorOptions } from './types';

const DEFAULT_OPTIONS: DockerOrchestratorOptions = {
  image: 'rhizome-node-test',
  containerWorkDir: '/app',
  autoBuildTestImage: true,
};

export class DockerOrchestrator extends BaseOrchestrator {
  private docker: Docker;
  private options: DockerOrchestratorOptions;
  private containers: Map<string, Container> = new Map();
  private networks: Map<string, Network> = new Map();
  private containerLogStreams: Map<string, NodeJS.ReadableStream> = new Map();
  private nodeHandles: Map<string, DockerNodeHandle> = new Map();

  constructor(options: Partial<DockerOrchestratorOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.docker = new Docker(this.options.dockerOptions);
  }

  /**
   * Start a new node with the given configuration
   */
  async startNode(config: NodeConfig): Promise<NodeHandle> {
    const nodeId = config.id || `node-${Date.now()}`;
    config.network = config.network || {};
    config.network.port = config.network.port || this.getRandomPort();
    config.network.requestPort = config.network.requestPort || this.getRandomPort();

    try {
      // Ensure test image is built
      if (this.options.autoBuildTestImage) {
        await this.buildTestImage();
      }
      
      // Create a network for this node
      const network = await this.createNetwork(nodeId);
      
      // Create and start container
      const container = await this.createContainer(nodeId, config, {
        networkId: network.id,
      });

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

      // Store references
      this.containers.set(nodeId, container);
      this.nodeHandles.set(nodeId, handle);

      // Wait for node to be ready
      await this.waitForNodeReady(container, config.network.port);

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
      // Stop the container
      try {
        await container.stop({ t: 1 });
      } catch (error) {
        console.warn(`Error stopping container ${nodeId}:`, error);
      }
      
      // Remove the container
      try {
        await container.remove({ force: true });
      } catch (error) {
        console.warn(`Error removing container ${nodeId}:`, error);
      }
      
      // Clean up network
      const network = this.networks.get(nodeId);
      if (network) {
        try {
          await network.remove();
        } catch (error) {
          console.warn(`Error removing network for ${nodeId}:`, error);
        }
        this.networks.delete(nodeId);
      }
      
      // Clean up log stream
      const logStream = this.containerLogStreams.get(nodeId);
      if (logStream) {
        if ('destroy' in logStream) {
          (logStream as any).destroy();
        } else if ('end' in logStream) {
          (logStream as any).end();
        }
        this.containerLogStreams.delete(nodeId);
      }
      
      // Remove from internal maps
      this.containers.delete(nodeId);
      this.nodeHandles.delete(nodeId);
      
      console.log(`Stopped and cleaned up node ${nodeId}`);
    } catch (error) {
      console.error(`Error during cleanup of node ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * Get status of a node
   */
  private mapContainerState(state: string): NodeStatus['status'] {
    if (!state) return 'error';
    
    const stateLower = state.toLowerCase();
    if (['created', 'restarting'].includes(stateLower)) return 'starting';
    if (stateLower === 'running') return 'running';
    if (stateLower === 'paused') return 'stopping';
    if (['dead', 'exited'].includes(stateLower)) return 'stopped';
    
    return 'error';
  }

  private getRandomPort(): number {
    const start = 5000;
    const range = 5000;
    return Math.floor(start + Math.random() * range);
  }

  private async buildTestImage(): Promise<void> {
      console.log('Building test Docker image...');
      const dockerfilePath = path.join(process.cwd(), 'Dockerfile.test');
      console.log('Current directory:', process.cwd());
      
      // Verify Dockerfile exists
      try {
        await fs.access(dockerfilePath);
        console.log(`Found Dockerfile at: ${dockerfilePath}`);
      } catch (err) {
        throw new Error(`Dockerfile not found at ${dockerfilePath}: ${err}`);
      }
      
      // Create a tar archive of the build context
      const tarStream = tar.pack(process.cwd(), {
        entries: [
          'Dockerfile.test', 
          'package.json',
          'package-lock.json',
          'tsconfig.json',
          'src/',
          'markdown/',
          'util',
          'examples/',
          'README.md',
        ],
        map: (header: Headers) => {
          // Ensure Dockerfile is named 'Dockerfile' in the build context
          if (header.name === 'Dockerfile.test') {
            header.name = 'Dockerfile';
          }
          return header;
        }
      });
      
      console.log('Created build context tar stream');
      
      console.log('Starting Docker build...');
      
      // Create a promise that resolves when the build is complete
      const buildPromise = new Promise<void>((resolve, reject) => {
        const logMessages: string[] = [];
        
        const log = (...args: any[]) => {
          const timestamp = new Date().toISOString();
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          const logMessage = `[${timestamp}] ${message}\n`;
          process.stdout.write(logMessage);
          logMessages.push(logMessage);
        };
        
        // Type the build stream properly using Dockerode's types
        this.docker.buildImage(tarStream, { t: 'rhizome-node-test' }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (err) {
            const errorMsg = `❌ Error starting Docker build: ${err.message}`;
            log(errorMsg);
            return reject(new Error(errorMsg));
          }
          
          if (!stream) {
            const error = new Error('No build stream returned from Docker');
            log(`❌ ${error.message}`);
            return reject(error);
          }
          
          log('✅ Docker build started, streaming output...');
          
          // Handle build output
          let output = '';
          stream.on('data', (chunk: Buffer) => {
            const chunkStr = chunk.toString();
            output += chunkStr;
            
            try {
              // Try to parse as JSON (Docker build output is typically JSONL)
              const lines = chunkStr.split('\n').filter(Boolean);
              for (const line of lines) {
                try {
                  if (!line.trim()) continue;
                  
                  const json = JSON.parse(line);
                  if (json.stream) {
                    const message = `[Docker Build] ${json.stream}`.trim();
                    log(message);
                  } else if (json.error) {
                    const errorMsg = json.error.trim() || 'Unknown error during Docker build';
                    log(`❌ ${errorMsg}`);
                    reject(new Error(errorMsg));
                    return;
                  } else if (Object.keys(json).length > 0) {
                    // Log any other non-empty JSON objects
                    log(`[Docker Build] ${JSON.stringify(json)}`);
                  }
                } catch (e) {
                  // If not JSON, log as plain text if not empty
                  if (line.trim()) {
                    log(`[Docker Build] ${line}`);
                  }
                }
              }
            } catch (e) {
              const errorMsg = `Error processing build output: ${e}\nRaw output: ${chunkStr}`;
              log(`❌ ${errorMsg}`);
              console.error(errorMsg);
            }
          });
          
          stream.on('end', () => {
            log('✅ Docker build completed successfully');
            
            resolve();
          });
          
          stream.on('error', (err: Error) => {
            const errorMsg = `❌ Docker build failed: ${err.message}\nBuild output so far: ${output}`;
            log(errorMsg);
            
            reject(new Error(errorMsg));
          });
        });
      });
      
      // Wait for the build to complete
      await buildPromise;
      console.log('✅ Test Docker image built successfully');
  }

  private async createNetwork(nodeId: string): Promise<{ id: string; name: string }> {
    const networkName = `rhizome-${nodeId}-network`;
    try {
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        CheckDuplicate: true,
        Internal: false,
        Attachable: true,
        EnableIPv6: false
      });
      
      this.networks.set(nodeId, network);
      return { id: network.id, name: networkName };
    } catch (error) {
      console.error(`Error creating network for node ${nodeId}:`, error);
      throw error;
    }
  }

  private async createContainer(
    nodeId: string,
    config: NodeConfig,
    options: {
      networkId: string;
    }
  ): Promise<Container> {
    const containerName = `rhizome-node-${nodeId}`;

    // Create host config with port bindings and mounts
    const hostConfig: Docker.HostConfig = {
      NetworkMode: options.networkId,
      PortBindings: {
        [`${config.network?.port || 3000}/tcp`]: [{ HostPort: config.network?.port?.toString() }],
        [`${config.network?.requestPort || 3001}/tcp`]: [{ HostPort: config.network?.requestPort?.toString() }],
      },
    };

    // Add resource limits if specified
    if (config.resources) {
      if (config.resources.cpu) {
        // Ensure CpuShares is an integer (Docker requires this)
        hostConfig.CpuShares = Math.floor(config.resources.cpu * 1024); // Convert to relative CPU shares (1024 = 1 CPU)
        hostConfig.NanoCpus = Math.floor(config.resources.cpu * 1e9); // Convert to nanoCPUs (1e9 = 1 CPU)
      }
      if (config.resources.memory) {
        hostConfig.Memory = Math.floor(config.resources.memory * 1024 * 1024); // Convert MB to bytes
        hostConfig.MemorySwap = hostConfig.Memory; // Disable swap
      }
    }

    // Create container configuration
    const containerConfig: Docker.ContainerCreateOptions = {
      name: containerName,
      Image: this.options.image,
      ExposedPorts: {
        [`${config.network?.port || 3000}/tcp`]: {},
        [`${config.network?.requestPort || 3001}/tcp`]: {}
      },
      HostConfig: hostConfig,
      Env: [
        'NODE_ENV=test',
        'DEBUG=*',
        `RHIZOME_HTTP_API_PORT=${config.network?.port || 3000}`,
        `RHIZOME_HTTP_API_ADDR=0.0.0.0`,
        `RHIZOME_HTTP_API_ENABLE=true`,
        `RHIZOME_REQUEST_BIND_PORT=${config.network?.requestPort || 3001}`,
        'RHIZOME_REQUEST_BIND_ADDR=0.0.0.0',
        `RHIZOME_PUBLISH_BIND_PORT=${(config.network?.requestPort || 3001) + 1}`,
        'RHIZOME_PUBLISH_BIND_ADDR=0.0.0.0',
        'RHIZOME_STORAGE_TYPE=memory',
        `RHIZOME_PEER_ID=${nodeId}`,
        // TODO: include seed peers
      ],

    };

    try {
      // Create and start the container
      const container = await this.docker.createContainer(containerConfig);
      try {
        await container.start();
        // Store container reference
        this.containers.set(nodeId, container);
      } catch (error) {
        // If container start fails, try to remove it
        try {
          await container.remove({ force: true });
        } catch (removeError) {
          console.warn(`Failed to clean up container after failed start:`, removeError);
        }
        throw error;
      }
      
      return container;
    } catch (error) {
      console.error(`Error creating container ${containerName}:`, error);
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async healthCheck(healthUrl: string): Promise<Response | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(healthUrl, {
        headers: { 
          'Accept': 'application/json',
          'Connection': 'close'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Health check timed out after 5000ms (${healthUrl})`);
      }
      throw error;
    }
  }

  private async getContainerLogs(container: Container, tailLines = 20): Promise<string> {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tailLines,
      timestamps: true,
      follow: false
    });
    return logs.toString();
  }

  private async verifyContainerRunning(container: Container): Promise<Docker.ContainerInspectInfo> {
    const containerInfo = await container.inspect();
    if (!containerInfo.State.Running) {
      throw new Error('Container is not running');
    }
    return containerInfo;
  }

  private async waitForNodeReady(container: Container, port: number, maxAttempts = 8, delayMs = 1000): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.verifyContainerRunning(container);
        
        // Get the actual mapped port from container info
        const healthUrl = `http://localhost:${port}/api/health`;
        console.log(`Attempting health check at: ${healthUrl}`);
        
        // Perform health check
        const response = await this.healthCheck(healthUrl);
        
        if (response?.ok) {
          const healthData = await response.json().catch(() => ({}));
          console.log(`✅ Node is healthy:`, JSON.stringify(healthData, null, 2));
          return;
        }
        
        const body = await response?.text();
        throw new Error(`Health check failed with status ${response?.status}: ${body}`);
        
      } catch (error) {
        lastError = error as Error;
        console.log(`Attempt ${attempt}/${maxAttempts} failed:`, 
          error instanceof Error ? error.message : String(error));
        
        if (attempt === maxAttempts) break;
        
        // Wait before next attempt with exponential backoff (capped at 8s)
        const backoff = Math.min(delayMs * Math.pow(1.5, attempt - 1), 8000);
        console.log(`⏳ Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    
    // If we get here, all attempts failed
    const errorMessage = `Node did not become ready after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`;
    console.error('❌', errorMessage);
    
    // Try to get more container logs before failing
    try {
      const logs = await this.getContainerLogs(container, 50);
      console.error('Container logs before failure:', logs);
    } catch (logError) {
      console.error('Failed to get container logs before failure:', logError);
    }
    
    throw new Error(errorMessage);
  }

  private async cleanupFailedStart(nodeId: string): Promise<void> {
    try {
      const container = this.containers.get(nodeId);
      if (container) {
        try {
          await container.stop();
          await container.remove();
        } catch (error) {
          console.error(`Error cleaning up failed container ${nodeId}:`, error);
        }
        this.containers.delete(nodeId);
      }

      const network = this.networks.get(nodeId);
      if (network) {
        try {
          await network.remove();
        } catch (error) {
          console.error(`Error cleaning up network for node ${nodeId}:`, error);
        }
        this.networks.delete(nodeId);
      }

      this.nodeHandles.delete(nodeId);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  async getNodeStatus(handle: NodeHandle): Promise<NodeStatus> {
    const container = this.containers.get(handle.id);
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
      const containerInfo = await container.inspect();
      const dockerNodeHandle = handle as DockerNodeHandle;
      
      // Initialize with default values
      const status: NodeStatus = {
        id: handle.id,
        status: this.mapContainerState(containerInfo.State?.Status || ''),
        network: {
          address: containerInfo.NetworkSettings?.IPAddress || '',
          httpPort: dockerNodeHandle.config?.network?.port || 0,
          requestPort: dockerNodeHandle.config?.network?.requestPort || 0,
          peers: [] // TODO: Implement peer discovery
        },
        resources: {
          cpu: {
            usage: 0, // Will be updated from container stats
            limit: 0
          },
          memory: {
            usage: 0, // Will be updated from container stats
            limit: 0
          }
        },
        error: undefined
      };
      
      // Update with actual stats if available
      try {
        const stats = await container.stats({ stream: false });
        const statsData = JSON.parse(stats.toString());
        
        if (statsData?.cpu_stats?.cpu_usage) {
          status.resources!.cpu.usage = statsData.cpu_stats.cpu_usage.total_usage || 0;
          status.resources!.cpu.limit = (statsData.cpu_stats.online_cpus || 0) * 1e9; // Convert to nanoCPUs
        }
        
        if (statsData?.memory_stats) {
          status.resources!.memory.usage = statsData.memory_stats.usage || 0;
          status.resources!.memory.limit = statsData.memory_stats.limit || 0;
        }
      } catch (statsError) {
        const errorMessage = statsError instanceof Error ? statsError.message : 'Unknown error';
        console.warn(`Failed to get container stats for ${handle.id}:`, errorMessage);
        // Update status with error but don't return yet
        status.status = 'error';
        status.error = `Failed to get container stats: ${errorMessage}`;
      }
      
      return status;
    } catch (error) {
      console.error(`Failed to get status for node ${handle.id}:`, error);
      return {
        id: handle.id,
        status: 'error' as const,
        error: error instanceof Error ? error.message : String(error),
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
  async partitionNetwork(partitions: NetworkPartition): Promise<void> {
    // Implementation for network partitioning
    // This is a simplified version - in a real implementation, you would:
    // 1. Create separate networks for each partition
    // 2. Connect containers to their respective partition networks
    // 3. Disconnect them from other networks
    console.warn('Network partitioning not fully implemented');
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
      const updateConfig: any = {};
      
      // Only update CPU if provided
      if (limits.cpu !== undefined) {
        updateConfig.CpuShares = limits.cpu;
        updateConfig.NanoCpus = limits.cpu * 1e9; // Convert to nanoCPUs
      }
      
      // Only update memory if provided
      if (limits.memory !== undefined) {
        updateConfig.Memory = limits.memory * 1024 * 1024; // Convert MB to bytes
        updateConfig.MemorySwap = updateConfig.Memory; // Disable swap
      }

      // Only update if we have something to update
      if (Object.keys(updateConfig).length > 0) {
        await container.update({ ...updateConfig });
        console.log(`Updated resource limits for node ${handle.id}:`, updateConfig);
      }
    } catch (error) {
      console.error(`Failed to update resource limits for node ${handle.id}:`, error);
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
      console.error(`Error connecting nodes ${handle1.id} and ${handle2.id}:`, error);
      throw error;
    }
  }


  
  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    console.log('Starting cleanup of all Docker resources...');
    const cleanupErrors: Array<{ resource: string; error: Error }> = [];
    
    // Stop and remove all containers
    for (const [nodeId, container] of this.containers.entries()) {
      try {
        console.log(`Stopping container ${nodeId}...`);
        await container.stop({ t: 1 }).catch(() => { /* Ignore stop errors */ });
        await container.remove({ force: true });
        console.log(`Removed container ${nodeId}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        cleanupErrors.push({ resource: `container:${nodeId}`, error: err });
        console.error(`Error cleaning up container ${nodeId}:`, err);
      }
    }
    
    // Remove all networks
    for (const [nodeId, network] of this.networks.entries()) {
      try {
        console.log(`Removing network for node ${nodeId}...`);
        await network.remove();
        console.log(`Removed network for node ${nodeId}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        cleanupErrors.push({ resource: `network:${nodeId}`, error: err });
        console.error(`Error removing network for node ${nodeId}:`, err);
      }
    }
    
    // Clear all internal state
    this.containers.clear();
    this.networks.clear();
    this.containerLogStreams.clear();
    this.nodeHandles.clear();
    
    // Log summary of cleanup
    if (cleanupErrors.length > 0) {
      console.warn(`Cleanup completed with ${cleanupErrors.length} errors`);
      cleanupErrors.forEach(({ resource, error }) => {
        console.warn(`- ${resource}: ${error.message}`);
      });
      throw new Error(`Cleanup completed with ${cleanupErrors.length} errors`);
    }
    
    console.log('Cleanup completed successfully');
  }
}
