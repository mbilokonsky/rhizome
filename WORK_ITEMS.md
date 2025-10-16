# Rhizome DB - Work Items & Technical Debt

**Generated from conversation on October 16, 2025**

This document tracks work items, refactoring needs, and architectural decisions identified during the Leo/collaborator technical discussion.

---

## Critical Architecture Issues

### 1. Schema System Refactor
**Priority: HIGH**

**Current State:**
- Schemas are hard-coded in `util/schemas.ts` (User, UserSummary, Document)
- Uses legacy implementation from Lad
- HTTP endpoints are tied to hard-coded schemas (e.g., `POST /api/user`)

**Target State:**
- Only the bootstrap "schema schema" should be hard-coded
- All other schemas should be dynamic, stored as deltas in the database
- Schemas should be composable from delta streams

**Action Items:**
- [ ] Design and implement bootstrap schema schema
- [ ] Remove hard-coded User/UserSummary/Document schemas from `util/schemas.ts`
- [ ] Implement dynamic schema loading from delta storage
- [ ] Update schema validation to work with dynamic schemas
- [ ] Add tests for dynamic schema creation and modification

**References:**
- `util/schemas.ts` - contains legacy hard-coded schemas
- `src/schema/` - schema system implementation

---

### 2. HyperView Implementation
**Priority: HIGH**

**Current State:**
- Primordial implementation exists: `storage.getDeltasForEntity(entityId)`
- Returns ALL deltas that reference an entity, regardless of schema
- No schema-aware filtering
- No nested resolution control

