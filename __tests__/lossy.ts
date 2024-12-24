import Debug from "debug";
import {Lossless, LosslessViewMany} from "../src/lossless";
import {Lossy, firstValueFromLosslessViewOne, firstValueFromCollapsedDelta} from "../src/lossy";
const debug = Debug('test:lossy');

describe('Lossy', () => {
  describe('se a provided function to resolve entity views', () => {
    const lossless = new Lossless();
    const lossy = new Lossy(lossless);

    beforeAll(() => {
      lossless.ingestDelta({
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
      });
    });

    it('example summary', () => {
      type Role = {
        actor: string,
        film: string,
        role: string
      };

      type Summary = {
        roles: Role[];
      };

      const resolver = (losslessView: LosslessViewMany): Summary => {
        const roles: Role[] = [];
        debug('resolving roles');
        for (const [id, ent] of Object.entries(losslessView)) {
          if (ent.referencedAs.includes("role")) {
            const {delta, value: actor} = firstValueFromLosslessViewOne(ent, "actor") ?? {};
            if (!delta) continue; // TODO: panic
            if (!actor) continue; // TODO: panic
            const film = firstValueFromCollapsedDelta(delta, "film");
            debug(`role ${id}`, {actor, film});
            if (!film) continue; // TODO: panic
            roles.push({
              role: id,
              actor,
              film
            });
          }
        }
        return {roles};
      }

      const result = lossy.resolve(resolver);
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
