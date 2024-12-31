import {RhizomeNode, RhizomeNodeConfig} from "../src/node.js";
import {Collection} from "../src/collection.js";
import {randomUUID} from "crypto";

const start = 5000;
const range = 5000;
const getRandomPort = () => Math.floor(start + range * Math.random());

export class App extends RhizomeNode {
  apiUrl: string;

  constructor(config?: Partial<RhizomeNodeConfig>) {
    // Randomizing ports to try to avoid collisions between tests.
    super({
      publishBindPort: getRandomPort(),
      requestBindPort: getRandomPort(),
      httpPort: getRandomPort(),
      pubSubTopic: config?.pubSubTopic || `deltas-${randomUUID()}`,
      ...config,
    });

    const users = new Collection("user");
    users.rhizomeConnect(this);

    const {httpAddr, httpPort} = this.config;
    this.apiUrl = `http://${httpAddr}:${httpPort}/api`;
  }
}

