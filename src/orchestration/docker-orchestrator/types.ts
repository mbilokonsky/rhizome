import Docker from 'dockerode';
import { NodeHandle, NodeConfig, NodeStatus } from '../types';

export interface DockerNodeHandle extends NodeHandle {
  containerId: string;
  networkId?: string;
}

export interface DockerOrchestratorOptions {
  /** 
   * Docker image to use for containers
   * Defaults to 'rhizome-node' if not specified
   */
  image?: string;
  
  /** Working directory inside container */
  containerWorkDir?: string;
  
  /** Whether to build test image if not found */
  autoBuildTestImage?: boolean;
}

export interface ContainerResources {
  cpuShares?: number;
  memory?: number;
  memorySwap?: number;
  nanoCpus?: number;
}

export interface ContainerStatus {
  containerId: string;
  image: string;
  state: string;
  status: NodeStatus['status']; // Use the status type from NodeStatus
  networkSettings: {
    ipAddress: string;
    gateway: string;
    ports: Record<string, Array<{ hostIp: string; hostPort: string }> | null>;
  };
}
