import Debug from 'debug';
import { PointerTarget } from "@src/core/delta";
import { Hyperview, HyperviewOne } from "@src/views/hyperview";
import { Lossy } from "@src/views/view";
import { RhizomeNode } from "@src/node";
import { valueFromDelta } from "@src/views/hyperview";
import { latestFromCollapsedDeltas } from "@src/views/resolvers/timestamp-resolvers";
import { createDelta } from "@src/core/delta-builder";
const debug = Debug('rz:test:view');

type Role = {
  actor: PointerTarget,
  film: PointerTarget,
  role: PointerTarget
};

type Summary = {
  roles: Role[];
};

class Summarizer extends Lossy<Summary> {
  private readonly debug: debug.Debugger;

  constructor(hyperview: Hyperview) {
    super(hyperview);
    this.debug = Debug('rz:test:view:summarizer');
  }

  initializer(): Summary {
    this.debug('Initializing new summary');
    return {
      roles: []
    };
  }

  // TODO: Add more rigor to this example approach to generating a summary.
  // it's really not CRDT, it likely depends on the order of the pointers.
  // TODO: Prove with failing test

  reducer(acc: Summary, cur: HyperviewOne): Summary {
    this.debug(`Processing view for entity ${cur.id} (referenced as: ${cur.referencedAs?.join(', ')})`);
    this.debug(`hyperview:`, JSON.stringify(cur));
    
    if (cur.referencedAs?.includes("role")) {
      this.debug(`Found role entity: ${cur.id}`);
      
      const actorDeltas = cur.propertyDeltas["actor"];
      this.debug(`Found ${actorDeltas?.length ?? 0} actor deltas`);
      
      const {delta, value: actor} = latestFromCollapsedDeltas("actor", actorDeltas) ?? {};
      
      if (!delta) {
        this.debug('No delta found for actor property');
        throw new Error('expected to find delta');
      }
      
      if (!actor) {
        this.debug('No actor value found in deltas');
        throw new Error('expected to find actor');
      }
      
      this.debug(`Found actor: ${actor}`);
      const film = valueFromDelta("film", delta);
      
      if (!film) {
        this.debug('No film property found in delta');
        throw new Error('expected to find film');
      }
      
      this.debug(`Found film: ${film}`);
      const role = {
        role: cur.id,
        actor,
        film
      };
      
      acc.roles.push(role);
      this.debug(`Added role: ${JSON.stringify(role)}`);
    }

    this.debug(`Updated accumulator: ${JSON.stringify(acc, null, 2)}`);

    return acc;
  }

  resolver(acc: Summary): Summary {
    this.debug(`Resolving summary with ${acc.roles.length} roles`);
    return acc;
  }
}

describe('Lossy', () => {
  describe('use a provided initializer, reducer, and resolver to resolve entity views', () => {
    const node = new RhizomeNode();
    const hyperview = new Hyperview(node);

    const view = new Summarizer(hyperview);

    beforeAll(() => {
      hyperview.ingestDelta(createDelta('a', 'h')
        .addPointer('actor', 'keanu', 'roles')
        .addPointer('role', 'neo', 'actor')
        .addPointer('film', 'the_matrix', 'cast')
        .addPointer('base_salary', 1000000)
        .addPointer('salary_currency', 'usd')
        .buildV1()
      );
    });

    test('example summary', () => {
      const result = view.resolve();
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
