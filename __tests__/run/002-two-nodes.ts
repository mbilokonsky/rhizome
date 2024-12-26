import Debug from 'debug';
import {App} from '../util/app';
const debug = Debug('test:two');

describe('Run', () => {
  const apps: App[] = [];

  beforeAll(async () => {
    apps[0] = new App({
      httpEnable: true,
      peerId: 'app0',
    });
    apps[1] = new App({
      httpEnable: true,
      peerId: 'app1',
    });
    apps[0].config.seedPeers.push(apps[1].myRequestAddr);
    apps[1].config.seedPeers.push(apps[0].myRequestAddr);

    await Promise.all(apps.map((app) => app.start()));
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.stop()));
  });

  it('can create a record on node 0 and read it on node 1', async () => {
    debug('apps[0].apiUrl', apps[0].apiUrl);
    debug('apps[1].apiUrl', apps[1].apiUrl);

    const res = await fetch(`${apps[0].apiUrl}/users`, {
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

    const res2 = await fetch(`${apps[1].apiUrl}/users/peon-1`);
    const data2 = await res2.json();
    debug('data2', data2);
    expect(data2).toMatchObject({
      id: "peon-1",
      properties: {
        name: "Peon",
        age: 263
      }
    });

  });
});
