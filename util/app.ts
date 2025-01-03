import {BasicCollection} from "../src/collection-basic";
import {RhizomeNode, RhizomeNodeConfig} from "../src/node";

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
      ...config,
    });

    const users = new BasicCollection("user");
    users.rhizomeConnect(this);

    const {httpAddr, httpPort} = this.config;
    this.apiUrl = `http://${httpAddr}:${httpPort}/api`;
  }
}

