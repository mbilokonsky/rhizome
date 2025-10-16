# Rhizome Examples

This directory contains example applications demonstrating various features of the Rhizome distributed database system.

## Available Examples

### 📚 Recommended Learning Path

If you're new to Rhizome, we recommend this order:

1. **`library-direct-write.ts`** - Learn the core delta writing pattern
2. **`dynamic-schemas.ts`** - Understand schema creation and management
3. **`content-ingestion.ts`** - See a real-world use case
4. **`idea-futures.ts`** - Advanced: Planning and forecasting with multiple futures
5. **`app.ts`** or **`app-leveldb.ts`** - Explore the HTTP API layer (optional)

---

### library-direct-write.ts - Library-First Basics ⭐ **START HERE**
**Purpose:** Learn how to use Rhizome as a library to write deltas directly to storage, without HTTP overhead.

**Features:**
- Direct LevelDB storage access
- Delta creation with DeltaBuilder
- Batch writing patterns
- Hyperview composition
- Schema validation

**Run:**
```bash
npx ts-node examples/library-direct-write.ts
```

**Why Start Here:**
- Minimal complexity (no HTTP, no networking)
- Focuses on core concepts (deltas, storage, hyperview)
- Foundation for all other patterns
- Best performance for bulk operations

**Use Case:** 
- Bulk data imports
- Content ingestion pipelines
- Background processing
- Any scenario where HTTP is unnecessary

---

### dynamic-schemas.ts - Schema Management 📋
**Purpose:** Learn how to create, persist, and evolve schemas dynamically.

**Features:**
- SchemaBuilder API
- Persisting schemas as deltas
- Schema validation
- Schema evolution patterns
- Bootstrap schema system

**Run:**
```bash
npx ts-node examples/dynamic-schemas.ts
```

**Key Concepts:**
- Only 2 hard-coded schemas (bootstrap schemas)
- All app schemas created dynamically
- Schemas stored as deltas in the database
- Full schema history and versioning

**Use Case:**
- Building schema-aware applications
- Schema evolution without code changes
- Distributed schema management

---

### content-ingestion.ts - Real-World Pipeline 🚀
**Purpose:** Complete example of ingesting 5 years of content using the Entity-Transformation-Attribute pattern.

**Features:**
- Content entity schemas (blog posts, videos, tweets)
- Transformation detection (how ideas evolved)
- IdeaRank scoring system (6 dimensions)
- Batch delta writing with BatchDeltaWriter
- Entity-Transformation-Attribute pattern

**Run:**
```bash
npx ts-node examples/content-ingestion.ts
```

**Pattern: Entity-Transformation-Attribute:**
- **Entities:** Content pieces (the what)
- **Transformations:** How ideas changed (the evolution)
- **Attributes:** Properties + computed scores (the metadata)

**IdeaRank Dimensions:**
1. Uniqueness - Novel ideas vs repetition
2. Cohesion - Topic consistency
3. Learning - New concepts over time
4. Quality - Writing/presentation quality
5. Citations - References and trust
6. Density - Ideas per word

**Use Case:**
- Content analysis at scale
- Building knowledge graphs
- Tracking intellectual evolution
- Multi-dimensional scoring systems

---

### idea-futures.ts - Planning & Forecasting 🔮
**Purpose:** Advanced example showing how to use "ideas" as possible future states, find optimal paths, and compare multiple futures.

**Features:**
- Idea as future state (current → target transformation)
- Delta correlation scoring (which actions help reach the goal)
- Pathfinding algorithm (cheapest sequence of deltas)
- Multiple future comparison
- Cost-benefit analysis
- State-based planning

**Run:**
```bash
npx ts-node examples/idea-futures.ts
```

**Core Concept: Idea = Possible Future**

An "Idea" is a predicted end state you want to reach:
- **Current State**: Where you are now (e.g., 100 users, $10k MRR)
- **Target State**: Where you want to be (e.g., 2000 users, $100k MRR)
- **Actions**: Possible deltas that transform state (hire, market, build features)
- **Path**: Optimal sequence of actions to reach the target
- **Cost**: Time, money, and effort required

**Schemas Defined:**
1. **StateSnapshot** - System state at a point in time
2. **Idea** - Links current state → target state
3. **ActionDelta** - Possible action with impacts and costs
4. **DeltaCorrelation** - How much an action helps reach the goal
5. **Path** - Sequence of actions to achieve an idea
6. **PathStep** - One action in a path

**How It Works:**

