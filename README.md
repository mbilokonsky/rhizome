# Rhizome Node

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)

A distributed, peer-to-peer database engine built with TypeScript, designed for building decentralized applications with flexible data modeling and conflict-free replication.

## Key Features

- **Immutable Delta-based Storage**: All changes are stored as immutable deltas, enabling full history and audit trails
- **Peer-to-Peer Networking**: Built-in support for ZeroMQ and Libp2p for decentralized node communication
- **Flexible Data Modeling**: Schema-optional approach with support for typed collections and relationships
- **Conflict Resolution**: Customizable resolution strategies for handling concurrent modifications
- **Event Sourcing**: Built-in support for event-driven architectures with delta streams
- **Extensible Views**: Powerful view system for materializing and transforming data
- **REST API**: Built-in HTTP server for easy integration with other systems

## Quick Start

```bash
# Clone the repository
git clone https://gitea.dgov.io/ladd/rhizome
cd rhizome-node

# Install dependencies
nvm use
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Documentation

### Core Concepts
- [Delta Specification](./spec.md) - Detailed specification of the delta format
- [Delta Patterns](./docs/delta-patterns.md) - Common patterns for working with deltas
- [JSON AST](./docs/json-ast.md) - Understanding the JSON Abstract Syntax Tree representation

### Custom Resolvers
- [Overview](./docs/custom-resolvers/overview.md) - Introduction to the resolver system
- [Creating Resolvers](./docs/custom-resolvers/creating-resolvers.md) - Guide to building custom resolvers
- [Built-in Plugins](./docs/custom-resolvers/plugins/builtin-plugins.md) - Available resolver plugins
- [Dependency Resolution](./docs/custom-resolvers/dependencies/dependency-resolution.md) - Managing resolver dependencies

### Schema & Validation
- [Schema Validation](./docs/schema-validation.md) - Defining and validating data schemas
- [Classes](./docs/classes.md) - Working with typed collections and classes

### Development
- [Testing Helpers](./docs/test-helpers.md) - Utilities for testing Rhizome applications
- [Contributing](./CONTRIBUTING.md) - Guidelines for contributing to the project

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

See [spec.md](spec.md) for additional specification details about this project.

## Documentation

- [Custom Resolvers](./docs/custom-resolvers/overview.md) - Flexible property resolution system with plugin support


# Development / Demo

## Setup

Install [`nvm`](https://nvm.sh)

Clone repo
```bash
git clone https://gitea.dgov.io/ladd/rhizome
```

Use `nvm` to install and activate the target nodejs version
```bash
nvm install
```

Install nodejs packages
```bash
npm install
```

## Build

Compile Typescript
```bash
npm run build
```

During development, it's useful to run the compiler in watch mode:
```bash
npm run build:watch
```

## Run tests

```bash
npm test
```

## Run test coverage report

```bash
npm run coverage
```

## Run multiple live nodes locally as separate processes
To demonstrate the example application, you can open multiple terminals, and in each terminal execute something like the following:

```bash
export DEBUG="*,-express:*"
export RHIZOME_REQUEST_BIND_PORT=4000
export RHIZOME_PUBLISH_BIND_PORT=4001
export RHIZOME_SEED_PEERS='localhost:4002, localhost:4004'
export RHIZOME_HTTP_API_ENABLE=true
export RHIZOME_HTTP_API_PORT=3000
export RHIZOME_PEER_ID=peer1
export RHIZOME_PUB_SUB_TOPIC=rhizome-demo-1
npm run example-app
```

```bash
export DEBUG="*,-express:*"
export RHIZOME_REQUEST_BIND_PORT=4002
export RHIZOME_PUBLISH_BIND_PORT=4003
export RHIZOME_SEED_PEERS='localhost:4000, localhost:4004'
export RHIZOME_HTTP_API_ENABLE=true
export RHIZOME_HTTP_API_PORT=3001
export RHIZOME_PEER_ID=peer2
export RHIZOME_PUB_SUB_TOPIC=rhizome-demo-1
npm run example-app
```

```bash
export DEBUG="*,-express:*"
export RHIZOME_REQUEST_BIND_PORT=4004
export RHIZOME_PUBLISH_BIND_PORT=4005
export RHIZOME_SEED_PEERS='localhost:4000, localhost:4002'
export RHIZOME_HTTP_API_ENABLE=true
export RHIZOME_HTTP_API_PORT=3002
export RHIZOME_PEER_ID=peer3
export RHIZOME_PUB_SUB_TOPIC=rhizome-demo-1
npm run example-app
```

In a separate terminal, you can use `curl` to interact with an instance.

`jq` is helpful for formatting the json responses.

Query the number of peers seen by a given node (including itself)
```bash
curl -s  http://localhost:3000/api/peers/count | jq
```

Query the list of peers seen by a given node (including itself)
```bash
curl -s  http://localhost:3000/api/peers | jq
```

Query the number of deltas ingested by this node
```bash
curl -s  http://localhost:3000/api/deltas/count | jq
```

Query the list of deltas ingested by this node
```bash
curl -s  http://localhost:3000/api/deltas | jq
```

The example creates a `new TypedCollection<User>("user")` and calls `connectRhizome` to join it with the network.
The collection is synchronized across the cluster and optionally CRUD type operations are served via HTTP.

Query the list of User IDs
```bash
curl -s http://localhost:3000/api/user/ids
```

Query the list of User IDs
```bash
curl -s http://localhost:3000/api/user/ids
```

Read a User by ID
```bash
curl -s http://localhost:3000/api/user/taliesin-1
```

Create a User
```bash
cat <<EOF >/tmp/user.json
{"id": "optional-id", 
 "properties": {
  "name": "required",
  "nameLong": "optional",
  "email": "optional"}}
