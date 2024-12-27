import {Delta, DeltaFilter} from '../src/delta';
import {Lossless} from '../src/lossless';

describe('Lossless', () => {
  it('creates a lossless view of keanu as neo in the matrix', () => {
    const delta = new Delta({
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

    const lossless = new Lossless();

    lossless.ingestDelta(delta);

    expect(lossless.view()).toMatchObject({
      keanu: {
        referencedAs: ["actor"],
        properties: {
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
      },
      neo: {
        referencedAs: ["role"],
        properties: {
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
      },
      the_matrix: {
        referencedAs: ["film"],
        properties: {
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
        },
      },
    });
  });

  describe('can filter deltas', () => {
    const lossless = new Lossless();

    beforeAll(() => {
      lossless.ingestDelta(new Delta({
        creator: 'A',
        host: 'H',
        pointers: [{
          localContext: "1",
          target: "ace",
          targetContext: "value"
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'B',
        host: 'H',
        pointers: [{
          // 10 11j 12q 13k 14a
          localContext: "14",
          target: "ace",
          targetContext: "value"
        }]
      }));

      expect(lossless.view()).toMatchObject({
        ace: {
          referencedAs: ["1", "14"],
          properties: {
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
        }
      });
    });

    it('filter by creator and host', () => {
      const filter: DeltaFilter = ({creator, host}) => {
        return creator === 'A' && host === 'H';
      };

      expect(lossless.view(undefined, filter)).toMatchObject({
        ace: {
          referencedAs: ["1"],
          properties: {
            value: [{
              creator: 'A',
              host: 'H',
              pointers: [
                {"1": "ace"},
              ]
            }]
          }
        }
      });

      expect(lossless.view(["ace"], filter)).toMatchObject({
        ace: {
          referencedAs: ["1"],
          properties: {
            value: [{
              creator: 'A',
              host: 'H',
              pointers: [
                {"1": "ace"},
              ]
            }]
          }
        }
      });
    });
  });
});