```typescript
// 1. Define current state
const currentState = {
  revenue: 10000,
  users: 100,
  features: 5
};

// 2. Define target state (the "idea")
const targetState = {
  revenue: 100000,
  users: 2000,
  features: 8
};

// 3. Define possible actions (deltas)
const actions = [
  { name: "Hire Engineer", teamSizeImpact: 1, cost: 10000 },
  { name: "Marketing Campaign", userImpact: 200, cost: 15000 },
  // ...
];

// 4. Compute correlations (which actions help?)
for (const action of actions) {
  const correlation = calculateCorrelation(action, currentState, targetState);
  // Store correlation score
}

// 5. Find optimal path (cheapest sequence)
const path = findOptimalPath(currentState, targetState, actions, correlations);

// 6. Compare multiple possible futures
compareFutures([growthFuture, qualityFuture, bootstrapFuture]);
```

**Example Output:**

```
Future Comparison:
────────────────────────────────────────────────────────────────────────────────
Idea                    | Cost    | Duration | Success | Priority
────────────────────────────────────────────────────────────────────────────────
Growth-Focused Future   |  104000 |      375 |    67.3% | 9
Quality-Focused Future  |   88000 |      285 |    82.1% | 7
Bootstrap Future        |   56000 |      255 |    91.5% | 8
────────────────────────────────────────────────────────────────────────────────
```

**Use Cases:**
- Product roadmap planning
- Resource allocation optimization
- Multi-objective decision making
- Scenario analysis and forecasting
- Strategic planning
- What-if analysis

**Algorithm:**
- Uses greedy pathfinding (can be upgraded to A*, dynamic programming, or ML)
- Scores actions based on correlation/cost ratio
- Simulates state transformations
- Measures success probability

**Advanced Concepts:**
- State-based planning vs task-based planning
- Delta correlation as predictive modeling
- Path optimization with multiple objectives
- Futures as competing hypotheses

---

### app.ts - Basic In-Memory Example
**Purpose:** Demonstrates basic CRUD operations using in-memory storage.

**Features:**
- Default in-memory storage (no persistence)
- Creating and reading entities
- Collection management
- Event handlers (onCreate, onUpdate)
- HTTP API access

**Run:**
```bash
npm run build
npm run example-app
```

**Use Case:** Good for testing, development, or when persistence isn't needed.

---

### app-leveldb.ts - Persistent Storage Example
**Purpose:** Demonstrates LevelDB persistent storage with full CRUD operations and storage analytics.

**Features:**
- LevelDB persistent storage configuration
- Data persists across restarts
- Direct storage querying and analytics
- Storage statistics (delta count, entity count, timestamps)
- Pagination and filtering examples
- Graceful shutdown with storage cleanup

**Run:**
```bash
npm run build
npm run example-leveldb
```

**Storage Location:** `./data/example-leveldb/`

**Use Case:** Production applications requiring data persistence, distributed systems needing local storage.

**What Gets Stored:**
- All deltas (data changes) are persisted to disk
- Restart the app to see data reload from storage
- Use the HTTP API to query persisted data

**HTTP API Endpoints:**
```bash
# Get all users
curl http://localhost:3000/api/user/ids

# Get specific user
curl http://localhost:3000/api/user/alice-1

# Create/update user (PUT)
curl -X PUT http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -d '{"id":"charlie-1","properties":{"name":"Charlie","age":35}}'
```

---

## Common Patterns

### Setting Up a Node

All examples follow this basic pattern:

```typescript
import { RhizomeNode, BasicCollection } from '../src';

// 1. Create and configure node
const rhizomeNode = new RhizomeNode({
  peerId: 'my-node',
  creator: 'my-creator',
  httpEnable: true,
  httpPort: 3000,
  storage: {
    type: 'leveldb',  // or 'memory'
    path: './data/my-storage'
  }
});

// 2. Set up collections
const users = new BasicCollection("user");
users.rhizomeConnect(rhizomeNode);

// 3. Register event handlers
users.onCreate((entity) => {
  console.log('New entity:', entity);
});

// 4. Start the node
await rhizomeNode.start();

// 5. Use collections
await users.put(undefined, {
  id: 'user-1',
  name: 'Alice',
  age: 30
});

// 6. Query data
const user = users.resolve('user-1');

// 7. Graceful shutdown
await rhizomeNode.stop();
```

### Storage Configuration Options

**Memory Storage (No Persistence):**
```typescript
storage: {
  type: 'memory'
}
```

**LevelDB Storage (Persistent):**
```typescript
storage: {
  type: 'leveldb',
  path: './data/my-database'  // Defaults to './data/deltas'
}
```

**Future Storage Options:**
```typescript
// Coming soon
storage: { type: 'sqlite', path: './data/db.sqlite' }
storage: { type: 'postgres', connectionString: 'postgresql://...' }
```

### Working with Collections

```typescript
// Create a typed collection
type User = {
  id?: string;
  name: string;
  email?: string;
  age: number;
};

const users = new BasicCollection("user");
users.rhizomeConnect(rhizomeNode);

// Create entity
const result = await users.put(undefined, {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
});

// Update entity (partial update)
await users.put('user-1', { age: 31 });

// Read entity
const user = users.resolve('user-1');

// Get all IDs
const allIds = users.getIds();

// Listen for changes
users.onCreate((entity) => console.log('Created:', entity));
users.onUpdate((entity) => console.log('Updated:', entity));
```

