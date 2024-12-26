import {RhizomeNode, RhizomeNodeConfig} from "../../src/node";
import {TypedCollection} from "../../src/typed-collection";

type User = {
  id?: string;
  name: string;
  nameLong?: string;
  email?: string;
  age: number;
};

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

    const users = new TypedCollection<User>("users");
    users.rhizomeConnect(this);

    const {httpAddr, httpPort} = this.config;
    this.apiUrl = `http://${httpAddr}:${httpPort}`;
  }
}

