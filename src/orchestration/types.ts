/**
 * Core types and interfaces for the orchestration layer
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
    requestPort: number;
    httpPort: number;
    peers: string[];
  };
  resources?: {
    cpu: {
      usage: number;
      limit: number;
    };
    memory: {
      usage: number;
      limit: number;
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
  getRequestPort: () => number | undefined;
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
  setResourceLimits(handle: NodeHandle, limits: Partial<NodeConfig['resources']>): Promise<void>;
}

export type OrchestratorType = 'in-memory' | 'docker' | 'kubernetes';