### Direct Storage Queries

When using LevelDB or other query-capable storage:

```typescript
// Get all deltas for an entity
const deltas = await rhizomeNode.deltaStorage.getDeltasForEntity('user-1');

// Query by creator
const myDeltas = await rhizomeNode.deltaStorage.queryDeltas({ 
  creator: 'my-creator' 
});

// Query with pagination
const page = await rhizomeNode.deltaStorage.queryDeltas({ 
  limit: 10,
  offset: 20
});

// Count deltas
const count = await rhizomeNode.deltaStorage.countDeltas({ 
  creator: 'my-creator' 
});

// Get statistics
const stats = await rhizomeNode.getStorageStats();
console.log('Total deltas:', stats.totalDeltas);
console.log('Total entities:', stats.totalEntities);
```

### HTTP API Usage

All examples with `httpEnable: true` expose REST endpoints:

```bash
# Create/update entity
PUT /api/{collection}
Body: { "id": "entity-1", "properties": { "key": "value" } }

# Get entity
GET /api/{collection}/{id}

# Get all IDs in collection
GET /api/{collection}/ids

# Get hyperview (entire state)
GET /api/hyperview
```

## Development Workflow

### 1. Make Changes
Edit TypeScript files in `examples/` or `src/`

### 2. Build
```bash
npm run build
```

Or watch mode:
```bash
npm run build:watch
```

### 3. Run Example
```bash
npm run example-app          # In-memory example
npm run example-leveldb      # LevelDB example
```

### 4. Debug
Use DEBUG environment variable:
```bash
DEBUG=rz:* npm run example-leveldb
```

Specific namespaces:
```bash
DEBUG=rz:example-leveldb npm run example-leveldb
DEBUG=rz:storage:* npm run example-leveldb
DEBUG=rz:rhizome-node npm run example-leveldb
```

## Creating Your Own Example

1. Create a new file: `examples/my-example.ts`

2. Follow the common pattern (see above)

3. Add a script to `package.json`:
```json
"example-my-example": "node dist/examples/my-example.js"
```

4. Build and run:
```bash
npm run build
npm run example-my-example
```

## Cleaning Up Storage

### Remove LevelDB Data
```bash
rm -rf ./data/example-leveldb
```

### Remove All Test/Example Data
```bash
rm -rf ./data
rm -rf ./test-data
```

## Tips and Best Practices

### 1. Always Handle Shutdown
```typescript
const shutdown = async () => {
  await rhizomeNode.stop();  // Closes storage properly
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### 2. Wait for Eventual Consistency
After writes, add a small delay before reading:
```typescript
await users.put(undefined, userData);
await new Promise(resolve => setTimeout(resolve, 100));
const user = users.resolve('user-1');
```

### 3. Use Debug Logging
```typescript
import Debug from 'debug';
const debug = Debug('rz:my-example');

debug('Important event:', data);
```

Run with: `DEBUG=rz:my-example npm run example-...`

### 4. Check Storage Stats
```typescript
const stats = await rhizomeNode.getStorageStats();
console.log('Storage health:', stats);
```

### 5. Use TypeScript Types
Define types for your data structures:
```typescript
type MyEntity = {
  id?: string;
  // ... fields
};

const result = await collection.put(undefined, myEntity);
const typed: MyEntity = { id: result.id, ...result.properties };
```

## Troubleshooting

### Port Already in Use
Change the HTTP port:
```typescript
httpPort: 3001  // or any available port
```

### Storage Won't Open
Ensure LevelDB storage is opened:
```typescript
const levelStorage = rhizomeNode.deltaStorage as LevelDBDeltaStorage;
await levelStorage.open();
```

### Data Not Persisting
1. Check storage type is `'leveldb'`, not `'memory'`
2. Verify path exists: `ls -la ./data/example-leveldb`
3. Ensure proper shutdown: `await rhizomeNode.stop()`

### Stale Data After Restart
LevelDB should reload automatically. If not:
1. Check the storage path is correct
2. Verify files exist in the storage directory
3. Check for database corruption

## Next Steps

- Explore the test suite in `__tests__/e2e/` for more examples
- Read the main README for architecture overview
- Check `docs/` for detailed documentation
- Try building a multi-node example with P2P sync

## Related Documentation

- `/Users/leoguinan/rhizome/__tests__/e2e/README.md` - E2E testing patterns
- `/Users/leoguinan/rhizome/__tests__/integration/storage.test.ts` - Storage test examples
- `/Users/leoguinan/rhizome/src/storage/` - Storage implementation details

