import Debug from 'debug';
import { createOrchestrator } from '../../src/orchestration';
import type { NodeConfig, NodeHandle } from '../../src/orchestration';

// Increase test timeout to 30 seconds
jest.setTimeout(30000);

const debug = Debug('test:two-orchestrated');

describe('Run (Two Nodes Orchestrated)', () => {
  const orchestrator = createOrchestrator('in-memory');
  // Define a type that includes all required methods
  type FullNodeHandle = NodeHandle & {
    getRequestPort: () => number;
    getApiUrl: () => string;
  };
  
  const nodes: FullNodeHandle[] = [];
  const nodeIds = ['app-002-A', 'app-002-B'];

  beforeAll(async () => {
    
    // Start first node
    const node1Config: NodeConfig = {
      id: nodeIds[0],
    };
    const node1 = (await orchestrator.startNode(node1Config)) as FullNodeHandle;

    // Start second node with first node as bootstrap peer
    const node2Config: NodeConfig = {
      id: nodeIds[1],
      network: {
        bootstrapPeers: [`localhost:${node1.getRequestPort()}`],
      },
    };
    const node2 = (await orchestrator.startNode(node2Config)) as FullNodeHandle;

    nodes.push(node1, node2);

    // Connect the nodes
    await orchestrator.connectNodes(node1, node2);
  }, 120000); // Increase timeout to 120s for this hook

  afterAll(async () => {
    // Stop all nodes in parallel
    await Promise.all(nodes.map(node => node && orchestrator.stopNode(node)));
  });

  it('can create a record on node0 and read it from node1', async () => {
    const [node0, node1] = nodes;
    const node0Url = node0.getApiUrl();
    const node1Url = node1.getApiUrl();

    debug(`Node 0 URL: ${node0Url}`);
    debug(`Node 1 URL: ${node1Url}`);

    // Create a new record on node0
    const createResponse = await fetch(`${node0Url}/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'peon-1',
        properties: {
          name: 'Peon',
          age: 741,
        },
      }),
    });

    const createdUser = await createResponse.json();
    expect(createdUser).toMatchObject({
      id: 'peon-1',
      properties: {
        name: 'Peon',
        age: 741,
      },
    });

    // Small delay to allow for synchronization
    await new Promise(resolve => setTimeout(resolve, 100));

    // Read the record from node1
    const getResponse = await fetch(`${node1Url}/user/peon-1`);
    const fetchedUser = await getResponse.json();
    
    expect(fetchedUser).toMatchObject({
      id: 'peon-1',
      properties: {
        name: 'Peon',
        age: 741,
      },
    });
  });

  it.skip('can demonstrate network partitioning', async () => {
    // This test shows how we can simulate network partitions
    // For now, it's just a placeholder since we'd need to implement
    // the actual partitioning logic in the InMemoryOrchestrator
    const [node0, node1] = nodes;
    
    // Simulate partition (actual implementation would use orchestrator.partitionNetwork)
    debug('Simulating network partition between nodes');
    // await orchestrator.partitionNetwork({
    //   groups: [[node0.id], [node1.id]]
    // });
    
    // Test behavior during partition...
    
    // Heal partition
    // await orchestrator.partitionNetwork({
    //   groups: [[node0.id, node1.id]]
    // });
    
    // Test behavior after healing...
    
    // Mark test as passed (remove once actual test is implemented)
    expect(true).toBe(true);
  });
});
