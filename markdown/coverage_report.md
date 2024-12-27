
> rhizome-node@0.1.0 test
> jest --coverage

PASS __tests__/lossless.ts
PASS __tests__/peer-address.ts
FAIL __tests__/lossy.ts
  ● Test suite failed to run

    [96m__tests__/lossy.ts[0m:[93m66[0m:[93m36[0m - [91merror[0m[90m TS2345: [0mArgument of type '(losslessView: LosslessViewMany) => Summary' is not assignable to parameter of type 'Resolver'.
      Type 'Summary' is not assignable to type 'LossyViewMany'.
        Property 'roles' is incompatible with index signature.
          Type 'Role[]' is missing the following properties from type 'LossyViewOne<Properties>': id, properties

    [7m66[0m       const result = lossy.resolve(resolver);
    [7m  [0m [91m                                   ~~~~~~~~[0m

FAIL __tests__/run/002-two-nodes.ts
  ● Run › can create a record on app0 and read it on app1

    SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
        at JSON.parse (<anonymous>)



FAIL __tests__/run/001-single-node.ts
  ● Run › can put a new user and fetch it

    SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
        at JSON.parse (<anonymous>)



----------------------|---------|----------|---------|---------|-------------------------------------------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-------------------------------------------------------
All files             |   79.08 |    44.65 |   78.26 |   79.29 |
 src                  |   79.55 |    47.05 |   77.96 |   79.45 |
  collection.ts       |   53.76 |    26.66 |   57.89 |   54.02 | 54-123,131-135,155,195,226,233,246
  config.ts           |     100 |    72.41 |     100 |     100 | 7-10,12,15,17-20
  deltas.ts           |   77.77 |     62.5 |   84.61 |   77.77 | 42-46,64-73
  entity.ts           |      25 |      100 |       0 |      25 | 17-21
  http-api.ts         |   51.51 |    13.04 |   33.33 |   51.51 | 32,37,44-60,66,79-80,85-92,97,117,122-128,136,141-147
  lossless.ts         |     100 |      100 |     100 |     100 |
  lossy.ts            |   43.75 |        0 |      50 |   46.66 | 26-29,37-40
  node.ts             |     100 |      100 |     100 |     100 |
  peers.ts            |     100 |      100 |     100 |     100 |
  pub-sub.ts          |     100 |      100 |     100 |     100 |
  request-reply.ts    |   95.65 |        0 |     100 |   95.34 | 46,59
  typed-collection.ts |     100 |      100 |     100 |     100 |
  types.ts            |   81.25 |      100 |   85.71 |   81.25 | 11-14
 src/util             |   70.68 |    30.43 |   77.77 |   73.58 |
  md-files.ts         |   70.68 |    30.43 |   77.77 |   73.58 | 53-57,74-77,98-102,116-123
 util                 |     100 |      100 |     100 |     100 |
  app.ts              |     100 |      100 |     100 |     100 |
----------------------|---------|----------|---------|---------|-------------------------------------------------------
Test Suites: 3 failed, 2 passed, 5 total
Tests:       2 failed, 4 passed, 6 total
Snapshots:   0 total
Time:        3.777 s, estimated 5 s
Ran all test suites.