**Target State:**
- HyperView should accept a HyperSchema definition
- Filter deltas based on schema (only return deltas for defined properties)
- Support nested resolution with depth control (e.g., User with friends, but friends don't have friends)
- Organize deltas into coherent tree view for view layer consumption

**Example Use Case:**
```typescript
// Want: getDeltasForEntity('user:2', UserSchema)
// UserSchema defines: name, age, email, friends
// Should return:
// - Deltas for name/age/email (terminal strings)
// - Deltas for friends, but friends only get name/age/email
// - Ignore deltas for properties not in schema (e.g., favoriteFood)
```

**Action Items:**
- [ ] Design HyperSchema interface
- [ ] Implement schema-aware delta filtering
- [ ] Add nested resolution with depth/recursion control
- [ ] Build tree view assembly from filtered deltas
- [ ] Add comprehensive tests for various schema shapes
- [ ] Document HyperView query patterns

**References:**
- `__tests__/integration/storage.test.ts` line 134-137 - current primordial implementation
- `src/views/` - view system implementation

---

### 3. Application Layer Premature Implementation
**Priority: MEDIUM (Removal/Deprecation)**

**Current State:**
- HTTP/API layer exists in `src/http/`
- Node instantiation and app setup in `src/node.ts`
- Network layer in `src/network/`
- Built top-down before lower layers were stable
- Examples (`examples/app.ts`, `examples/app-leveldb.ts`) depend on HTTP layer

**Issues:**
- Lower layers (storage, schema, query) not locked down yet
- Building on unstable foundation creates risk
- Forces hard-coded schemas due to HTTP endpoint design
- Networking is premature - should come LAST

**Target State:**
- Focus on library usage, not HTTP endpoints
- Direct delta writing to storage engine
- HTTP/networking layer rebuilt once foundation is solid

**Action Items:**
- [ ] Mark HTTP/app layer as experimental in docs
- [ ] Create library-first examples (write deltas directly)
- [ ] Document that HTTP layer is WIP and may change
- [ ] Move `examples/app.ts` and `examples/app-leveldb.ts` to `examples/experimental/`
- [ ] Create new example: direct LevelDB delta writing
- [ ] Defer networking layer work until storage/schema/query are stable

**References:**
- `src/http/` - HTTP API implementation
- `src/node.ts` - Node/app instantiation
- `src/network/` - networking layer
- `examples/app.ts`, `examples/app-leveldb.ts` - HTTP-based examples

---

### 4. Query Engine Enhancement
**Priority: MEDIUM**

**Current State:**
- Basic querying supported via `storage.getDeltasForEntity()`
- Query engine exists in `src/query/`
- Not fully featured
- No schema-aware querying

**Target State:**
- Schema-aware query interface
- Support for complex filters (by property, time range, author)
- Integration with HyperView for structured results
- Query planning and optimization

**Action Items:**
- [ ] Audit current query capabilities in `src/query/`
- [ ] Design schema-aware query API
- [ ] Implement property-based filtering
- [ ] Add time-range queries (temporal queries)
- [ ] Add author/source filtering
- [ ] Integrate with HyperView for structured output
- [ ] Performance testing and optimization
- [ ] Document query patterns and examples

**References:**
- `src/query/query-engine.ts`
- `src/query/storage-query-engine.ts`
- `__tests__/integration/storage.test.ts`

---

## Code Quality & Developer Experience

### 5. Delta Builder Pattern
**Priority: LOW (Style preference)**

**Current State:**
- Fluent/builder pattern for delta creation (Java-ish style)
- Works fine, tests pass

**Preference:**
- Interface + factory function pattern
- More functional/TypeScript idiomatic

**Action Items:**
- [ ] (Optional) Refactor delta builder to use factory functions
- [ ] Ensure backwards compatibility or update all tests
- [ ] Document preferred patterns in CONTRIBUTING.md

**References:**
- `src/core/delta-builder.ts`
- Delta creation throughout test files

---

### 6. Documentation Overhaul
**Priority: HIGH**

**Current State:**
- "Docs are all over the fucking place" (per conversation)
- Half the MD files are out of date
- Schema interfaces not quite right in docs
- Tests are currently the canonical source of truth
- Multiple documentation locations: `docs/`, `markdown/`, inline, `__plans__/`

**Issues:**
- Confuses developers and AI assistants
- Contradictory information across files
- Hard to onboard new contributors

**Target State:**
- Single source of truth for each concept
- Clear hierarchy: specs → architecture → API docs → examples
- Regular doc validation/updates
- Tests remain source of truth for behavior

**Action Items:**
- [ ] Audit all MD files in repo
  - [ ] `docs/` directory
  - [ ] `markdown/` directory  
  - [ ] `__plans__/` directory
  - [ ] Root-level MD files
- [ ] Mark outdated docs clearly (add "OUTDATED" header)
- [ ] Consolidate overlapping documentation
- [ ] Create documentation index/map
- [ ] Establish doc maintenance process
- [ ] Link docs to relevant test files
- [ ] Add "Last Updated" dates to all docs
- [ ] Remove or archive obsolete docs

**Specific Files Mentioned:**
- Schema interface docs are out of date
- Check `spec.md` vs actual implementation

---

### 7. Codebase Cleanup
**Priority: MEDIUM**

**Current State:**
- Unknown/unused folders (e.g., `windsurf/` mentioned but not in current listing)
- Unclear what's important vs experimental
- Mix of old (Lad's) and new implementation approaches

**Action Items:**
- [ ] Identify and document purpose of all top-level directories
- [ ] Remove or clearly mark experimental code
- [ ] Add README to each major directory explaining its purpose
- [ ] Clean up unused imports and dead code
- [ ] Establish clear module boundaries
- [ ] Document what's legacy vs current implementation

---

### 8. Test Coverage Maintenance
**Priority: MEDIUM**

**Current State:**
- Good test coverage exists
- Tests pass ✅
- Tests are canonical source of truth (good!)
- Coverage across unit, integration, e2e, performance

**Action Items:**
- [ ] Maintain tests as primary documentation
- [ ] Add test descriptions that explain the "why"
- [ ] Ensure all new features have tests first (TDD)
- [ ] Add tests for schema refactor as it happens
- [ ] Add tests for HyperView implementation
- [ ] Document test organization in `__tests__/README.md`

**References:**
- `__tests__/` - all test directories
- Good coverage in unit, integration, e2e, performance

---

## Use Case: Leo's Content Analysis System

### 9. Library Usage Pattern for Content Ingestion
**Priority: HIGH (Drives real-world usage)**

**Background:**
- Leo wants to ingest 5 years of content (blog posts, YouTube, etc.)
- Extract: entities, transformations, attributes
- Store as deltas in LevelDB
- Build "Idea Rank" scoring across multiple dimensions
- This is the first real use case driving development

**Current Approach:**
- Leo has extraction code working
- Needs to write deltas to LevelDB
- Should use library interface, not HTTP

**Action Items:**
- [ ] Create example: bulk delta import to LevelDB
- [ ] Document delta schema for content entities
- [ ] Create helper for batch delta writing
- [ ] Add indexing for content queries
- [ ] Support reactor pattern for computing scores
- [ ] Document pattern for recursive/computed deltas
- [ ] Performance test with realistic data volume (5 years of content)

**Reactor Pattern Note:**
- When content delta comes in → trigger computation → generate score delta
- Each piece of content can compute IdeaRank score in isolation or with context
- Score dimensions: uniqueness, cohesion, learning, quality, citations, density

---

## Storage Layer

### 10. Storage Focus: Write Path First
**Priority: HIGH**

**Guidance from conversation:**
- Focus on write side of storage
- Don't worry about get side initially
- Deltas are immutable, append-only
- "Just get them in there"
- Can figure out query tier later

**Action Items:**
- [ ] Optimize delta write performance to LevelDB
- [ ] Add batch write support
- [ ] Add write validation
- [ ] Document delta write patterns
- [ ] Add monitoring/metrics for writes
- [ ] Defer read optimization until write path is solid

**References:**
- `src/storage/leveldb.ts`
- `src/storage/interface.ts`
- `__tests__/integration/storage.test.ts`

---

## Long-term Architecture

### 11. Networking Layer (DEFERRED)
**Priority: LOW - Do not start until foundation is stable**

**Current State:**
- Networking code exists in `src/network/`
- Was Lad's primary interest
- Includes delta-stream, peers, pub-sub, request-reply

**Decision:**
- Networking comes LAST
- Cannot build networking on unstable foundation
- Risk of wasted work if lower layers change

**Action Items:**
- [ ] Document networking is deferred
- [ ] Mark `src/network/` as experimental/unstable
- [ ] Establish prerequisites before networking work resumes:
  - [ ] Schema system stable
  - [ ] HyperView working
  - [ ] Query engine functional
  - [ ] Storage layer performant
  - [ ] Library usage patterns established

**References:**
- `src/network/` - entire directory deferred

---

## Process & Collaboration

### 12. PR Workflow for Learning
**Priority: ONGOING**

**Leo's Approach:**
- Uses PRs as learning tool
- "Figure out what I'm doing wrong"
- Fast iteration, needs feedback on unknown unknowns

**Guidelines:**
- PRs are for exploration and feedback
- Expect iteration and discussion
- Focus on teaching patterns and principles
- Point out architectural mismatches

---

## Quick Wins

### 13. Immediate Next Steps for Leo's Use Case

1. **Create library example** (first step)
   ```typescript
   // examples/direct-leveldb-import.ts
   const storage = getStorage('leveldb', { path: './data/content' });
   
   // Write deltas directly
   const delta = {
     entity: 'content:blog-post-123',
     attribute: 'title',
     value: 'My Blog Post',
     timestamp: Date.now(),
     author: 'leo'
   };
   
   await storage.storeDelta(delta);
   ```

2. **Document delta schema for content**
   - What entities? (BlogPost, YouTubeVideo, Tweet, etc.)
   - What attributes? (title, content, published_date, url, etc.)
   - What relationships? (references, topics, etc.)

3. **Batch import helper**
   - Function to import array of deltas
   - Transaction support
   - Progress reporting

4. **Verify with real data**
   - Import subset of Leo's content
   - Validate storage
   - Query back
   - Iterate

---

## Notes & Context

### Philosophical Alignment
- Delta = observation of state (not state itself)
- Event sourcing: state derived from deltas
- Can retroactively add/filter/merge delta streams
- Observer timestamp ≠ observed entity time (diegetic time is separate property)

### Conscious OSI Stack (Leo's Framework)
Reference for understanding use case, not directly part of Rhizome:
1. Embodiment (IdeaRank - content analysis)
2. Accountability (time tracking)
3. Awareness
4. Empathy
5. Trust
6. Reflection
7. Meaning

### Key Quote
> "The docs on this thing are all over the fucking place. I would look at the test as the canonical source of truth."

---

## Maintenance

**Last Updated:** October 16, 2025
**Next Review:** After schema refactor completion

**How to Use This File:**
- Check off items as completed
- Add new items as they're discovered
- Link to PRs that address items
- Update priorities as project evolves
- Archive completed sections to separate file when major milestones hit

