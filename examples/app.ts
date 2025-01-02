import Debug from 'debug';
import {Collection} from "../src/collection";
import {Entity} from "../src/entity";
import {RhizomeNode} from "../src/node";
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
    debug(`[${rhizomeNode.config.peerId}]`, 'User updated:', u);
  });

  users.onCreate((u: Entity) => {
    debug(`[${rhizomeNode.config.peerId}]`, 'New user!:', u);
  });

  await rhizomeNode.start();

  // TODO: Use the rhizomic database for some more things.
  // Like what?
  // - Logging
  // - Chat

  // TODO: Allow configuration regarding read/write concern i.e.
  // if we perform a read immediately do we see the value we wrote?
  // Intuition says yes, we want that-- but how do we expose the propagation status?

  // Insert a "user" record

  const taliesinData: User = {
    id: 'taliesin-1',
    name: 'Taliesin',
    nameLong: 'Taliesin (Ladd)',
    age: Math.floor(Math.random() * 1000)
  };

  {
    const taliesinPutResult = await users.put(undefined, taliesinData);
    const resolvedUser = {
      id: taliesinPutResult.id,
      ...taliesinPutResult.properties
    } as User;
    const result = JSON.stringify(resolvedUser);
    const expected = JSON.stringify(taliesinData);

    if (result === expected) {
      debug(`[${rhizomeNode.config.peerId}]`, 'Put result matches expected: ' + expected);
    } else {
      debug(`[${rhizomeNode.config.peerId}]`, `Put result does not match expected.` +
        `\n\nExpected \n${expected}` +
        `\nReceived\n${result}`);
    }
  }

  // Read back what we wrote

  {
    const resolved = users.resolve('taliesin-1');
    if (!resolved) throw new Error('unable to resolve entity we just created');

    const resolvedUser = {
      id: resolved.id,
      ...resolved.properties
    } as User;

    const result = JSON.stringify(resolvedUser);
    const expected = JSON.stringify(taliesinData);

    if (result === expected) {
      debug(`[${rhizomeNode.config.peerId}]`, 'Get result matches expected: ' + expected);
    } else {
      debug(`[${rhizomeNode.config.peerId}]`, `Get result does not match expected.` +
        `\n\nExpected \n${expected}` +
        `\nReceived\n${result}`);
    }
  }


})();

