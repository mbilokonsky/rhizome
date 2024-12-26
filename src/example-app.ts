import Debug from 'debug';
import {RhizomeNode} from "./node";
import {Entity} from "./entity";
import {TypedCollection} from "./typed-collection";
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
  const users = new TypedCollection<User>("user");
  users.rhizomeConnect(rhizomeNode);

  users.onUpdate((u: Entity) => {
    debug('User updated:', u);
  });

  users.onCreate((u: Entity) => {
    debug('New user!:', u);
  });


  await rhizomeNode.start()

  const taliesin = users.put(undefined, {
    // id: 'taliesin-1',
    name: 'Taliesin',
    nameLong: 'Taliesin (Ladd)',
    age: Math.floor(Math.random() * 1000)
  });

  // TODO: Allow configuration regarding read/write concern i.e.
  // if we perform a read immediately do we see the value we wrote?
  // Intuition says yes, we want that-- but how do we expose the propagation status?

  const result = users.get(taliesin.id);
  const matches: boolean = JSON.stringify(result) === JSON.stringify(taliesin);
  if (matches) {
    debug('Result matches expected: ' + JSON.stringify(taliesin));
  } else {
    debug(`Result does not match expected.` +
      `\n\nExpected \n${JSON.stringify(taliesin)}` +
      `\nReceived\n${JSON.stringify(result)}`);
  }

})();

