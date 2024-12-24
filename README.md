# Concepts

|               | Implemented | Notes                                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| Peering       | Yes         | Currently using `RHIZOME_SEED_PEERS`, no gossip / discovery              |
| Schemas       | Not really  | Currently very thin layer allowing TypedCollections                      |
| Relationships | No          | Supporting relational algebra among domain entities                      |
| Views         | Yes         | Currently using functions rather than JSON-Logic expressions             |
| Functions     | No          | Arbitrary subscribers to delta stream (that can also emit deltas?)       |
| Tests         | Minimal     | So far we have a few `ts-jest` tests. Need a plan for multi-node tests.  |
| Identity      | No          | Probably a public key / private key system                               |
| Contexts      | No          | Each context may involve different lossy functions and delta filters     |
| HTTP API      | Yes         | Basic peering info and entity CRUD                                       |

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

## Run

To demonstrate the example application, you can open multiple terminals, and in each terminal execute something like the following:

```bash
export DEBUG="*,-express"
export RHIZOME_REQUEST_BIND_PORT=4000
export RHIZOME_PUBLISH_BIND_PORT=4001
export RHIZOME_SEED_PEERS='127.0.0.1:4002, 127.0.0.1:4004'
export RHIZOME_HTTP_API_PORT=3000
export RHIZOME_PEER_ID=peer1
npm run example-app
```

```bash
export DEBUG="*,-express"
export RHIZOME_REQUEST_BIND_PORT=4002
export RHIZOME_PUBLISH_BIND_PORT=4003
export RHIZOME_SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4004'
export RHIZOME_HTTP_API_PORT=3001
export RHIZOME_PEER_ID=peer2
npm run example-app
```

```bash
export DEBUG="*,-express"
export RHIZOME_REQUEST_BIND_PORT=4004
export RHIZOME_PUBLISH_BIND_PORT=4005
export RHIZOME_SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4002'
export RHIZOME_HTTP_API_PORT=3002
export RHIZOME_PEER_ID=peer3
npm run example-app
```

In a separate terminal, you can use `curl` to interact with an instance.

`jq` is helpful for formatting the json responses.

Query the number of peers seen by a given node (including itself)
```bash
curl -s  http://localhost:3000/peers/count | jq
```

Query the list of peers seen by a given node (including itself)
```bash
curl -s  http://localhost:3000/peers | jq
```

Query the number of deltas ingested by this node
```bash
curl -s  http://localhost:3000/deltas/count | jq
```

Query the list of deltas ingested by this node
```bash
curl -s  http://localhost:3000/deltas | jq
```

