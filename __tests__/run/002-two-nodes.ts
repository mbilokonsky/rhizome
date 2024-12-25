import {App} from '../../util/app';

describe('Run', () => {
  const apps: App[] = [];

  beforeAll(async () => {
    apps[0] = new App({
      httpEnable: true,
    });
    apps[1] = new App({
      httpEnable: true,
    });

    await Promise.all(apps.map((app) => app.start()));
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.stop()));
  });

  it('can create a record on node 0 and read it on node 1', async () => {
    const res = await fetch(`${apps[0].apiUrl}/users`, {
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

    await new Promise((resolve) => setTimeout(resolve, 500));

    const res2 = await fetch(`${apps[0].apiUrl}/users`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: "Peon",
        id: "peon-1",
        age: 263
      })
    });
    const data2 = await res2.json();
    expect(data2).toMatchObject({
      properties: {
        name: "Peon",
        id: "peon-1",
        age: 263
      }
    });

  });
});
