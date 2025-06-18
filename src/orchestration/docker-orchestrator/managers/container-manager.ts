import Docker, { Container, DockerOptions } from 'dockerode';
import { IContainerManager } from './interfaces';
import { NodeConfig, NodeStatus } from '../../types';

export class ContainerManager implements IContainerManager {
  private docker: Docker;

  constructor(dockerOptions?: DockerOptions) {
    this.docker = new Docker(dockerOptions);
  }

  async createContainer(
    nodeId: string,
    config: NodeConfig,
    networkId: string
  ): Promise<Container> {
    const containerName = `rhizome-node-${nodeId}`;
    
    // Create host config with port bindings and mounts
    const hostConfig: Docker.HostConfig = {
      NetworkMode: networkId,
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
      Image: 'rhizome-node-test',
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
      const container = await this.docker.createContainer(containerConfig);

      return container;
    } catch (error) {
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async startContainer(container: Container): Promise<void> {
    try {
      await container.start();
    } catch (error) {
      throw new Error(`Failed to start container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async stopContainer(container: Container): Promise<void> {
    try {
      await container.stop({ t: 1 });
    } catch (error) {
      console.warn('Error stopping container:', error);
      throw error;
    }
  }

  async removeContainer(container: Container): Promise<void> {
    try {
      await container.remove({ force: true });
    } catch (error) {
      console.warn('Error removing container:', error);
      throw error;
    }
  }

  async getContainerLogs(container: Container, tailLines = 20): Promise<string> {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tailLines,
      timestamps: true,
      follow: false,
    });
    return logs.toString();
  }

  /**
   * Get a container by ID
   * @param containerId The ID of the container to retrieve
   * @returns The container instance
   * @throws Error if the container cannot be found
   */
  async getContainer(containerId: string): Promise<Container> {
    try {
      const container = this.docker.getContainer(containerId);
      // Verify the container exists by inspecting it
      await container.inspect();
      return container;
    } catch (error) {
      throw new Error(`Failed to get container ${containerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async verifyContainerRunning(container: Container): Promise<Docker.ContainerInspectInfo> {
    const containerInfo = await container.inspect();
    if (!containerInfo.State.Running) {
      throw new Error('Container is not running');
    }
    return containerInfo;
  }

  mapContainerState(state: string): NodeStatus['status'] {
    if (!state) return 'error';
    
    const stateLower = state.toLowerCase();
    if (['created', 'restarting'].includes(stateLower)) return 'starting';
    if (stateLower === 'running') return 'running';
    if (stateLower === 'paused') return 'stopping';
    if (['dead', 'exited'].includes(stateLower)) return 'stopped';
    
    return 'error';
  }

  async cleanupContainers(containers: Map<string, Container>): Promise<Array<{ resource: string; error: Error }>> {
    const cleanupErrors: Array<{ resource: string; error: Error }> = [];
    
    // Process containers in sequence to avoid overwhelming the Docker daemon
    for (const [nodeId, container] of containers.entries()) {
      try {
        console.log(`[Cleanup] Stopping container ${nodeId}...`);
        
        try {
          // First, try to stop the container gracefully
          await this.stopContainer(container);
          console.log(`[Cleanup] Successfully stopped container ${nodeId}`);
        } catch (stopError) {
          console.warn(`[Cleanup] Failed to stop container ${nodeId}:`, stopError);
          // Continue with force removal even if stop failed
        }
        
        // Now remove the container
        console.log(`[Cleanup] Removing container ${nodeId}...`);
        await this.removeContainer(container);
        console.log(`[Cleanup] Successfully removed container ${nodeId}`);
        
        // Verify the container is actually gone
        try {
          const containerInfo = await container.inspect();
          console.warn(`[Cleanup] Container ${nodeId} still exists after removal:`, containerInfo.State?.Status);
          cleanupErrors.push({ 
            resource: `container:${nodeId}`, 
            error: new Error(`Container still exists after removal: ${containerInfo.State?.Status}`) 
          });
        } catch (inspectError) {
          // Expected - container should not exist anymore
          console.log(`[Cleanup] Verified container ${nodeId} has been removed`);
        }
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[Cleanup] Error cleaning up container ${nodeId}:`, err);
        cleanupErrors.push({ resource: `container:${nodeId}`, error: err });
      }
      
      // Add a small delay between container cleanups
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return cleanupErrors;
  }
}
