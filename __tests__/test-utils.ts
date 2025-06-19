import { createOrchestrator } from '../src/orchestration/factory';
import { NodeConfig, NodeOrchestrator } from '../src/orchestration/types';
import Debug from 'debug';

const debug = Debug('rz:test-utils');

// Global test orchestrator instance
let testOrchestrator: NodeOrchestrator;

// Default test node configuration
const DEFAULT_TEST_NODE_CONFIG: Partial<NodeConfig> = {
  network: {
    // Use default ports that will be overridden by getRandomPort() in the orchestrator
    port: 0,
  },
  storage: {
    type: 'memory',
    path: '/data',
  },
};

/**
 * Set up the test environment before all tests run
 */
export const setupTestEnvironment = async () => {
  debug('Setting up Docker test environment...');
  
  try {
    // Create a Docker orchestrator instance
    testOrchestrator = createOrchestrator('docker', {
      // Enable auto-building of test images
      autoBuildTestImage: true,
      // Use a specific test image name
      image: 'rhizome-node-test',
    });
    
    debug('Docker test environment setup complete');
  } catch (error) {
    debug('Error setting up Docker test environment:', error);
    throw error;
  }
};

/**
 * Clean up the test environment after all tests complete
 */
export const teardownTestEnvironment = async () => {
  debug('Tearing down Docker test environment...');
  
  if (testOrchestrator) {
    try {
      // Clean up all containers and networks
      await testOrchestrator.cleanup();
      debug('Docker resources cleaned up successfully');
    } catch (error) {
      debug('Error during Docker environment teardown:', error);
      // Don't throw to allow tests to complete
    }
  }
  
  debug('Docker test environment teardown complete');
};

/**
 * Get the test orchestrator instance
 */
export const getTestOrchestrator = (): NodeOrchestrator => {
  if (!testOrchestrator) {
    throw new Error('Test orchestrator not initialized. Call setupTestEnvironment() first.');
  }
  return testOrchestrator;
};

/**
 * Create a test node with the given configuration
 */
export const createTestNode = async (config: Partial<NodeConfig> = {}) => {
  const orchestrator = getTestOrchestrator();
  
  // Merge default config with provided config
  const nodeConfig: NodeConfig = {
    ...DEFAULT_TEST_NODE_CONFIG,
    ...config,
    // Ensure we have a unique ID for each node
    id: config.id || `test-node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };
  
  debug(`Creating test node with ID: ${nodeConfig.id}`);
  
  try {
    const nodeHandle = await orchestrator.startNode(nodeConfig);
    debug(`Test node ${nodeConfig.id} created successfully`);
    return nodeHandle;
  } catch (error) {
    debug(`Error creating test node ${nodeConfig.id}:`, error);
    throw error;
  }
};
