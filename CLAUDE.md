# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Work on this project should follow the priorities defined in [todo.md](todo.md) and the specifications in [spec.md](spec.md).

## Project Overview

Rhizome-node is a distributed, peer-to-peer database engine that implements a rhizomatic (decentralized, non-hierarchical) data model. It synchronizes data across multiple nodes without a central authority using immutable "deltas" as the fundamental unit of change. There is a specification for the behavior of this system in [spec.md](spec.md).

## Development Commands

```bash
# Build the TypeScript project
npm run build

# Build in watch mode
npm run build:watch

# Run tests
npm test

# Run a specific test file
npm test -- __tests__/delta.ts

# Run linter
npm run lint

# Generate coverage report
npm run coverage

# Run the example application
npm run example-app
```

## Architecture Overview

### Core Concepts

1. **Deltas**: Immutable change records that describe modifications to entities. Each delta contains:
   - Unique ID and timestamps
   - Creator and host information
   - Pointers defining entity/property relationships
   - DeltaV2 is the current format (DeltaV1 is legacy)

2. **Views**: Different ways to interpret the delta stream:
   - **Hyperview View**: Stores all deltas without conflict resolution
   - **Lossy Views**: Apply conflict resolution (e.g., Last-Write-Wins)
   - Custom resolvers can be implemented

3. **Collections**: Group related entities (similar to database tables)
   - Support typed collections via `TypedCollection<T>`
   - Implement CRUD operations through delta generation

4. **Networking**: Dual transport layer:
   - ZeroMQ for efficient binary communication
   - libp2p for decentralized peer discovery
   - Pub/sub for delta propagation
   - Request/reply for synchronization

### Key Files and Entry Points

- `src/node.ts`: Main `RhizomeNode` class orchestrating all components
- `src/delta.ts`: Delta data structures and conversion logic
- `src/hyperview.ts`: Core hyperview implementation
- `src/collection-basic.ts`: Basic collection implementation
- `src/http/api.ts`: REST API endpoints
- `src/pub-sub.ts`: Network communication layer

### Testing Patterns

- Unit tests in `__tests__/` directory
- Multi-node integration tests in `__tests__/run/`
- Use Jest with experimental VM modules
- Test files follow pattern: `{feature}.ts`

### HTTP API Structure

The HTTP API provides RESTful endpoints:
- `GET/PUT /collection/:name/:id` - Entity operations
- `GET /peers` - Peer information
- `GET /deltas/stats` - Delta statistics
- `GET /hyperview/:entityId` - Raw delta access

### Important Implementation Notes

- All data modifications go through deltas - never modify state directly
- Deltas are immutable once created
- Use `Context.getOrCreate()` for singleton access
- Network ports: publish (default 4000) and request (default 4001)
- Debug logging uses namespaces like `rhizome:*`