EOF
curl -s -X PUT -H 'content-type:application/json' -d @/tmp/user.json http://localhost:3000/api/user | jq
```

# Concepts

|               | Implemented | Notes                                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| Peering       | Yes         | Implemented with ZeroMQ and/or Libp2p. Libp2p solves more problems.      |
| Schemas       | Not really  | Currently very thin layer allowing TypedCollections                      |
| Relationships | No          | Supporting relational algebra among domain entities                      |
| Views         | Yes         | Hyperview: Map the `targetContext`s as properties of domain entities.     |
|               |             | Lossy: Use a delta filter and a resolver function to produce a view.     |
|               |             | Currently using functions rather than JSON-Logic expressions.            |
| Functions     | No          | Arbitrary subscribers to delta stream (that can also emit deltas?)       |
| Tests         | Yes         | We are set up to run unit tests and multi-node tests                     |
| Identity      | Sort of     | We have an identity service via Libp2p                                   |
| Contexts      | No          | Each context may involve different view functions and delta filters     |
| HTTP API      | Yes         | Basic peering info and entity CRUD                                       |

If we express views and filter rules as JSON-Logic, we can easily include them in records.

## Clocks?

Do we want to involve a time synchronization protocol? e.g. ntpd

If not, what's the best we could do?

Maybe just expect nodes to record relative times, and 
patch together a sequence based on the relative times.
This adds complexity and still has limited precision.

We could just let the clocks drift and so on, and make inferences at
query resolution time.

We could do some extra work and keep track of what time our peers think it is.
Then if their clocks drift relative to ours, we can seek consensus among a broader range of peers.

But at that point just run ntpd. Can still do consensus to verify
but probably no need to implement custom time synchronization protocol.

Apparently PTP, Precision Time Protocol, is a thing.
PTP affords for a layer of user defined priority for best clock selection.

## Peering

### ZeroMQ
Currently we're handling networking with ZeroMQ pub/sub over TCP transport.

* ZeroMQ supports encryption, with public/private key pairs.
* A subscriber needs to know the public key of the publisher in order to connect.
* We're aiming for symmetry, so we'll need a strategy to establish these reciprocal relationships.

### GossipSub
One option is to replace ZeroMQ with GossipSub, 
which may function better in an open network envoronment.

Considerations with GossipSub may include
* topics -- namespacing
* peer discovery

### TincVPN
Another layer which is available would be [Tinc VPN](https://tinc-vpn.org). 

Tinc...
* is a daemon
* creates a mesh VPN 
* uses tap/tun network devices
* network can run in router, switch, or hub mode
* performs UDP hole punching
* forwards packets among peers
* performs spanning tree routing
* participants only see messages if they've added the sender's public key to their configuration

Ideally at least one node in a given network 
needs to listen on a public interface address.

[Tinc configuration docs](https://tinc-vpn.org/documentation/Main-configuration-variables.html)
provide some insight into its functioning.

Considerations imposed by Tinc would include
* IP addressing
* public key management

