import Debug from 'debug';
import {Delta, PointerTarget} from "../src/delta.js";
import {lastValueFromDeltas} from "../src/last-write-wins.js";
import {Lossless, LosslessViewOne} from "../src/lossless.js";
import {Lossy, valueFromCollapsedDelta} from "../src/lossy.js";
import {RhizomeNode} from "../src/node.js";
const debug = Debug('test:lossy');

type Role = {
  actor: PointerTarget,
  film: PointerTarget,
  role: PointerTarget
};

type Summary = {
  roles: Role[];
};


function initializer(): Summary {
  return {
    roles: []
  };
}

// TODO: Add more rigor to this example approach to generating a summary.
// it's really not CRDT, it likely depends on the order of the pointers.
// TODO: Prove with failing test

const reducer = (acc: Summary, cur: LosslessViewOne): Summary => {
  if (cur.referencedAs.includes("role")) {
    const {delta, value: actor} = lastValueFromDeltas("actor", cur.propertyDeltas["actor"]) ?? {};
    if (!delta) throw new Error('expected to find delta');
    if (!actor) throw new Error('expected to find actor');
    const film = valueFromCollapsedDelta("film", delta);
    if (!film) throw new Error('expected to find film');
    acc.roles.push({
      role: cur.id,
      actor,
      film
    });
  }

  return acc;
}

const resolver = (acc: Summary): Summary => {
  return acc;
}


describe('Lossy', () => {
  describe('use a provided initializer, reducer, and resolver to resolve entity views', () => {
    const node = new RhizomeNode();
    const lossless = new Lossless(node);

    const lossy = new Lossy(lossless, initializer, reducer, resolver);

    beforeAll(() => {
      lossless.ingestDelta(new Delta({
        creator: 'a',
        host: 'h',
        pointers: [{
          localContext: "actor",
          target: "keanu",
          targetContext: "roles"
        }, {
          localContext: "role",
          target: "neo",
          targetContext: "actor"
        }, {
          localContext: "film",
          target: "the_matrix",
          targetContext: "cast"
        }, {
          localContext: "base_salary",
          target: 1000000
        }, {
          localContext: "salary_currency",
          target: "usd"
        }]
      }));
    });

    it('example summary', () => {
      const result = lossy.resolve();
      debug('result', result);
      expect(result).toEqual({
        roles: [{
          film: "the_matrix",
          role: "neo",
          actor: "keanu"
        }]
      });
    });
  });

});
