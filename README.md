## Setup

- Install nodejs
- Install [nvm](https://nvm.sh)

## Install

```bash
nvm install
npm install
```

## Build

```bash
npx tsc
# npm run build # also works

# npx tsc --watch # is useful during development
```

## Run

To demonstrate the example application, you can open multiple terminals. In each terminal execute something like the following.

    export RHIZOME_REQUEST_BIND_PORT=4000
    export RHIZOME_PUBLISH_BIND_PORT=4001
    export RHIZOME_SEED_PEERS='127.0.0.1:4002, 127.0.0.1:4004'
    export RHIZOME_HTTP_API_PORT=3000
    export RHIZOME_PEER_ID=peer1
    node dist/example-app.js


    export RHIZOME_REQUEST_BIND_PORT=4002
    export RHIZOME_PUBLISH_BIND_PORT=4003
    export RHIZOME_SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4004'
    export RHIZOME_PEER_ID=peer2
    node dist/example-app.js


    export RHIZOME_REQUEST_BIND_PORT=4004
    export RHIZOME_PUBLISH_BIND_PORT=4005
    export RHIZOME_SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4002'
    export RHIZOME_PEER_ID=peer3
    node dist/example-app.js

In a separate terminal, you can use `curl` to interact with an instance.

`jq` is helpful for formatting the json responses.

    curl -s  http://localhost:3000/peers/count | jq
    curl -s  http://localhost:3000/peers | jq
    curl -s  http://localhost:3000/deltas/count | jq
    curl -s  http://localhost:3000/deltas | jq
