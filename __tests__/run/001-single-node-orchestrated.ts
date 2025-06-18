import { createOrchestrator, type NodeConfig } from '../../src/orchestration';

// Increase test timeout to 30 seconds
jest.setTimeout(30000);

describe('Run (Orchestrated)', () => {
  const orchestrator = createOrchestrator('in-memory');
  let nodeHandle: any;
  let apiUrl: string;

  beforeAll(async () => {
    console.time('Test setup');
    console.time('Create config');
    // Configure and start the node
    const config: NodeConfig = {
      id: 'app-001',
    };
    console.timeEnd('Create config');

    console.time('Start node');
    nodeHandle = await orchestrator.startNode(config);
    console.timeEnd('Start node');

    console.time('Get API URL');
    apiUrl = nodeHandle.getApiUrl();
    console.timeEnd('Get API URL');
    console.timeEnd('Test setup');
  }, 60000); // Increase timeout to 60s for this hook

  afterAll(async () => {
    // Stop the node
    if (nodeHandle) {
      await orchestrator.stopNode(nodeHandle);
    }
  });

  it('can put a new user and fetch it', async () => {
    // Create a new record
    const createResponse = await fetch(`${apiUrl}/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'peon-1',
        properties: {
          name: 'Peon',
          age: 263,
        },
      }),
    });

    const createdUser = await createResponse.json();
    expect(createdUser).toMatchObject({
      id: 'peon-1',
      properties: {
        name: 'Peon',
        age: 263,
      },
    });

    // Read the created record
    const getResponse = await fetch(`${apiUrl}/user/peon-1`);
    const fetchedUser = await getResponse.json();
    
    expect(fetchedUser).toMatchObject({
      id: 'peon-1',
      properties: {
        name: 'Peon',
        age: 263,
      },
    });
  });
});
