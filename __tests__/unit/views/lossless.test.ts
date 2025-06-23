import {DeltaFilter} from '@src/core';
import {Lossless} from '@src/views';
import {RhizomeNode} from '@src/node';
import {createDelta} from '@src/core/delta-builder';

describe('Lossless', () => {
  const node = new RhizomeNode();

  it('creates a lossless view of keanu as neo in the matrix', () => {
    const delta = createDelta('a', 'h')
      .addPointer('actor', 'keanu', 'roles')
      .addPointer('role', 'neo', 'actor')
      .addPointer('film', 'the_matrix', 'cast')
      .addPointer('base_salary', 1000000)
      .addPointer('salary_currency', 'usd')
      .buildV1();

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

  it('accepts DeltaV2 instances', () => {
    const delta = createDelta('a', 'h')
      .addPointer('actor', 'keanu', 'roles')
      .addPointer('role', 'neo', 'actor')
      .addPointer('film', 'the_matrix', 'cast')
      .addPointer('base_salary', 1000000)
      .addPointer('salary_currency', 'usd')
      .buildV2();

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
      // First delta
      lossless.ingestDelta(
        createDelta('A', 'H')
          .addPointer('1', 'ace', 'value')
          .buildV1()
      );

      // Second delta
      lossless.ingestDelta(
        createDelta('B', 'H')
          // 10 11j 12q 13k 14a
          .addPointer('14', 'ace', 'value')
          .buildV1()
      );

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
      losslessT.ingestDelta(
        createDelta('system', 'H')
          .declareTransaction(transactionId, 3)
          .buildV1()
      );

      // A1: First delta from creator A
      losslessT.ingestDelta(
        createDelta('A', 'H')
          .inTransaction(transactionId)
          .setProperty('process1', 'status', 'started', 'step')
          .buildV1()
      );

      // B: Delta from creator B
      losslessT.ingestDelta(
        createDelta('B', 'H')
          .inTransaction(transactionId)
          .setProperty('process1', 'status', 'processing', 'step')
          .buildV1()
      );

      // Transaction incomplete - nothing should show
      const incompleteView = losslessT.view(['process1']);
      expect(incompleteView.process1).toBeUndefined();

      // A2: Second delta from creator A completes transaction
      losslessT.ingestDelta(
        createDelta('A', 'H')
          .inTransaction(transactionId)
          .addPointer('step', 'process1', 'status')
          .addPointer('value', 'completed')
          .buildV1()
      );

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
