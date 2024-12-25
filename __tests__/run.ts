import Debug from 'debug';
import {RhizomeNode, RhizomeNodeConfig} from "../src/node";
import {TypedCollection} from '../src/typed-collection';
const debug = Debug('test:run');

type User = {
  id?: string;
  name: string;
  nameLong?: string;
  email?: string;
  age: number;
};

class App extends RhizomeNode {
  constructor(config?: Partial<RhizomeNodeConfig>) {
    super(config);
    const users = new TypedCollection<User>("users");
    users.rhizomeConnect(this);
  }
}

describe('Run', () => {
  let app: App;

  beforeAll(async () => {
    app = new App({
      // TODO expose more conveniently as test config options
      httpPort: 5000,
      httpEnable: true,
      requestBindPort: 5001,
      publishBindPort: 5002,
    });
    await app.start();
  });

  afterAll(async () => {
    debug('attempting to stop app');
    await app.stop();
  });

  it('can put a new user', async () => {
    const res = await fetch('http://localhost:5000/users', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: "Peon",
        id: "peon-1",
        age: 263
      })
    });
    const data = await res.json();
    expect(data).toMatchObject({
      properties: {
        name: "Peon",
        id: "peon-1",
        age: 263
      }
    });
  });
});
