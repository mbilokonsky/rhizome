describe('Relational', () => {
  it.skip('Allows expressing a domain ontology as a relational schema', async () => {});

  // Deltas can be filtered at time of view resolution, and 
  // excluded if they violate schema constraints;
  // Ideally the sender minimizes this by locally validating against the constraints.
  // For cases where deltas conflict, there can be a resolution process, 
  // with configurable parameters such as duration, quorum, and so on;
  // or a deterministic algorithm can be applied.
  
  it.skip('Can validate a delta against a relational constraint', async () => {});
  it.skip('Can validate a delta against a set of relational constraints', async () => {});
});
