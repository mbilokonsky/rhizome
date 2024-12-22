To install

    npm install

To build

    npx tsc

To demonstrate the example application, you can open multiple terminals. In each terminal execute something like the following.

    export REQUEST_BIND_PORT=4000
    export PUBLISH_BIND_PORT=4001
    export SEED_PEERS='127.0.0.1:4002, 127.0.0.1:4004'
    node dist/example-app.js

    export REQUEST_BIND_PORT=4002
    export PUBLISH_BIND_PORT=4003
    export SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4004'
    node dist/example-app.js

    export REQUEST_BIND_PORT=4004
    export PUBLISH_BIND_PORT=4005
    export SEED_PEERS='127.0.0.1:4000, 127.0.0.1:4002'
    node dist/example-app.js
