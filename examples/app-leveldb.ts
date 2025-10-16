import Debug from 'debug';
import {BasicCollection, Entity, RhizomeNode} from '../src';
import {LevelDBDeltaStorage} from '../src/storage';
const debug = Debug('rz:example-leveldb');

/**
 * Example app demonstrating LevelDB persistent storage
 * 
 * This example shows how to:
 * - Configure a RhizomeNode to use LevelDB storage
 * - Perform CRUD operations that persist across restarts
 * - Query storage directly for analytics
 * - Check storage statistics
 */

type User = {
  id?: string;
  name: string;
  email?: string;
  age: number;
};

(async () => {
  debug('Starting LevelDB example app...');

  // Configure node with LevelDB storage
  const rhizomeNode = new RhizomeNode({
    peerId: 'leveldb-example-node',
    creator: 'example-creator',
    httpEnable: true,
    httpPort: 3000,
    storage: {
      type: 'leveldb',
      path: './data/example-leveldb'
    }
  });

  // Ensure storage is open
  const levelStorage = rhizomeNode.deltaStorage as LevelDBDeltaStorage;
  await levelStorage.open();
  debug('LevelDB storage opened successfully');

  // Enable HTTP API
  rhizomeNode.httpServer.httpApi.serveHyperview();

  // Set up user collection
  const users = new BasicCollection("user");
  users.rhizomeConnect(rhizomeNode);

  // Register event handlers
  users.onCreate((u: Entity) => {
    debug('New user created:', { id: u.id, ...u.properties });
  });

  users.onUpdate((u: Entity) => {
    debug('User updated:', { id: u.id, ...u.properties });
  });

  // Start the node
  await rhizomeNode.start();
  debug('Node started. HTTP API available at:', `http://${rhizomeNode.config.httpAddr}:${rhizomeNode.config.httpPort}/api`);

  // Check storage stats before operations
  {
    const statsBefore = await rhizomeNode.getStorageStats();
    debug('Storage stats before operations:', {
      totalDeltas: statsBefore.totalDeltas,
      totalEntities: statsBefore.totalEntities,
      oldestDelta: statsBefore.oldestDelta,
      newestDelta: statsBefore.newestDelta
    });
  }

  // Create some users
  debug('\n--- Creating users ---');
  
  const alice: User = {
    id: 'alice-1',
    name: 'Alice',
    email: 'alice@example.com',
    age: 30
  };

  const bob: User = {
    id: 'bob-1',
    name: 'Bob',
    email: 'bob@example.com',
    age: 25
  };

  // Put Alice
  {
    const result = await users.put(undefined, alice);
    debug('Created Alice:', { id: result.id, ...result.properties });
  }

  // Put Bob
  {
    const result = await users.put(undefined, bob);
    debug('Created Bob:', { id: result.id, ...result.properties });
  }

  // Small delay to ensure writes are processed
  await new Promise(resolve => setTimeout(resolve, 100));

  // Read back the users
  debug('\n--- Reading users ---');
  
  {
    const aliceResolved = users.resolve('alice-1');
    if (aliceResolved) {
      debug('Retrieved Alice:', { id: aliceResolved.id, ...aliceResolved.properties });
    } else {
      debug('ERROR: Could not retrieve Alice');
    }

    const bobResolved = users.resolve('bob-1');
    if (bobResolved) {
      debug('Retrieved Bob:', { id: bobResolved.id, ...bobResolved.properties });
    } else {
      debug('ERROR: Could not retrieve Bob');
    }
  }

  // Update Alice's age
  debug('\n--- Updating Alice ---');
  {
    const updateResult = await users.put('alice-1', { age: 31 });
    debug('Updated Alice age:', { id: updateResult.id, ...updateResult.properties });
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  // Query storage directly
  debug('\n--- Querying storage ---');
  {
    // Get all deltas for Alice
    const aliceDeltas = await rhizomeNode.deltaStorage.getDeltasForEntity('alice-1');
    debug(`Alice has ${aliceDeltas.length} deltas in storage`);

    // Query by creator
    const myDeltas = await rhizomeNode.deltaStorage.queryDeltas({ 
      creator: rhizomeNode.config.creator 
    });
    debug(`Total deltas created by me: ${myDeltas.length}`);

    // Query with pagination
    const firstTwo = await rhizomeNode.deltaStorage.queryDeltas({ 
      limit: 2 
    });
    debug(`First 2 deltas:`, firstTwo.map(d => ({ id: d.id, creator: d.creator })));
  }

  // Check final storage stats
  debug('\n--- Final storage statistics ---');
  {
    const statsAfter = await rhizomeNode.getStorageStats();
    debug('Storage stats after operations:', {
      totalDeltas: statsAfter.totalDeltas,
      totalEntities: statsAfter.totalEntities,
      oldestDelta: statsAfter.oldestDelta ? new Date(statsAfter.oldestDelta).toISOString() : 'N/A',
      newestDelta: statsAfter.newestDelta ? new Date(statsAfter.newestDelta).toISOString() : 'N/A'
    });
  }

  // Get all user IDs
  debug('\n--- All users in collection ---');
  {
    const allUserIds = users.getIds();
    debug('User IDs:', allUserIds);
  }

  debug('\n--- Example completed ---');
  debug('Data is persisted to disk at: ./data/example-leveldb');
  debug('Restart this app to see data reload from disk!');
  debug('HTTP API running at: http://localhost:3000/api/user');
  debug('\nPress Ctrl+C to stop...');

  // Handle graceful shutdown
  const shutdown = async () => {
    debug('\nShutting down...');
    await rhizomeNode.stop();
    debug('Node stopped, storage closed');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

})().catch(error => {
  console.error('Error running example:', error);
  process.exit(1);
});

