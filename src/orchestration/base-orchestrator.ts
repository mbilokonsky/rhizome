import { NodeOrchestrator, NodeHandle, NodeConfig, NodeStatus } from './types';

/**
 * Base class for all orchestrator implementations
 * Provides common functionality and ensures interface compliance
 */
export abstract class BaseOrchestrator implements NodeOrchestrator {
  /**
   * Start a new node with the given configuration
   * Must be implemented by subclasses
   */
  abstract startNode(config: NodeConfig): Promise<NodeHandle>;

  /**
   * Stop a running node
   * Must be implemented by subclasses
   */
  abstract stopNode(handle: NodeHandle): Promise<void>;

  /**
   * Get status of a node
   * Must be implemented by subclasses
   */
  abstract getNodeStatus(handle: NodeHandle): Promise<NodeStatus>;

  /**
   * Connect two nodes
   * Default implementation does nothing - should be overridden by subclasses
   * that support direct node connections
   */
  async connectNodes(_node1: NodeHandle, _node2: NodeHandle): Promise<void> {
    // Default implementation does nothing
    console.warn('connectNodes not implemented for this orchestrator');
  }

  /**
   * Create network partitions
   * Default implementation does nothing - should be overridden by subclasses
   * that support network partitioning
   */
  async partitionNetwork(_partitions: { groups: string[][] }): Promise<void> {
    // Default implementation does nothing
    console.warn('partitionNetwork not implemented for this orchestrator');
  }

  /**
   * Set resource limits for a node
   * Default implementation does nothing - should be overridden by subclasses
   * that support resource management
   */
  async setResourceLimits(
    _handle: NodeHandle,
    _limits: Partial<NodeConfig['resources']>
  ): Promise<void> {
    // Default implementation does nothing
    console.warn('setResourceLimits not implemented for this orchestrator');
  }

  /**
   * Clean up all resources
   * Default implementation does nothing - should be overridden by subclasses
   * that need to clean up resources
   */
  async cleanup(): Promise<void> {
    // Default implementation does nothing
    console.warn('cleanup not implemented for this orchestrator');
  }
}
