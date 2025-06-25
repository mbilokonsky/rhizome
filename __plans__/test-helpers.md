# Test structure
- before test, initialize node and lossless view
- when test begins, create and ingest a series of deltas
- instantiate a resolver, in this case using custom resolver plugins
- call the resolver's initializer with the view
- call the resolver's reducer with the view
- call the resolver's resolver with the view
- expect the resolver to return the expected result

# Follow-up
- why isn't the resolver being called automatically, by event dispatch?
- we can prepare an array of deltas and pass it to a test helper,
- So our entire test case should consist of the deltas, the resolver, and the expected result.
