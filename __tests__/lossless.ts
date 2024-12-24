import {Lossless} from '../src/lossless';
import {Delta, DeltaFilter} from '../src/types';

describe('Lossless', () => {
  it('creates a lossless view of keanu as neo in the matrix', () => {
    const delta: Delta = {
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
    };

    const lossless = new Lossless();

    lossless.ingestDelta(delta);

    expect(lossless.view()).toEqual({
      keanu: {
        roles: [{
          creator: "a",
          host: "h",
          pointers: [
            {actor: "keanu"},
            {role: "neo"},
            {film: "the_matrix"},
            {base_salary: 1000000},
            {salary_currency: "usd"},
          ],
        }],
      },
      neo: {
        actor: [{
          creator: "a",
          host: "h",
          pointers: [
            {actor: "keanu"},
            {role: "neo"},
            {film: "the_matrix"},
            {base_salary: 1000000},
            {salary_currency: "usd"},
          ],
        }],
      },
      the_matrix: {
        cast: [{
          creator: "a",
          host: "h",
          pointers: [
            {actor: "keanu"},
            {role: "neo"},
            {film: "the_matrix"},
            {base_salary: 1000000},
            {salary_currency: "usd"},
          ],
        }],
      }
    });


  });

  describe('can filter deltas', () => {
    const lossless = new Lossless();

    beforeAll(() => {
      lossless.ingestDelta({
        creator: 'A',
        host: 'H',
        pointers: [{
          localContext: "1",
          target: "ace",
          targetContext: "value"
        }]
      });

      lossless.ingestDelta({
        creator: 'B',
        host: 'H',
        pointers: [{
          // 10 11j 12q 13k 14a
          localContext: "14",
          target: "ace",
          targetContext: "value"
        }]
      });

      expect(lossless.view()).toEqual({
        ace: {
          value: [{
            creator: 'A',
            host: 'H',
            pointers: [
              {"1": "ace"},
            ]
          }, {
            creator: 'B',
            host: 'H',
            pointers: [
              {"14": "ace"},
            ]
          }],
        }
      });
    });

    it('filter by creator and host', () => {
      const filter: DeltaFilter = ({creator, host}) => {
        return creator === 'A' && host === 'H';
      };

      expect(lossless.view(filter)).toEqual({
        ace: {
          value: [{
            creator: 'A',
            host: 'H',
            pointers: [
              {"1": "ace"},
            ]
          }]
        }
      });
    });
  });
});
