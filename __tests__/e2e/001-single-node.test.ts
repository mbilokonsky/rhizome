import {App} from "../../util/app";

describe('Run', () => {
  let app: App;

  beforeAll(async () => {
    app = new App({
      httpPort: 5000,
      httpEnable: true,
      requestBindPort: 5001,
      publishBindPort: 5002,
      peerId: 'app-001',
    });
    await app.start();
  });

  afterAll(async () => {
    await app.stop();
  });

  it('can put a new user and fetch it', async () => {
    // Create a new record
    {
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
    }

    // TODO: Optimistic update and remove this delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Read what we wrote
    {
      const res = await fetch(`${app.apiUrl}/user/peon-1`);
      const data = await res.json();
      expect(data).toMatchObject({
        id: "peon-1",
        properties: {
          name: "Peon",
          age: 263
        }
      });
    }

    // Verify our record is also in the index
    {
      const res = await fetch(`${app.apiUrl}/user/ids`);
      const data = await res.json();
      expect(data).toMatchObject({ids: [ "peon-1"]});
    }

  });
});
