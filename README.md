See [spec.md](spec.md) for additional specification details about this project.

# Concepts

|               | Implemented | Notes                                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| Peering       | Yes         | Implemented with ZeroMQ and/or Libp2p. Libp2p solves more problems.      |
| Schemas       | Not really  | Currently very thin layer allowing TypedCollections                      |
| Relationships | No          | Supporting relational algebra among domain entities                      |
| Views         | Yes         | Lossless: Map the `targetContext`s as properties of domain entities.     |
|               |             | Lossy: Use a delta filter and a resolver function to produce a view.     |
|               |             | Currently using functions rather than JSON-Logic expressions.            |
| Functions     | No          | Arbitrary subscribers to delta stream (that can also emit deltas?)       |
| Tests         | Yes         | We are set up to run unit tests and multi-node tests                     |
| Identity      | Sort of     | We have an identity service via Libp2p                                   |
| Contexts      | No          | Each context may involve different lossy functions and delta filters     |
| HTTP API      | Yes         | Basic peering info and entity CRUD                                       |

If we express views and filter rules as JSON-Logic, we can easily include them in records.

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

# More About Concepts

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

