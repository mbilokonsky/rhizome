import Debug from 'debug';
import { PointerTarget } from "../../../src/core/delta";
import { Lossless, LosslessViewOne } from "../../../src/views/lossless";
import { Lossy } from "../../../src/views/lossy";
import { RhizomeNode } from "../../../src/node";
import { valueFromCollapsedDelta } from "../../../src/views/resolvers/aggregation-resolvers";
import { lastValueFromDeltas } from "../../../src/views/resolvers/timestamp-resolvers";
import { createDelta } from "../../../src/core/delta-builder";
const debug = Debug('rz:test:lossy');

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
      lossless.ingestDelta(createDelta('a', 'h')
        .addPointer('actor', 'keanu', 'roles')
        .addPointer('role', 'neo', 'actor')
        .addPointer('film', 'the_matrix', 'cast')
        .addPointer('base_salary', 1000000)
        .addPointer('salary_currency', 'usd')
        .buildV1()
      );
    });

    test('example summary', () => {
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
