// We can start to use deltas to express relational data in a given context

import express from "express";
import { bindPublish, } from "./pub-sub";
import { runDeltas } from "./deltas";
import { Entities, Entity } from "./object-layer";
import { bindReply, runRequestHandlers } from "./request-reply";
import { subscribeToSeeds } from "./peers";
import { ENABLE_HTTP_API, HTTP_API_ADDR, HTTP_API_PORT } from "./config";


// As an app we want to be able to write and read data.
// The data is whatever shape we define it to be in a given context.
// So we want access to an API that is integrated with our declarations of
// e.g. entities and their properties.

// This implies at least one layer on top of the underlying primitive deltas.

type UserProperties = {
  id?: string;
  name: string;
  nameLong?: string;
  email?: string;
  age: number;
};

class Users {
  db = new Entities();
  create(properties: UserProperties): Entity {
    // We provide undefined for the id, to let the database generate it
    // This call returns the id
    const user = this.db.put(undefined, properties);
    console.log(`Users.create(${user.id}, ${JSON.stringify(properties)}`);
    return user;
  }
  upsert(properties: UserProperties): Entity {
    const user = this.db.put(properties.id, properties);
    console.log(`Users.upsert(${user.id}, ${JSON.stringify(properties)}`);
    return user;
  }
  getOne(id: string): Entity | undefined {
    return this.db.get(id);
  }
  getIds(): string[] {
    return this.db.getIds();
  }
}

(async () => {
  const app = express()

  app.get("/ids", (req: express.Request, res: express.Response) => {
      res.json({ ids: users.getIds()});
  });

  if (ENABLE_HTTP_API) {
    app.listen(HTTP_API_PORT, HTTP_API_ADDR, () => {
        console.log(`HTTP API bound to http://${HTTP_API_ADDR}:${HTTP_API_PORT}`);
    });
  }

  await bindPublish();
  await bindReply();
  runDeltas();
  runRequestHandlers();
  await new Promise((resolve) => setTimeout(resolve, 200));
  subscribeToSeeds();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const users = new Users();

  const taliesin = users.upsert({
    id: 'taliesin-1',
    name: 'Taliesin',
    nameLong: 'Taliesin (Ladd)',
    age: Math.floor(Math.random() * 1000)
  });

  taliesin.onUpdate((u: Entity) => {
    console.log('User updated', u);
  });

  // TODO: Allow configuration regarding read/write concern i.e.
  // if we perform a read immediately do we see the value we wrote?
  // Intuition says yes, we want that-- but how do we expose the propagation status?

  const result = users.getOne(taliesin.id);
  const matches: boolean = JSON.stringify(result) === JSON.stringify(taliesin);
  console.log(`Result ${matches ? 'matches' : 'does not match'} expected.` +
    `\n\nExpected \n${JSON.stringify(taliesin)}` +
    `\nReceived\n${JSON.stringify(result)}`);

})();

