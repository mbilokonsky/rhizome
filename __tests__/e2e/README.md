# End-to-End Tests

This directory contains end-to-end tests for Rhizome nodes, testing the full system behavior including HTTP APIs, data persistence, and peer-to-peer synchronization.

## Test Patterns

### Manual Node Setup (001-single-node.test.ts, 002-two-nodes.test.ts)

These tests manually instantiate `App` instances (which extend `RhizomeNode`) with explicit port configurations. They directly manage the node lifecycle using `app.start()` and `app.stop()`.

**Example:**
```typescript
app = new App({
  httpPort: 5000,
  httpEnable: true,
  requestBindPort: 5001,
  publishBindPort: 5002,
  peerId: 'app-001',
});
await app.start();
```

**Pros:**
- Direct control over node configuration
- Simpler debugging of node internals
- Faster test execution

**Cons:**
- More verbose setup code
- Port management is manual
- No process isolation

### Orchestrated Node Setup (*-orchestrated.test.ts, 005-docker-orchestrator.test.ts)

These tests use the orchestration framework to manage node lifecycle, which provides abstraction over node creation and can support different deployment strategies (in-memory, Docker, etc.).

**Example:**
```typescript
const orchestrator = createOrchestrator('in-memory');
const nodeHandle = await orchestrator.startNode({ id: 'app-001' });
const apiUrl = nodeHandle.getApiUrl();
```

**Pros:**
- Better abstraction and isolation
- Can test different deployment strategies
- More production-like setup
- Automatic port management

**Cons:**
- More complex setup
- Potentially slower
- Additional layer of indirection

## Test Files

### 001-single-node.test.ts
**Purpose:** Validates basic CRUD operations on a single Rhizome node.

**Tests:**
- Creating a new user via PUT `/user`
- Fetching the created user via GET `/user/:id`
- Verifying the user appears in the index via GET `/user/ids`

**Key Aspects:**
- Uses manual node setup
- Tests HTTP API endpoints
- Verifies basic data persistence
- Includes a 100ms delay for optimistic update (TODO: remove when optimistic updates are implemented)

### 001-single-node-orchestrated.test.ts
**Purpose:** Same functionality as `001-single-node.test.ts` but using the orchestration framework.

**Key Differences:**
- Uses `createOrchestrator('in-memory')` for node management
- Demonstrates the orchestration API pattern
- Has extended timeout (30s) for orchestration setup

### 002-two-nodes.test.ts
**Purpose:** Tests peer-to-peer synchronization between two Rhizome nodes.

**Tests:**
- Creating a record on node A
- Reading the same record from node B
- Verifying both nodes have the record in their indexes

**Key Aspects:**
- Configures seed peers to establish P2P connection:
  ```typescript
  apps[0].config.seedPeers.push(apps[1].myRequestAddr);
  apps[1].config.seedPeers.push(apps[0].myRequestAddr);
  ```
- Demonstrates delta synchronization across the network
- Tests eventual consistency

### 002-two-nodes-orchestrated.test.ts
**Purpose:** Same as `002-two-nodes.test.ts` but using orchestration framework.

### 005-docker-orchestrator.test.ts
**Purpose:** Tests the Docker orchestration strategy for running Rhizome nodes in containers.

**Key Aspects:**
- Uses `createOrchestrator('docker')` to spawn actual Docker containers
- Tests the most production-like deployment scenario
- Requires Docker to be running on the host

## Running the Tests

### All E2E Tests
```bash
npm test -- __tests__/e2e
```

### Specific Test File
```bash
npm test -- __tests__/e2e/001-single-node.test.ts
```

### With Debug Output
```bash
DEBUG=rz:* npm test -- __tests__/e2e
```

### Docker Tests Only
```bash
npm test -- __tests__/e2e/005-docker-orchestrator.test.ts
```
**Note:** Requires Docker daemon to be running.

## Common Patterns

### The App Test Helper

All manual tests use the `App` helper class from `util/app.ts`:

```typescript
export class App extends RhizomeNode {
  apiUrl: string;
  
  constructor(config?: Partial<RhizomeNodeConfig>) {
    super({
      publishBindPort: getRandomPort(),
      requestBindPort: getRandomPort(),
      httpPort: getRandomPort(),
      ...config,
    });
    
    const users = new BasicCollection("user");
    users.rhizomeConnect(this);
    
    this.apiUrl = `http://${httpAddr}:${httpPort}/api`;
  }
}
```

**Features:**
- Randomizes ports to avoid collisions between test runs
- Pre-configures a `user` collection
- Exposes a convenient `apiUrl` property for HTTP testing

### Waiting for Consistency

Current tests include a 100ms delay after writes to allow for eventual consistency:

```typescript
// TODO: Optimistic update and remove this delay
await new Promise((resolve) => setTimeout(resolve, 100));
```

This should be replaced with optimistic update support in the future.

## Known Issues / TODOs

1. **Optimistic Updates:** Tests currently use artificial delays. Should implement optimistic update patterns to eliminate these delays.

2. **Port Collisions:** While ports are randomized, there's still potential for collisions in parallel test runs. Consider using port allocation libraries or sequential test execution.

3. **Test Timeouts:** Orchestrated tests have extended timeouts (30-60s). May need optimization of orchestration startup time.

## Adding New E2E Tests

When adding new E2E tests, consider:

1. **Naming Convention:** Use numeric prefixes (001-, 002-, etc.) to indicate test complexity/dependency order
2. **Test Both Patterns:** Consider implementing both manual and orchestrated versions if testing core functionality
3. **Use Debug Logging:** Add debug statements with namespace `Debug('rz:test:yourtest')`
4. **Cleanup:** Ensure `afterAll` hooks properly clean up resources
5. **Isolation:** Each test should be runnable independently

## Architecture Under Test

These E2E tests validate the complete Rhizome stack:

- **HTTP API Layer** (`src/http/`)
- **Collection Management** (`src/collections/`)
- **Delta Synchronization** (`src/core/delta.ts`)
- **Storage Layer** (`src/storage/`)
- **P2P Networking** (`src/network/`)
- **Orchestration Framework** (`src/orchestration/`)

For unit tests of individual components, see `__tests__/unit/`.
For integration tests of subsystems, see `__tests__/integration/`.

