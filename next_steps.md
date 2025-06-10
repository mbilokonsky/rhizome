# Next Steps - LevelDB Storage Tests & Cleanup

This document provides context and instructions for completing the storage system implementation in the next Claude Code session.

## Current Status ✅

- **Directory reorganization**: COMPLETE ✅
- **Storage abstraction**: COMPLETE ✅ 
- **Memory storage**: COMPLETE ✅ (9/9 tests passing)
- **LevelDB storage**: CODE COMPLETE ✅ (tests need fixing)
- **Query engines**: COMPLETE ✅ (both lossless and storage-based)
- **RhizomeNode integration**: COMPLETE ✅
- **Build system**: COMPLETE ✅ (clean compilation)
- **Test suite**: 21/22 suites passing, 174/186 tests passing

## Immediate Tasks 🔧

### 1. Fix LevelDB Storage Tests (Priority: HIGH)

**Issue**: LevelDB tests fail with "Database is not open" error

**Location**: `__tests__/storage.ts` (currently skipped on line 53)

**Root Cause**: LevelDB requires explicit opening in newer versions

**Solution Strategy**:
```typescript
// In LevelDBDeltaStorage constructor or storeDelta method:
async ensureOpen() {
  if (this.db.status !== 'open') {
    await this.db.open();
  }
}

// Call before any operation:
await this.ensureOpen();
```

**Files to modify**:
- `src/storage/leveldb.ts` - Add auto-opening logic
- `__tests__/storage.ts` - Remove `.skip` from line 53

**Test command**: `npm test -- __tests__/storage.ts`

### 2. Complete Linting Cleanup (Priority: MEDIUM)

**Current lint issues**: 45 errors (mostly unused vars and `any` types)

**Key files needing attention**:
- `src/query/query-engine.ts` - Remove unused imports, fix `any` types
- `src/query/storage-query-engine.ts` - Fix `any` types in JsonLogic
- `src/storage/leveldb.ts` - Remove unused loop variables (prefix with `_`)
- Various test files - Remove unused `RhizomeImports`

**Quick fixes**:
```typescript
// Instead of: for (const [key, value] of iterator)
// Use: for (const [_key, value] of iterator)

// Instead of: JsonLogic = Record<string, any>
// Use: JsonLogic = Record<string, unknown>
```

### 3. Enable Relational Tests (Priority: LOW)

**Currently skipped**: `__tests__/relational.ts` 

**Check**: Whether relational collection tests work with new directory structure

## Context for Next Session 📝

### Storage Architecture Overview

The storage system now supports pluggable backends:

```
RhizomeNode
├── lossless (in-memory views)
├── deltaStorage (configurable backend)
├── queryEngine (lossless-based, backward compatible)  
└── storageQueryEngine (storage-based, new)
```

**Configuration via environment**:
- `RHIZOME_STORAGE_TYPE=memory|leveldb` 
- `RHIZOME_STORAGE_PATH=./data/rhizome`

### Key Files & Their Purposes

```
src/
├── storage/
│   ├── interface.ts     # DeltaStorage + DeltaQueryStorage interfaces
│   ├── memory.ts        # MemoryDeltaStorage (working ✅)
│   ├── leveldb.ts       # LevelDBDeltaStorage (needs open() fix)
│   ├── factory.ts       # StorageFactory for backend switching
│   └── store.ts         # Legacy store (kept for compatibility)
├── query/
│   ├── query-engine.ts      # Original lossless-based (working ✅)
│   └── storage-query-engine.ts # New storage-based (working ✅)
└── node.ts              # Integrates both storage & query engines
```

### Test Strategy

1. **Memory storage**: Fully working, use as reference
2. **LevelDB storage**: Same interface, just needs DB opening
3. **Storage factory**: Already tested and working
4. **Query engines**: Both working with reorganized imports

## Success Criteria 🎯

**When complete, you should have**:
- [ ] All storage tests passing (both memory and LevelDB)
- [ ] Lint errors reduced to <10 (from current 45)
- [ ] Documentation updated for storage backends
- [ ] Optional: Relational tests re-enabled

**Test command for validation**:
```bash
npm test                    # Should be 22/22 suites passing
npm run lint               # Should have <10 errors
npm run build              # Should compile cleanly (already working)
```

## Notes & Gotchas ⚠️

1. **LevelDB opening**: The Level library changed APIs - databases need explicit opening
2. **Import paths**: All fixed, but watch for any remaining `../` vs `./` issues  
3. **TypeScript**: Using ES modules (`"type": "module"`) - imports must include file extensions if needed
4. **Test isolation**: LevelDB tests should use unique DB paths to avoid conflicts
5. **Cleanup**: LevelDB creates real files - tests should clean up temp directories

## Phase 4 Readiness

Once this storage work is complete, the codebase will be ready for **Phase 4: Relational Features** with:
- ✅ Clean, organized directory structure
- ✅ Pluggable storage backends (memory + persistent)
- ✅ Dual query engines (lossless + storage-based)
- ✅ Comprehensive test coverage
- ✅ Solid architecture for relational schema expressions

The storage abstraction provides the foundation needed for advanced relational features like foreign key constraints, join operations, and complex queries across collections.