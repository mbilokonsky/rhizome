
> rhizome-node@0.1.0 test
> jest --coverage

PASS __tests__/peer-address.ts
PASS __tests__/lossless.ts
PASS __tests__/lossy.ts
PASS __tests__/run/001-single-node.ts
PASS __tests__/run/002-two-nodes.ts
----------------------|---------|----------|---------|---------|----------------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|----------------------------
All files             |   87.12 |    61.48 |   83.91 |   87.54 |
 src                  |   93.04 |    82.02 |      92 |   93.18 |
  collection.ts       |   89.47 |    66.66 |      80 |   91.54 | 59-67,99,139
  config.ts           |   94.44 |    89.65 |      50 |   94.44 | 22
  delta.ts            |     100 |      100 |     100 |     100 |
  deltas.ts           |   66.66 |       60 |   78.57 |   66.66 | 33-36,48-52,61-62,70-79
  lossless.ts         |     100 |      100 |     100 |     100 |
  lossy.ts            |     100 |    85.71 |     100 |     100 | 48
  node.ts             |     100 |      100 |     100 |     100 |
  peers.ts            |   96.82 |      100 |     100 |   96.61 | 126-127
  pub-sub.ts          |     100 |      100 |     100 |     100 |
  request-reply.ts    |   95.65 |        0 |     100 |   95.34 | 46,59
  typed-collection.ts |     100 |      100 |     100 |     100 |
  types.ts            |     100 |      100 |     100 |     100 |
 src/http             |   66.25 |    13.04 |   52.17 |   66.66 |
  api.ts              |   56.41 |        0 |   42.85 |   56.75 | 15,20,27-43,49,66-67,82-88
  html.ts             |   56.52 |        0 |      40 |   56.52 | 17-18,23-30,35
  index.ts            |     100 |       75 |     100 |     100 | 36
 src/util             |   70.68 |    30.43 |   77.77 |   73.58 |
  md-files.ts         |   70.68 |    30.43 |   77.77 |   73.58 | 53-57,74-77,98-102,116-123
 util                 |     100 |      100 |     100 |     100 |
  app.ts              |     100 |      100 |     100 |     100 |
----------------------|---------|----------|---------|---------|----------------------------

Test Suites: 5 passed, 5 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        4.47 s
Ran all test suites.
