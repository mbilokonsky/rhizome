# Merge Request: Major Cleanup and Refactoring

## Overview
This MR represents a significant cleanup and refactoring effort, focusing on improving code organization, test structure, and documentation. The changes touch multiple areas of the codebase with a particular emphasis on the custom resolvers system and test infrastructure.

## Key Changes

### 1. Code Organization & Structure
- Reorganized test files into logical directories (`unit/`, `integration/`, `e2e/`, `performance/`)
- Moved and refactored custom resolvers into a more modular plugin architecture
- Created dedicated directories for documentation and planning artifacts

### 2. New Features & Enhancements
- Implemented JSON AST functionality for better delta analysis
- Enhanced plugin system with inter-plugin dependency support
- Added new built-in resolver plugins:
  - Concatenation
  - First Write Wins
  - Last Write Wins
  - Majority Vote
  - Max/Min
  - Running Average

### 3. Refactoring & Improvements
- Replaced `NegationHelper.createNegation` with `DeltaBuilder.negate`
- Improved relationship graph implementation
- Optimized lossless view resolution
- Enhanced resolver dependency handling and logging
- Added comprehensive test coverage for new and refactored components

### 4. Documentation
- Added extensive documentation for custom resolvers API
- Created documentation for delta patterns and schema validation
- Added test helper documentation
- Organized planning documents in `__plans__/` directory

### 5. Build & Tooling
- Added module alias `@src` for better import paths
- Removed unused scripts and logs
- Updated package dependencies

## Testing
- Added numerous unit tests for new functionality
- Reorganized test files for better maintainability
- Added performance test cases
- Ensured backward compatibility through comprehensive test coverage

## Migration Notes
- Some test files have been moved to new locations
- Custom resolvers now use the new plugin architecture
- Dependencies between resolvers should now be handled through the new dependency system

## Next Steps
- Review the new plugin architecture documentation
- Update any custom resolvers to use the new plugin system
- Test performance impact of the changes in production-like environments

## Related Issues
- [Reference any related issues or tickets here]
