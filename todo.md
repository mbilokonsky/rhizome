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
- [x] Implement transaction-based filtering in hyperviews
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
- [x] Update hyperview to handle negations
- [x] Update view resolvers to respect negations
- [x] Add comprehensive negation tests

### 2.2 Advanced Conflict Resolution ✅
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

### 3.1 Query Engine Foundation ✅
- [x] Implement JSON Logic parser (using json-logic-js)
- [x] Create query planner for hyperviews
- [x] Add query execution engine (QueryEngine class)
- [x] Implement schema-driven entity discovery
- [x] Enable the skipped query tests
- [x] Add HTTP API endpoints for querying
- [x] Integrate QueryEngine into RhizomeNode

### 3.2 LevelDB Storage Layer
- [x] Implement LevelDB storage for deltas
- [x] Implement query engine interface against LevelDB
- [x] Write tests ensuring parity between in-memory and LevelDB query capabilities

### 3.3 Query Optimizations (Future)
- [ ] Add index support for common queries
- [ ] Implement query cost estimation
- [ ] Add query result streaming
- [ ] Test query performance at scale
- [ ] Add query result caching with invalidation

## Phase 4: Delta Schemas, Hyperview Schemas and View Schemas
See the [On Schemas](./spec.md#on-schemas) section of the spec for details. We are going to be expanding on the schema work done so far.

### 4.1 Delta Schemas
- [ ] Implement delta schemas that define the structure of deltas
- [ ] Add schema validation for deltas
- [ ] Create mapping between deltas schemas as rhizome entities and delta schemas as typescript types
- [ ] Add tests for delta schema validation

### 4.2 Hyperview Schemas
- [ ] Implement hyperview schemas that define the structure of hyperviews
- [ ] Partial Application semantics for hyperviews
- [ ] Materialize hyperview schema from delta store
- [ ] Hydrate hyperview schema using query engine
- [ ] Add tests for hyperview schema application

### 4.3 View Schemas
- [ ] Implement view schemas that define the structure of views
- [ ] Add view schema validation against hyperview schemas
- [ ] Create view schema resolvers against hyperview schemas
- [ ] Implement view schema caching
- [ ] Add tests for view schema validation and resolution
- [ ] Prepare for GQL integration in phase 6.

## Phase 5: Delta Patterns & Query Traversal

### 5.1 Delta Pattern Recognition
- [ ] Define common delta patterns (authorship, membership, etc.)
- [ ] Create pattern matching utilities
- [ ] Build pattern validation (guidance, not enforcement)
- [ ] Document delta-as-relationship philosophy

### 5.2 Pattern-Aware Queries
- [ ] Extend QueryEngine with pattern traversal methods
- [ ] Add multi-perspective query support
- [ ] Implement temporal relationship queries
- [ ] Create relationship history and timeline queries

### 5.3 Pattern-Based Resolvers
- [ ] Build pattern-aware resolvers for common relationships
- [ ] Implement competing relationship resolution
- [ ] Add missing relationship detection
- [ ] Create resolver composition utilities

### 5.4 Schema-as-Deltas (Meta-Schema System)
- [ ] Define schema entities that are stored as deltas in the system
- [ ] Implement schema queries that return schema instances from hyperviews
- [ ] Create schema evolution through delta mutations
- [ ] Add temporal schema queries (schema time-travel)
- [ ] Build schema conflict resolution for competing schema definitions
- [ ] Test runtime schema updates and their effects on existing data

## Phase 6: GraphQL API Layer

### 6.1 GraphQL Schema Generation
- [ ] Generate GraphQL schemas from Rhizome schemas
- [ ] Map delta patterns to GraphQL relationships
- [ ] Support multiple schema perspectives (published, draft, etc.)
- [ ] Add GraphQL directives for perspective control

### 6.2 GraphQL Resolvers
- [ ] Implement resolvers that traverse delta patterns
- [ ] Add support for nested relationship queries
- [ ] Handle temporal queries (time-travel via arguments)
- [ ] Implement competing value resolution in GraphQL context

### 6.3 GraphQL Mutations
- [ ] Create mutations that generate appropriate deltas
- [ ] Handle relationship creation/updates via delta generation
- [ ] Implement negation mutations for "deletes"
- [ ] Add transaction support for multi-delta mutations

### 6.4 GraphQL Subscriptions
- [ ] Stream delta updates as GraphQL subscriptions
- [ ] Filter subscriptions by pattern/entity
- [ ] Support real-time relationship updates
- [ ] Add perspective-aware subscription filtering

## Phase 7: Performance & Optimization

### 7.1 View Optimizations
- [ ] Implement incremental view updates
- [ ] Add view materialization strategies
- [ ] Create view caching layer
- [ ] Add partial view generation

### 7.2 Network Resilience
- [ ] Add network partition handling
- [ ] Implement delta retry mechanisms
- [ ] Add peer health monitoring
- [ ] Test split-brain scenarios

### 7.3 Performance & Scale
- [ ] Add benchmarks for large datasets
- [ ] Implement delta pruning strategies
- [ ] Add memory-efficient view generation
- [ ] Create performance regression tests

## Phase 8: Developer Experience

### 8.1 Better TypeScript Support
- [ ] Improve TypedCollection type inference
- [ ] Add stricter schema typing
- [ ] Create type guards for delta operations
- [ ] Add better IDE autocomplete support

### 8.2 Debugging & Monitoring
- [ ] Add delta stream visualization
- [ ] Create conflict resolution debugger
- [ ] Add performance profiling hooks
- [ ] Implement comprehensive logging

### 8.3 Documentation
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
1. Advanced resolver tests ✅
2. Nested object tests ✅
3. Query engine tests ✅
4. Relational constraint tests

### Low Priority (Nice to Have)
1. Performance benchmarks
2. Network resilience tests
3. Large-scale integration tests

## Notes

- Each phase should include comprehensive tests before moving to the next
- Schema design in Phase 1.3 will impact many subsequent phases
- Query system (Phase 3) may reveal needs for index structures
- Consider creating integration tests that span multiple phases