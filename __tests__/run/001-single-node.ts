import {App} from "../util/app";

describe('Run', () => {
  let app: App;

  beforeAll(async () => {
    app = new App({
      httpPort: 5000,
      httpEnable: true,
      requestBindPort: 5001,
      publishBindPort: 5002,
    });
    await app.start();
  });

  afterAll(async () => {
    await app.stop();
  });

  it('can put a new user', async () => {
    const {httpAddr, httpPort} = app.config;
    const res = await fetch(`http://${httpAddr}:${httpPort}/users`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        id: "peon-1",
        properties: {
          name: "Peon",
          age: 263
        }
      })
    });
    const data = await res.json();
    expect(data).toMatchObject({
      id: "peon-1",
      properties: {
        name: "Peon",
        age: 263
      }
    });
  });
});
