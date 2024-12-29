import Debug from 'debug';
import {RhizomeNode} from "../src/node";
import {Entity} from "../src/entity";
import {Collection} from "../src/collection";
const debug = Debug('example-app');

// As an app we want to be able to write and read data.
// The data is whatever shape we define it to be in a given context.
// So we want access to an API that is integrated with our declarations of
// e.g. entities and their properties.

type User = {
  id?: string;
  name: string;
  nameLong?: string;
  email?: string;
  age: number;
};

(async () => {
  const rhizomeNode = new RhizomeNode();

  // Enable API to read lossless view
  rhizomeNode.httpServer.httpApi.serveLossless();

  const users = new Collection("user");
  users.rhizomeConnect(rhizomeNode);

  users.onUpdate((u: Entity) => {
    debug('User updated:', u);
  });

  users.onCreate((u: Entity) => {
    debug('New user!:', u);
  });

  await rhizomeNode.start();

  // Let's use the rhizomic database for some more things.
  // Like what?
  // - Logging
  // - Chat
  //
  const taliesinData: User = {
    id: 'taliesin-1',
    name: 'Taliesin',
    nameLong: 'Taliesin (Ladd)',
    age: Math.floor(Math.random() * 1000)
  };

  const taliesinPutResult = await users.put(undefined, taliesinData);

  {
    const result = JSON.stringify(taliesinPutResult);
    const expected = JSON.stringify(taliesinData);

    if (result === expected) {
      debug('Put result matches expected: ' + expected);
    } else {
      debug(`Put result does not match expected.` +
        `\n\nExpected \n${expected}` +
        `\nReceived\n${result}`);
    }
  }

  // TODO: Allow configuration regarding read/write concern i.e.
  // if we perform a read immediately do we see the value we wrote?
  // Intuition says yes, we want that-- but how do we expose the propagation status?

  const resolved = users.resolve('taliesin-1');
  if (!resolved) throw new Error('unable to resolve entity we just created');

  debug('resolved', resolved);

  const resolvedUser = {
    id: resolved.id,
    ...resolved.properties
  } as User;

  /*
  function sortKeys (o: {[key: string]: unknown}): {[key: string]: unknown} {
    const r: {[key: string]: unknown} = {};
    r.id = o.id;
    Object.keys(o).sort().forEach((key) => {
      if (key === "id") return;
      r[key] = o[key];
    })
    return r;
  }
  */

  const result = JSON.stringify(resolvedUser);
  const expected = JSON.stringify(taliesinData);

  if (result === expected) {
    debug('Get result matches expected: ' + expected);
  } else {
    debug(`Get result does not match expected.` +
      `\n\nExpected \n${expected}` +
      `\nReceived\n${result}`);
  }


})();

