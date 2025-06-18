import { createOrchestrator } from '../src/orchestration/factory';
import { NodeConfig, NodeOrchestrator } from '../src/orchestration/types';
import Debug from 'debug';

const debug = Debug('rz:docker-test-utils');

/**
 * Creates a test environment with Docker orchestrator for a test suite
 * @param testSuiteName - Name of the test suite (used for container naming)
 * @returns Object containing the orchestrator instance and helper functions
 */
export function setupDockerTestEnvironment(testSuiteName: string) {
  // Initialize the orchestrator immediately
  const orchestrator = createOrchestrator('docker', {
    autoBuildTestImage: true,
    image: 'rhizome-node-test',
  });
  
  beforeAll(async () => {
    debug(`[${testSuiteName}] Setting up Docker test environment...`);
    debug(`[${testSuiteName}] Docker test environment ready`);
  }, 30000); // 30s timeout for setup
  
  afterAll(async () => {
    debug(`[${testSuiteName}] Tearing down Docker test environment...`);
    
    if (orchestrator) {
      try {
        await orchestrator.cleanup();
        debug(`[${testSuiteName}] Docker resources cleaned up successfully`);
      } catch (error) {
        debug(`[${testSuiteName}] Error during Docker environment teardown:`, error);
        // Don't throw to allow tests to complete
      }
    }
    
    debug(`[${testSuiteName}] Docker test environment teardown complete`);
  }, 30000); // 30s timeout for teardown
  
  // Helper function to create a test node with default config
  const createTestNode = async (config: Partial<NodeConfig> = {}) => {
    const nodeConfig: NodeConfig = {
      id: `test-node-${testSuiteName}-${Date.now()}`,
      ...config,
    };
    
    debug(`[${testSuiteName}] Creating test node: ${nodeConfig.id}`);
    const node = await orchestrator.startNode(nodeConfig);
    debug(`[${testSuiteName}] Test node created: ${node.id}`);
    
    return node;
  };
  
  return {
    orchestrator,
    createTestNode,
  };
}
