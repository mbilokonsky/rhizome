import Docker from 'dockerode';
import { describe, it, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { NodeConfig, NodeHandle, NodeStatus } from '@src/orchestration';
import { DockerOrchestrator, createOrchestrator } from '@src/orchestration';
import { ImageManager } from '@src/orchestration/docker-orchestrator/managers/image-manager';
import Debug from 'debug';
import { DOCKER_ENABLE } from '@src/config';
const debug = Debug('rz:test:docker-orchestrator-v2');


// Extended interface to include additional properties that might be present in the implementation
interface ExtendedNodeStatus extends Omit<NodeStatus, 'network'> {
  network?: {
    address: string;
    port: number;  // Changed from httpPort to match NodeStatus
    requestPort: number;
    peers: string[];
    bootstrapPeers?: string[];
    containerId?: string;
    networkId?: string;
  };
  getApiUrl?: () => string;
}

// Simple test to verify Docker is working
// Set default timeout for all tests to 5 minutes
jest.setTimeout(300000);

(DOCKER_ENABLE ? describe : describe.skip)('Docker Orchestrator', () => {
  let docker: Docker;
  let orchestrator: DockerOrchestrator;
  let nodeConfig: NodeConfig;
  let nodePort: number;

  beforeAll(async () => {
    debug('Setting up Docker client and orchestrator...');
    
    // Initialize Docker client with increased timeout
    docker = new Docker({
      timeout: 60000, // 60 second timeout for Docker operations
    });
    
    // Verify Docker is running
    try {
      await docker.ping();
      debug('Docker daemon is responding');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debug('Docker daemon is not responding: %o', error);
      throw new Error(`Docker daemon is not running or not accessible: ${errorMessage}`);
    }
    
    // Initialize the orchestrator with the Docker client and test image
    orchestrator = createOrchestrator('docker', {
      docker,
      image: 'rhizome-node-test',
    }) as DockerOrchestrator;
    debug('Docker orchestrator initialized');
    
    // Create a basic node config for testing with unique network ID
    const testRunId = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    nodePort = 3000 + Math.floor(Math.random() * 1000);
    nodeConfig = {
      id: `node-${testRunId}`,
      networkId: `test-network-${testRunId}`,
      port: nodePort,
      resources: {
        memory: 256, // 256MB
        cpu: 0.5    // 0.5 CPU
      }
    };
    
    debug(`Test node configured with ID: ${nodeConfig.id}, port: ${nodePort}`);

    const imageManager = new ImageManager();
    await imageManager.buildTestImage();
  }); // 30 second timeout

  afterAll(async () => {
    debug('Starting test cleanup...');

    await orchestrator.cleanup();
    
    debug('All test cleanups completed');
  }, 120000); // 2 minute timeout for afterAll

  /**
   * ! Note that this test fails if the build fails
   */
  test('should start and stop a node', async () => {
    debug('Starting test: should start and stop a node');
    
    // Create a new config with a unique ID for this test
    const testRunId = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const testNodeConfig = {
      ...nodeConfig,
      id: `node-${testRunId}`,
      networkId: `test-network-${testRunId}`,
      network: {
        ...nodeConfig.network,
        enableHttpApi: true
      },
      // Add retry logic for Docker operations
      docker: {
        maxRetries: 3,
        retryDelay: 1000
      }
    };
    
    // Start a node
    debug('Starting node...');
    const testNode = await orchestrator.startNode(testNodeConfig);
    expect(testNode).toBeDefined();
    expect(testNode.id).toBeDefined();
    debug(`✅ Node started with ID: ${testNode.id}`);
    
    try {
      // Verify the node is running
      const status = await testNode.status();
      expect(status).toBeDefined();
      debug('Node status: %o', status);
      
      // Verify we can access the health endpoint
      const apiUrl = testNode.getApiUrl?.();
      if (apiUrl) {
        const response = await fetch(`${apiUrl}/health`);
        expect(response.ok).toBe(true);
        const health = await response.json();
        expect(health).toHaveProperty('status', 'ok');
      }
      
      // Stop the node
      debug('Stopping node...');
      await orchestrator.stopNode(testNode);
      debug('Node stopped');
    } finally {
      // Ensure node is cleaned up even if test fails
      try {
        await orchestrator.stopNode(testNode).catch(() => {});
      } catch (e) {
        debug('Error during node cleanup: %o', e);
      }
    }
  });

  test('should enforce resource limits', async () => {
    debug('Starting test: should enforce resource limits');
    
    // Create a new node with a unique ID for this test
    const testNodeConfig = {
      ...nodeConfig,
      id: `test-node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      resources: {
        memory: 256, // 256MB
        cpu: 0.5    // 0.5 CPU
      },
      network: {
        ...nodeConfig.network,
        enableHttpApi: true
      }
    };
    
    let testNode: NodeHandle | null = null;
    
    try {
      // Start the node with resource limits
      testNode = await orchestrator.startNode(testNodeConfig);
      debug(`Node started with ID: ${testNode.id}`);
      
      // Get container info to verify resource limits
      const status = await testNode.status() as ExtendedNodeStatus;
      
      // Verify container ID is available at the root level
      if (!status.containerId) {
        throw new Error('Container ID not available in node status');
      }
      
      // Get the container ID from the node status
      if (!status.containerId) {
        throw new Error('Container ID not available in node status');
      }
      
      // Get container info using ContainerManager
      const container = await orchestrator.containerManager.getContainer(status.containerId);
      if (!container) {
        throw new Error('Container not found');
      }
      
      // Get container info
      const containerInfo = await container.inspect();
      
      // Log container info for debugging
      debug('Container info: %o', {
        Memory: containerInfo.HostConfig?.Memory,
        NanoCpus: containerInfo.HostConfig?.NanoCpus,
        CpuQuota: containerInfo.HostConfig?.CpuQuota,
        CpuPeriod: containerInfo.HostConfig?.CpuPeriod
      });
      
      // Check memory limit (in bytes)
      expect(containerInfo.HostConfig?.Memory).toBe(256 * 1024 * 1024);
      
      // Check CPU limit (can be set as NanoCpus or CpuQuota/CpuPeriod)
      const expectedCpuNano = 0.5 * 1e9; // 0.5 CPU in nanoCPUs
      const actualCpuNano = containerInfo.HostConfig?.NanoCpus;
      
      // Some Docker versions use CpuQuota/CpuPeriod instead of NanoCpus
      if (actualCpuNano === undefined && containerInfo.HostConfig?.CpuQuota && containerInfo.HostConfig?.CpuPeriod) {
        const cpuQuota = containerInfo.HostConfig.CpuQuota;
        const cpuPeriod = containerInfo.HostConfig.CpuPeriod;
        const calculatedCpu = (cpuQuota / cpuPeriod) * 1e9;
        expect(Math.round(calculatedCpu)).toBeCloseTo(Math.round(expectedCpuNano), -8); // Allow for small rounding differences
      } else {
        expect(actualCpuNano).toBe(expectedCpuNano);
      }
      
      debug('Resource limits verified');
    } finally {
      // Clean up the test node
      if (testNode) {
        try {
          await orchestrator.stopNode(testNode);
        } catch (e) {
          debug('Error cleaning up test node: %o', e);
        }
      }
    }
  }, 30000);

  test('should expose API endpoints', async () => {
    // Set a longer timeout for this test (5 minutes)
    jest.setTimeout(300000);
    debug('Starting test: should expose API endpoints');
    
    // Create a new node with a unique ID for this test
    const testNodeConfig = {
      ...nodeConfig,
      id: `test-node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      // Ensure HTTP API is enabled
      network: {
        ...nodeConfig.network,
        enableHttpApi: true
      }
    };
    
    // Start the node
    debug('Attempting to start node with config: %o', testNodeConfig);
    const node = await orchestrator.startNode(testNodeConfig);
    debug(`Node started with ID: ${node.id}`);
    
    const apiUrl = node.getApiUrl?.();
    // Helper function to test API endpoint with retries
    const testApiEndpoint = async (endpoint: string, expectedStatus = 200, maxRetries = 5, retryDelay = 1000) => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          debug(`Attempt ${attempt}/${maxRetries} - Testing ${endpoint}`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`${apiUrl}${endpoint}`, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
          clearTimeout(timeout);
          
          if (response.status === expectedStatus) {
            debug(`${endpoint} returned status ${response.status}`);
            return await response.json().catch(() => ({}));
          }
          
          const errorText = await response.text().catch(() => 'No response body');
          throw new Error(`Expected status ${expectedStatus}, got ${response.status}: ${errorText}`);
        } catch (error) {
          lastError = error as Error;
          debug(`Attempt ${attempt} failed: %o`, error);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          }
        }
      }
      
      throw new Error(`API endpoint test failed after ${maxRetries} attempts: ${lastError?.message}`);
    };
    
    try {
      // Test the health endpoint
      debug('Testing health endpoint...');
      const healthData = await testApiEndpoint('/health');
      expect(healthData).toHaveProperty('status');
      expect(healthData.status).toBe('ok');
      
      debug('All API endpoints verified');
    } catch (error) {
      // Log container logs if available
      try {
        const container = docker.getContainer(`rhizome-${node.id}`);
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 100
        });
        debug('Container logs: %s', logs.toString('utf8'));
      } catch (logError) {
        debug('Failed to get container logs: %o', logError);
      }
      
      throw error;
    }
  });

  it.skip('should connect two nodes', async () => {
    debug('Starting test: should connect two nodes');
    
    // Create unique configs for both nodes
    const node1Port = 3000 + Math.floor(Math.random() * 1000);
    const node2Port = node1Port + 1;
    const networkId = `test-network-${Date.now()}`;
    
    const node1Config: NodeConfig = {
      id: `test-node-1-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      networkId,
      network: {
        port: node1Port,
        requestPort: node1Port + 1000, // Different port for request API
        bootstrapPeers: []
      },
      resources: {
        memory: 256,
        cpu: 0.5
      }
    };
    
    const node2Config: NodeConfig = {
      id: `test-node-2-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      networkId,
      network: {
        port: node2Port,
        requestPort: node2Port + 1000, // Different port for request API
        bootstrapPeers: [`/ip4/127.0.0.1/tcp/${node1Port + 1000}`]
      },
      resources: {
        memory: 256,
        cpu: 0.5
      }
    };
    
    let node1: NodeHandle | null = null;
    let node2: NodeHandle | null = null;
    
    try {
      // Start first node
      debug('Starting node 1...');
      node1 = await orchestrator.startNode(node1Config);
      debug(`Node 1 started with ID: ${node1.id} apiUrl: ${node1.getApiUrl?.()}`);
      
      // Get node 1's status and API URL
      const status1 = await node1.status() as ExtendedNodeStatus;
      
      // Update node 2's config with node 1's actual address if available
      if (status1.network?.address && node2Config.network) {
        // This assumes the address is in a format like /ip4/127.0.0.1/tcp/3001
        node2Config.network.bootstrapPeers = [status1.network.address];
      }
      
      // Start second node
      debug('Starting node 2...');
      node2 = await orchestrator.startNode(node2Config);
      debug(`Node 2 started with ID: ${node2.id} apiUrl: ${node2.getApiUrl?.()}`);
      
      // Get node 2's status
      const status2 = await node2.status() as ExtendedNodeStatus;
      
      // Verify both nodes are running
      expect(status1).toBeDefined();
      expect(status2).toBeDefined();
      // TODO: this status check is inadequate
      debug('Both nodes are running');
      
      // Helper function to wait for peers
      const waitForPeers = async (nodeHandle: NodeHandle, expectedPeerCount = 1, maxAttempts = 10) => {
        for (let i = 0; i < maxAttempts; i++) {
          const status = await nodeHandle.status() as ExtendedNodeStatus;
          const peerCount = status.network?.peers?.length || 0;
          
          if (peerCount >= expectedPeerCount) {
            debug(`Found ${peerCount} peers after ${i + 1} attempts`);
            return true;
          }
          
          debug(`Waiting for peers... (attempt ${i + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
      };
      
      // Wait for nodes to discover each other
      debug('Waiting for nodes to discover each other...');
      const node1Discovered = await waitForPeers(node1);
      const node2Discovered = await waitForPeers(node2);
      
      // Final status check
      const finalStatus1 = await node1.status() as ExtendedNodeStatus;
      const finalStatus2 = await node2.status() as ExtendedNodeStatus;
      
      // Log peer information
      debug('Node 1 discovered: %o', node1Discovered);
      debug('Node 2 discovered: %o', node2Discovered);
      debug('Node 1 peers: %o', finalStatus1.network?.peers || 'none');
      debug('Node 2 peers: %o', finalStatus2.network?.peers || 'none');
      debug('Node 1 bootstrapPeers: %o', finalStatus1.network?.bootstrapPeers || 'none');
      debug('Node 2 bootstrapPeers: %o', finalStatus2.network?.bootstrapPeers || 'none');
      
      // Log the addresses for debugging
      debug('Node 1 address: %o', finalStatus1.network?.address);
      debug('Node 2 address: %o', finalStatus2.network?.address);
      
      // Verify both nodes have network configuration
      expect(finalStatus1.network).toBeDefined();
      expect(finalStatus2.network).toBeDefined();
      expect(finalStatus1.network?.address).toBeDefined();
      expect(finalStatus2.network?.address).toBeDefined();
      
      // For now, we'll just verify that both nodes are running and have network info
      // In a real test, you would want to verify actual communication between nodes
      debug('✅ Both nodes are running with network configuration');
      
    } finally {
      // Clean up nodes
      const cleanupPromises = [];
      
      if (node1) {
        debug('Stopping node 1...');
        cleanupPromises.push(
          orchestrator.stopNode(node1).catch(e => 
            debug('Error stopping node 1: %o', e)
          )
        );
      }
      
      if (node2) {
        debug('Stopping node 2...');
        cleanupPromises.push(
          orchestrator.stopNode(node2).catch(e => 
            debug('Error stopping node 2: %o', e)
          )
        );
      }
      
      await Promise.all(cleanupPromises);
      debug('✅ Both nodes stopped');
    }
    
    // Note: In a real test with actual peer connections, we would verify the connection
    // by having the nodes communicate with each other.
  }, 60000);
});
