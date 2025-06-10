import {Delta, DeltaFilter, DeltaV2} from '../src/core';
import {Lossless} from '../src/views';
import {RhizomeNode} from '../src/node';

describe('Lossless', () => {
  const node = new RhizomeNode();

  it('creates a lossless view of keanu as neo in the matrix', () => {
    const delta = new DeltaV2({
      creator: 'a',
      host: 'h',
      pointers: {
        actor: {"keanu": "roles"},
        role: {"neo": "actor"},
        film: {"the_matrix": "cast"},
        base_salary: 1000000,
        salary_currency: "usd"
      }
    }).toV1();

    expect(delta.pointers).toMatchObject([{
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
    }]);

    const lossless = new Lossless(node);

    lossless.ingestDelta(delta);

    expect(lossless.view()).toMatchObject({
      keanu: {
        referencedAs: ["actor"],
        propertyDeltas: {
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
        propertyDeltas: {
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
        propertyDeltas: {
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
    const lossless = new Lossless(node);

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
          propertyDeltas: {
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
          propertyDeltas: {
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
          propertyDeltas: {
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

    it('filter with transactions', () => {
      const losslessT = new Lossless(node);
      const transactionId = 'tx-filter-test';

      // Declare transaction with 3 deltas
      losslessT.ingestDelta(new Delta({
        creator: 'system',
        host: 'H',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'size' },
          { localContext: 'size', target: 3 }
        ]
      }));

      // A1: First delta from creator A
      losslessT.ingestDelta(new Delta({
        creator: 'A',
        host: 'H',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'step', target: 'process1', targetContext: 'status' },
          { localContext: 'value', target: 'started' }
        ]
      }));

      // B: Delta from creator B
      losslessT.ingestDelta(new Delta({
        creator: 'B',
        host: 'H',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'step', target: 'process1', targetContext: 'status' },
          { localContext: 'value', target: 'processing' }
        ]
      }));

      // Transaction incomplete - nothing should show
      const incompleteView = losslessT.view(['process1']);
      expect(incompleteView.process1).toBeUndefined();

      // A2: Second delta from creator A completes transaction
      losslessT.ingestDelta(new Delta({
        creator: 'A',
        host: 'H',
        pointers: [
          { localContext: '_transaction', target: transactionId, targetContext: 'deltas' },
          { localContext: 'step', target: 'process1', targetContext: 'status' },
          { localContext: 'value', target: 'completed' }
        ]
      }));

      // All deltas visible now
      const completeView = losslessT.view(['process1']);
      expect(completeView.process1).toBeDefined();
      expect(completeView.process1.propertyDeltas.status).toHaveLength(3);

      // Filter by creator A only
      const filterA: DeltaFilter = ({creator}) => creator === 'A';
      const filteredView = losslessT.view(['process1'], filterA);
      
      expect(filteredView.process1).toBeDefined();
      expect(filteredView.process1.propertyDeltas.status).toHaveLength(2);
      expect(filteredView.process1.propertyDeltas.status.every(d => d.creator === 'A')).toBe(true);
    });
  });
});
