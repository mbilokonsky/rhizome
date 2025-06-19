import Debug from 'debug';
import Docker, { Network, NetworkInspectInfo } from 'dockerode';
import { INetworkManager } from './interfaces';

const debug = Debug('rz:docker:network-manager');

export class NetworkManager implements INetworkManager {
  private networks: Map<string, Network> = new Map();
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async createNetwork(nodeId: string): Promise<Network> {
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
      return network;
    } catch (error) {
      debug(`Error creating network for node ${nodeId}: %o`, error);
      throw error;
    }
  }

  async removeNetwork(networkId: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.remove();
      
      // Remove from our tracking map
      for (const [nodeId, net] of this.networks.entries()) {
        if (net.id === networkId) {
          this.networks.delete(nodeId);
          break;
        }
      }
    } catch (error) {
      debug(`Failed to remove network ${networkId}: %o`, error);
      throw error;
    }
  }

  async connectToNetwork(
    containerId: string,
    networkId: string,
    aliases: string[] = []
  ): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.connect({
        Container: containerId,
        EndpointConfig: {
          Aliases: aliases
        }
      });
    } catch (error) {
      debug(`Failed to connect container ${containerId} to network ${networkId}: %o`, error);
      throw error;
    }
  }

  async disconnectFromNetwork(containerId: string, networkId: string): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkId);
      await network.disconnect({ Container: containerId });
    } catch (error) {
      debug(`Failed to disconnect container ${containerId} from network ${networkId}: %o`, error);
      throw error;
    }
  }

  setupPortBindings(ports: Record<string, any>): Docker.HostConfig['PortBindings'] {
    const portBindings: Docker.HostConfig['PortBindings'] = {};
    
    for (const [containerPort, hostPort] of Object.entries(ports)) {
      const [port, protocol = 'tcp'] = containerPort.split('/');
      portBindings[`${port}/${protocol}`] = [{ HostPort: hostPort.toString() }];
    }
    
    return portBindings;
  }

  async getNetworkInfo(networkId: string): Promise<NetworkInspectInfo> {
    try {
      const network = this.docker.getNetwork(networkId);
      return await network.inspect();
    } catch (error) {
      debug(`Failed to get network info for ${networkId}: %o`, error);
      throw error;
    }
  }

  async cleanupNetworks(networks: Map<string, Network>): Promise<Array<{ resource: string; error: Error }>> {
    const cleanupErrors: Array<{ resource: string; error: Error }> = [];
    
    // Process networks in sequence to avoid overwhelming the Docker daemon
    for (const [nodeId, network] of networks.entries()) {
      try {
        debug(`[Cleanup] Removing network for node ${nodeId}...`);
        
        // First, inspect the network to see if it has any connected containers
        try {
          const networkInfo = await this.getNetworkInfo(network.id);
          if (networkInfo.Containers && Object.keys(networkInfo.Containers).length > 0) {
            debug(`[Cleanup] Network ${nodeId} still has ${Object.keys(networkInfo.Containers).length} connected containers`);
            
            // Try to disconnect all containers from the network first
            for (const containerId of Object.keys(networkInfo.Containers)) {
              try {
                debug(`[Cleanup] Disconnecting container ${containerId} from network ${nodeId}...`);
                await this.disconnectFromNetwork(containerId, network.id);
                debug(`[Cleanup] Successfully disconnected container ${containerId} from network ${nodeId}`);
              } catch (disconnectError) {
                debug(`[Cleanup] Failed to disconnect container ${containerId} from network ${nodeId}: %o`, disconnectError);
                // Continue with network removal even if disconnect failed
              }
              
              // Add a small delay between disconnects
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        } catch (inspectError) {
          debug(`[Cleanup] Failed to inspect network ${nodeId} before removal: %o`, inspectError);
          // Continue with removal even if inspect failed
        }
        
        // Now remove the network
        await this.removeNetwork(network.id);
        debug(`[Cleanup] Successfully removed network for node ${nodeId}`);
        
        // Verify the network is actually gone
        try {
          await this.getNetworkInfo(network.id);
          debug(`[Cleanup] Network ${nodeId} still exists after removal`);
          cleanupErrors.push({ 
            resource: `network:${nodeId}`, 
            error: new Error('Network still exists after removal') 
          });
        } catch (inspectError) {
          // Expected - network should not exist anymore
          debug(`[Cleanup] Verified network ${nodeId} has been removed`);
        }
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        debug(`[Cleanup] Error cleaning up network ${nodeId}: %o`, err);
        cleanupErrors.push({ resource: `network:${nodeId}`, error: err });
      }
      
      // Add a small delay between network cleanups
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return cleanupErrors;
  }
}
