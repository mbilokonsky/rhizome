import Debug from 'debug';
import {
  Delta,
  PointerTarget,
  lastValueFromDeltas,
  valueFromCollapsedDelta,
  Lossless,
  LosslessViewOne,
  Lossy,
  RhizomeNode
} from "../src";
const debug = Debug('test:lossy');

type Role = {
  actor: PointerTarget,
  film: PointerTarget,
  role: PointerTarget
};

type Summary = {
  roles: Role[];
};

class Summarizer extends Lossy<Summary, Summary> {
  initializer(): Summary {
    return {
      roles: []
    };
  }

  // TODO: Add more rigor to this example approach to generating a summary.
  // it's really not CRDT, it likely depends on the order of the pointers.
  // TODO: Prove with failing test

  reducer(acc: Summary, cur: LosslessViewOne): Summary {
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

  resolver(acc: Summary): Summary {
    return acc;
  }
}

describe('Lossy', () => {
  describe('use a provided initializer, reducer, and resolver to resolve entity views', () => {
    const node = new RhizomeNode();
    const lossless = new Lossless(node);

    const lossy = new Summarizer(lossless);

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
