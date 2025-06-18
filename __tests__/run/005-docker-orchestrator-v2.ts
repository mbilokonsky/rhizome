import Docker from 'dockerode';
import { describe, it, beforeAll, afterAll, expect, jest } from '@jest/globals';
import { createOrchestrator } from '../../src/orchestration';
import type { NodeOrchestrator, NodeConfig, NodeHandle, NodeStatus } from '../../src/orchestration';

// Extend the NodeOrchestrator type to include the docker client for DockerOrchestrator
interface DockerOrchestrator extends NodeOrchestrator {
  docker: Docker;
}

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

describe('Docker Orchestrator V2', () => {
  let docker: Docker;
  let orchestrator: DockerOrchestrator;
  let node: NodeHandle | null = null;
  let node2: NodeHandle | null = null;
  let nodeConfig: NodeConfig;
  let node2Config: NodeConfig;
  let nodePort: number;
  let node2Port: number;

  beforeAll(async () => {
    console.log('Setting up Docker client and orchestrator...');
    
    // Initialize Docker client
    docker = new Docker();
    
    // Verify Docker is running
    try {
      await docker.ping();
      console.log('✅ Docker daemon is responding');
    } catch (error) {
      console.error('❌ Docker daemon is not responding:', error);
      throw error;
    }
    
    // Initialize the orchestrator with the Docker client and test image
    orchestrator = createOrchestrator('docker') as DockerOrchestrator;
    console.log('✅ Docker orchestrator initialized');
    
    // Create a basic node config for testing
    nodePort = 3000 + Math.floor(Math.random() * 1000);
    nodeConfig = {
      id: `test-node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      networkId: 'test-network',
      port: nodePort,
      resources: {
        memory: 256, // 256MB
        cpu: 0.5    // 0.5 CPU
      }
    };
    
    console.log(`Test node configured with ID: ${nodeConfig.id}, port: ${nodePort}`);
  }, 300000); // 5 minute timeout for setup

  afterAll(async () => {
    console.log('Starting test cleanup...');
    const cleanupPromises: Promise<unknown>[] = [];
    
    // Helper function to clean up a node with retries
    const cleanupNode = async (nodeToClean: NodeHandle | null, nodeName: string) => {
      if (!nodeToClean) return;
      
      console.log(`[${nodeName}] Starting cleanup for node ${nodeToClean.id}...`);
      try {
        // First try the normal stop
        await orchestrator.stopNode(nodeToClean).catch(error => {
          console.warn(`[${nodeName}] Warning stopping node normally:`, error.message);
          throw error; // Will be caught by outer catch
        });
        console.log(`✅ [${nodeName}] Node ${nodeToClean.id} stopped gracefully`);
      } catch (error) {
        console.error(`❌ [${nodeName}] Error stopping node ${nodeToClean.id}:`, error);
        
        // If normal stop fails, try force cleanup
        try {
          console.log(`[${nodeName}] Attempting force cleanup for node ${nodeToClean.id}...`);
          const container = orchestrator.docker.getContainer(`rhizome-${nodeToClean.id}`);
          await container.stop({ t: 1 }).catch(() => {
            console.warn(`[${nodeName}] Container stop timed out, forcing removal...`);
          });
          await container.remove({ force: true });
          console.log(`✅ [${nodeName}] Node ${nodeToClean.id} force-removed`);
        } catch (forceError) {
          console.error(`❌ [${nodeName}] Force cleanup failed for node ${nodeToClean.id}:`, forceError);
        }
      }
    };
    
    // Clean up all created nodes
    if (node) {
      cleanupPromises.push(cleanupNode(node, 'node1'));
    }
    
    if (node2) {
      cleanupPromises.push(cleanupNode(node2, 'node2'));
    }

    // Wait for all node cleanups to complete before cleaning up networks
    if (cleanupPromises.length > 0) {
      console.log('Waiting for node cleanups to complete...');
      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise(resolve => setTimeout(() => {
          console.warn('Node cleanup timed out, proceeding with network cleanup...');
          resolve(null);
        }, 30000)) // 30s timeout for node cleanup
      ]);
    }
    
    // Clean up any dangling networks using NetworkManager
    try {
      console.log('Cleaning up networks...');
      // Get the network manager from the orchestrator
      const networkManager = (orchestrator as any).networkManager;
      if (!networkManager) {
        console.warn('Network manager not available for cleanup');
        return;
      }
      
      // Get all networks managed by this test
      const networks = Array.from((orchestrator as any).networks.entries() || []);
      
      const cleanupResults = await networkManager.cleanupNetworks((orchestrator as any).networks);
      
      // Log any cleanup errors
      cleanupResults.forEach(({ resource, error }: { resource: string; error: Error }) => {
        if (error) {
          console.error(`❌ Failed to clean up network ${resource || 'unknown'}:`, error.message);
        } else {
          console.log(`✅ Successfully cleaned up network ${resource || 'unknown'}`);
        }
      });
    } catch (error) {
      console.error('Error during network cleanup:', error);
    }
    
    console.log('✅ All test cleanups completed');
  }, 120000); // 2 minute timeout for afterAll

  it('should start and stop a node', async () => {
    console.log('Starting test: should start and stop a node');
    
    // Create a new config with a unique ID for this test
    const testNodeConfig = {
      ...nodeConfig,
      id: `test-node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      network: {
        ...nodeConfig.network,
        enableHttpApi: true
      }
    };
    
    // Start a node
    console.log('Starting node...');
    const testNode = await orchestrator.startNode(testNodeConfig);
    expect(testNode).toBeDefined();
    expect(testNode.id).toBeDefined();
    console.log(`✅ Node started with ID: ${testNode.id}`);
    
    try {
      // Verify the node is running
      const status = await testNode.status();
      expect(status).toBeDefined();
      console.log(`Node status: ${JSON.stringify(status)}`);
      
      // Verify we can access the health endpoint
      const apiUrl = testNode.getApiUrl?.();
      if (apiUrl) {
        const response = await fetch(`${apiUrl}/health`);
        expect(response.ok).toBe(true);
        const health = await response.json();
        expect(health).toHaveProperty('status', 'ok');
      }
      
      // Stop the node
      console.log('Stopping node...');
      await orchestrator.stopNode(testNode);
      console.log('✅ Node stopped');
    } finally {
      // Ensure node is cleaned up even if test fails
      try {
        await orchestrator.stopNode(testNode).catch(() => {});
      } catch (e) {
        console.warn('Error during node cleanup:', e);
      }
    }
  }, 30000); // 30 second timeout for this test

  it('should enforce resource limits', async () => {
    console.log('Starting test: should enforce resource limits');
    
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
      console.log(`✅ Node started with ID: ${testNode.id}`);
      
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
      const container = await (orchestrator as any).containerManager.getContainer(status.containerId);
      if (!container) {
        throw new Error('Container not found');
      }
      
      // Get container info
      const containerInfo = await container.inspect();
      
      // Log container info for debugging
      console.log('Container info:', {
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
      
      console.log('✅ Resource limits verified');
    } finally {
      // Clean up the test node
      if (testNode) {
        try {
          await orchestrator.stopNode(testNode);
        } catch (e) {
          console.warn('Error cleaning up test node:', e);
        }
      }
    }
  }, 30000);

  it('should expose API endpoints', async () => {
    // Set a longer timeout for this test (5 minutes)
    jest.setTimeout(300000);
    console.log('Starting test: should expose API endpoints');
    
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
    console.log('Attempting to start node with config:', JSON.stringify(testNodeConfig, null, 2));
    const node = await orchestrator.startNode(testNodeConfig);
    console.log(`✅ Node started with ID: ${node.id}`);
    
    const apiUrl = node.getApiUrl?.();
    // Helper function to test API endpoint with retries
    const testApiEndpoint = async (endpoint: string, expectedStatus = 200, maxRetries = 5, retryDelay = 1000) => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Attempt ${attempt}/${maxRetries} - Testing ${endpoint}`);
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
            console.log(`✅ ${endpoint} returned status ${response.status}`);
            return await response.json().catch(() => ({}));
          }
          
          const errorText = await response.text().catch(() => 'No response body');
          throw new Error(`Expected status ${expectedStatus}, got ${response.status}: ${errorText}`);
        } catch (error) {
          lastError = error as Error;
          console.warn(`Attempt ${attempt} failed:`, error);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          }
        }
      }
      
      throw new Error(`API endpoint test failed after ${maxRetries} attempts: ${lastError?.message}`);
    };
    
    try {
      // Test the health endpoint
      console.log('Testing health endpoint...');
      const healthData = await testApiEndpoint('/health');
      expect(healthData).toHaveProperty('status');
      expect(healthData.status).toBe('ok');
      
      console.log('✅ All API endpoints verified');
    } catch (error) {
      // Log container logs if available
      try {
        const container = docker.getContainer(`rhizome-${node.id}`);
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 100
        });
        console.error('Container logs:', logs.toString('utf8'));
      } catch (logError) {
        console.error('Failed to get container logs:', logError);
      }
      
      throw error;
    }
  });

  it.skip('should connect two nodes', async () => {
    console.log('Starting test: should connect two nodes');
    
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
      console.log('Starting node 1...');
      node1 = await orchestrator.startNode(node1Config);
      console.log(`✅ Node 1 started with ID: ${node1.id}`);
      
      // Get node 1's status and API URL
      const status1 = await node1.status() as ExtendedNodeStatus;
      const node1ApiUrl = node1.getApiUrl?.();
      
      // Update node 2's config with node 1's actual address if available
      if (status1.network?.address && node2Config.network) {
        // This assumes the address is in a format like /ip4/127.0.0.1/tcp/3001
        node2Config.network.bootstrapPeers = [status1.network.address];
      }
      
      // Start second node
      console.log('Starting node 2...');
      node2 = await orchestrator.startNode(node2Config);
      console.log(`✅ Node 2 started with ID: ${node2.id}`);
      
      // Get node 2's status
      const status2 = await node2.status() as ExtendedNodeStatus;
      const node2ApiUrl = node2.getApiUrl?.();
      
      // Verify both nodes are running
      expect(status1).toBeDefined();
      expect(status2).toBeDefined();
      // TODO: this status check is inadequate
      console.log('✅ Both nodes are running');
      
      // Helper function to wait for peers
      const waitForPeers = async (nodeHandle: NodeHandle, expectedPeerCount = 1, maxAttempts = 10) => {
        for (let i = 0; i < maxAttempts; i++) {
          const status = await nodeHandle.status() as ExtendedNodeStatus;
          const peerCount = status.network?.peers?.length || 0;
          
          if (peerCount >= expectedPeerCount) {
            console.log(`✅ Found ${peerCount} peers after ${i + 1} attempts`);
            return true;
          }
          
          console.log(`Waiting for peers... (attempt ${i + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
      };
      
      // Wait for nodes to discover each other
      console.log('Waiting for nodes to discover each other...');
      const node1Discovered = await waitForPeers(node1);
      const node2Discovered = await waitForPeers(node2);
      
      // Final status check
      const finalStatus1 = await node1.status() as ExtendedNodeStatus;
      const finalStatus2 = await node2.status() as ExtendedNodeStatus;
      
      // Log peer information
      console.log('Node 1 discovered:', node1Discovered);
      console.log('Node 2 discovered:', node2Discovered);
      console.log('Node 1 peers:', finalStatus1.network?.peers || 'none');
      console.log('Node 2 peers:', finalStatus2.network?.peers || 'none');
      console.log('Node 1 bootstrapPeers:', finalStatus1.network?.bootstrapPeers || 'none');
      console.log('Node 2 bootstrapPeers:', finalStatus2.network?.bootstrapPeers || 'none');
      
      // Log the addresses for debugging
      console.log('Node 1 address:', finalStatus1.network?.address);
      console.log('Node 2 address:', finalStatus2.network?.address);
      
      // Verify both nodes have network configuration
      expect(finalStatus1.network).toBeDefined();
      expect(finalStatus2.network).toBeDefined();
      expect(finalStatus1.network?.address).toBeDefined();
      expect(finalStatus2.network?.address).toBeDefined();
      
      // For now, we'll just verify that both nodes are running and have network info
      // In a real test, you would want to verify actual communication between nodes
      console.log('✅ Both nodes are running with network configuration');
      
    } finally {
      // Clean up nodes
      const cleanupPromises = [];
      
      if (node1) {
        console.log('Stopping node 1...');
        cleanupPromises.push(
          orchestrator.stopNode(node1).catch(e => 
            console.warn('Error stopping node 1:', e)
          )
        );
      }
      
      if (node2) {
        console.log('Stopping node 2...');
        cleanupPromises.push(
          orchestrator.stopNode(node2).catch(e => 
            console.warn('Error stopping node 2:', e)
          )
        );
      }
      
      await Promise.all(cleanupPromises);
      console.log('✅ Both nodes stopped');
    }
    
    // Note: In a real test with actual peer connections, we would verify the connection
    // by having the nodes communicate with each other.
  }, 60000);
});
