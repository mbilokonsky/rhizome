import {App} from "../../util/app";

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

  it('can put a new user and fetch it', async () => {
    const res = await fetch(`${app.apiUrl}/user`, {
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

    await new Promise((resolve) => setTimeout(resolve, 100));

    const res2 = await fetch(`${app.apiUrl}/user/peon-1`);
    const data2 = await res2.json();
    expect(data2).toMatchObject({
      id: "peon-1",
      properties: {
        name: "Peon",
        age: 263
      }
    });

  });
});
