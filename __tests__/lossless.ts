import {Lossless} from '../src/lossless';
import {Delta} from '../src/types';

describe('Lossless', () => {
  it('creates a lossless view of neo in the matrix', () => {
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
});
