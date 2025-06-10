# TODO - Rhizome Node Spec Parity

This document tracks work needed to achieve full specification compliance, organized by priority and dependencies.

## Phase 1: Foundation (Prerequisites)

### 1.1 Delta Validation & Error Handling ✅
- [x] Implement delta structure validation
- [x] Add tests for invalid delta formats
- [x] Add tests for required fields (id, created, pointers)
- [x] Implement proper error types for delta operations
- [x] Add validation for pointer consistency

### 1.2 Complete Transaction Support ✅ (mostly)
- [x] Implement transaction-based filtering in lossless views
- [x] Add transaction grouping in delta streams
- [x] Test atomic transaction operations
- [ ] Add transaction rollback capabilities (deferred - not critical for spec parity)

### 1.3 Schema Foundation ✅
- [x] Design schema type definitions based on spec
- [x] Implement basic schema validation
- [x] Create schema registry/storage mechanism
- [x] Add property type enforcement
- [x] Test schema application to collections

## Phase 2: Core Features (Spec Compliance)

### 2.1 Negation Deltas ✅
- [x] Implement negation delta type with "negates" pointer
- [x] Add "negated_by" context handling
- [x] Update lossless view to handle negations
- [x] Update lossy resolvers to respect negations
- [x] Add comprehensive negation tests

### 2.2 Advanced Conflict Resolution
- [x] Implement numeric aggregation resolvers (min/max/sum/average)
- [x] Add timestamp-based ordering with tie-breaking
- [x] Add custom resolver plugin system
- [x] Test concurrent write scenarios

### 2.3 Nested Object Resolution ✅
- [x] Implement schema-controlled depth limiting
- [x] Add circular reference detection
- [x] Create "Summary" schema type for references
- [x] Test deep nesting scenarios
- [x] Add performance tests for large graphs

## Phase 3: Query System

### 3.1 Query Engine Foundation
- [ ] Implement JSON Logic parser
- [ ] Create query planner for lossless views
- [ ] Add query execution engine
- [ ] Implement query result caching
- [ ] Enable the skipped query tests

### 3.2 Query Optimizations
- [ ] Add index support for common queries
- [ ] Implement query cost estimation
- [ ] Add query result streaming
- [ ] Test query performance at scale

## Phase 4: Relational Features

### 4.1 Relational Schema Expression
- [ ] Design relational schema DSL
- [ ] Implement foreign key constraints
- [ ] Add relationship traversal in queries
- [ ] Implement join operations in lossy views
- [ ] Enable the skipped relational tests

### 4.2 Constraint Validation
- [ ] Add unique constraints
- [ ] Implement required field validation
- [ ] Add custom constraint functions
- [ ] Test constraint violations and error handling

## Phase 5: Advanced Features

### 5.1 View Optimizations
- [ ] Implement incremental view updates
- [ ] Add view materialization strategies
- [ ] Create view caching layer
- [ ] Add partial view generation

### 5.2 Network Resilience
- [ ] Add network partition handling
- [ ] Implement delta retry mechanisms
- [ ] Add peer health monitoring
- [ ] Test split-brain scenarios

### 5.3 Performance & Scale
- [ ] Add benchmarks for large datasets
- [ ] Implement delta pruning strategies
- [ ] Add memory-efficient view generation
- [ ] Create performance regression tests

## Phase 6: Developer Experience

### 6.1 Better TypeScript Support
- [ ] Improve TypedCollection type inference
- [ ] Add stricter schema typing
- [ ] Create type guards for delta operations
- [ ] Add better IDE autocomplete support

### 6.2 Debugging & Monitoring
- [ ] Add delta stream visualization
- [ ] Create conflict resolution debugger
- [ ] Add performance profiling hooks
- [ ] Implement comprehensive logging

### 6.3 Documentation
- [ ] Document schema definition format
- [ ] Create resolver implementation guide
- [ ] Add query language documentation
- [ ] Write migration guides from v1 to v2

## Testing Priorities

### High Priority (Block Progress)
1. Delta validation tests
2. Transaction support tests
3. Basic schema validation tests
4. Negation handling tests

### Medium Priority (Needed for Features)
1. Advanced resolver tests
2. Nested object tests
3. Query engine tests
4. Relational constraint tests

### Low Priority (Nice to Have)
1. Performance benchmarks
2. Network resilience tests
3. Large-scale integration tests

## Implementation Order

1. **Start with Phase 1** - These are foundational requirements
2. **Phase 2.1 (Negation)** - Core spec feature that affects all views
3. **Phase 2.2 (Resolvers)** - Needed for proper lossy views
4. **Phase 3 (Query)** - Unlocks powerful data access
5. **Phase 2.3 (Nesting)** - Depends on schemas and queries
6. **Phase 4 (Relational)** - Builds on query system
7. **Phase 5 & 6** - Optimization and polish

## Notes

- Each phase should include comprehensive tests before moving to the next
- Schema design in Phase 1.3 will impact many subsequent phases
- Query system (Phase 3) may reveal needs for index structures
- Consider creating integration tests that span multiple phases