import Debug from 'debug';
import {App} from '../../util/app';
const debug = Debug('test:two');

describe('Run', () => {
  const apps: App[] = [];

  beforeAll(async () => {
    apps[0] = new App({
      httpEnable: true,
      peerId: 'app-002-A',
    });
    apps[1] = new App({
      httpEnable: true,
      peerId: 'app-002-B',
    });
    apps[0].config.seedPeers.push(apps[1].myRequestAddr);
    apps[1].config.seedPeers.push(apps[0].myRequestAddr);

    await Promise.all(apps.map((app) => app.start(false)));
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.stop()));
  });

  it('can create a record on app0 and read it on app1', async () => {
    debug('apps[0].apiUrl', apps[0].apiUrl);
    debug('apps[1].apiUrl', apps[1].apiUrl);

    // Create a new record on app0
    {
      const res = await fetch(`${apps[0].apiUrl}/user`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: "peon-1",
          properties: {
            name: "Peon",
            age: 741
          }
        })
      });
      const data = await res.json();
      expect(data).toMatchObject({
        id: "peon-1",
        properties: {
          name: "Peon",
          age: 741
        }
      });
    }

    // TODO remove delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Read from app1
    {
      const res = await fetch(`${apps[1].apiUrl}/user/peon-1`);
      const data = await res.json();
      debug('data', data);
      expect(data).toMatchObject({
        id: "peon-1",
        properties: {
          name: "Peon",
          age: 741
        }
      });
    }

    // Verify our record is also in the index
    for (const app of apps) {
      const res = await fetch(`${app.apiUrl}/user/ids`);
      const data = await res.json();
      expect(data).toMatchObject({ids: ["peon-1"]});
    }

  });
});
