import {Delta, PointerTarget} from "../src/delta";
import {Lossless, LosslessViewMany} from "../src/lossless";
import {Lossy, lastValueFromLosslessViewOne, valueFromCollapsedDelta, ResolvedViewMany} from "../src/lossy";

describe('Lossy', () => {
  describe('se a provided function to resolve entity views', () => {
    const lossless = new Lossless();
    const lossy = new Lossy(lossless);

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
      type Role = {
        actor: PointerTarget,
        film: PointerTarget,
        role: PointerTarget
      };

      type Summary = {
        roles: Role[];
      };

      const resolver = (losslessView: LosslessViewMany): Summary => {
        const roles: Role[] = [];
        for (const [id, ent] of Object.entries(losslessView)) {
          if (ent.referencedAs.includes("role")) {
            const {delta, value: actor} = lastValueFromLosslessViewOne(ent, "actor") ?? {};
            if (!delta) continue; // TODO: panic
            if (!actor) continue; // TODO: panic
            const film = valueFromCollapsedDelta(delta, "film");
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

      const result = lossy.resolve<Summary>(resolver);
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
