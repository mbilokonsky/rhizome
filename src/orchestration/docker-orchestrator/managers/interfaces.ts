import Docker, { Container, Network, NetworkInspectInfo } from 'dockerode';
import { NodeConfig, NodeHandle, NodeStatus } from '../../types';

export interface IContainerManager {
  createContainer(
    nodeId: string,
    config: NodeConfig,
    networkId: string
  ): Promise<Container>;
  
  startContainer(container: Container): Promise<void>;
  stopContainer(container: Container): Promise<void>;
  removeContainer(container: Container): Promise<void>;
  getContainerLogs(container: Container, tailLines?: number): Promise<string>;
  getContainer(containerId: string): Promise<Container>;
  verifyContainerRunning(container: Container): Promise<Docker.ContainerInspectInfo>;
  mapContainerState(state: string): NodeStatus['status'];
  cleanupContainers(containers: Map<string, Container>): Promise<Array<{ resource: string; error: Error }>>;
}

export interface INetworkManager {
  createNetwork(nodeId: string): Promise<Network>;
  removeNetwork(networkId: string): Promise<void>;
  connectToNetwork(containerId: string, networkId: string, aliases?: string[]): Promise<void>;
  disconnectFromNetwork(containerId: string, networkId: string): Promise<void>;
  setupPortBindings(ports: Record<string, any>): Docker.HostConfig['PortBindings'];
  getNetworkInfo(networkId: string): Promise<NetworkInspectInfo>;
  cleanupNetworks(networks: Map<string, Network>): Promise<Array<{ resource: string; error: Error }>>;
}

export interface IResourceManager {
  setResourceLimits(
    container: Container,
    limits: Partial<NodeConfig['resources']>
  ): Promise<void>;
  
  getResourceUsage(container: Container): Promise<{
    cpu: { usage: number; limit: number };
    memory: { usage: number; limit: number };
  }>;
}

export interface IImageManager {
  /**
   * Build a test Docker image if it doesn't exist
   * @param imageName The name to give to the built image
   */
  buildTestImage(imageName: string): Promise<void>;
}

export interface IStatusManager {
  waitForNodeReady(
    container: Container,
    port: number,
    maxAttempts?: number,
    delayMs?: number
  ): Promise<void>;
  
  healthCheck(healthUrl: string): Promise<{ ok: boolean; status: number }>;
  mapContainerState(state: string): NodeStatus['status'];
  
  /**
   * Get the status of a node including container status, network info, and resource usage
   * @param handle The node handle containing node metadata
   * @param container The Docker container instance
   * @returns A promise that resolves to the node status
   */
  getNodeStatus(handle: NodeHandle, container: Container): Promise<NodeStatus>;
}
