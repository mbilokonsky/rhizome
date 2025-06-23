# Plugin Dependency Visibility Implementation Plan

## Overview
This document outlines the implementation plan for enforcing restricted state visibility in the CustomResolver system. The goal is to ensure that each plugin can only access the states of properties it has explicitly declared as dependencies.

## Current Behavior
- All plugins currently receive the complete `allStates` object containing all property states
- There's no enforcement of which states a plugin can access
- Dependencies are declared but not used for access control

## Proposed Changes

### 1. Update ResolverPlugin Interface
```typescript
interface ResolverPlugin<T = unknown> {
  name: string;
  dependencies?: PropertyID[];  // Explicitly declare which properties this plugin depends on
  // ... rest of the interface
}
```

### 2. Modify CustomResolver Implementation

#### 2.1 Update Reducer Method
Modify the `reducer` method to filter states before passing to plugins:

```typescript
public reducer(
  acc: CustomResolverAccumulator,
  cur: LosslessViewOne
): CustomResolverAccumulator {
  // ... existing setup code ...

  // Process each property in execution order
  for (const propertyId of executionOrder) {
    // ... existing delta processing ...
    
    // Create filtered states object with only declared dependencies
    const visibleStates: Record<PropertyID, unknown> = {};
    
    // Add states for declared dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (allStates[dep] !== undefined) {
          visibleStates[dep] = allStates[dep];
        }
      }
    }

    // Pass only visible states to the plugin
    propertyState.state = propertyState.plugin.update(
      propertyState.state,
      value,
      delta,
      visibleStates
    );
    
    // ... rest of the method ...
  }
}
```

#### 2.2 Update Resolver Method
Similarly update the `resolver` method:

```typescript
resolver(cur: CustomResolverAccumulator): CustomResolverResult {
  const res: CustomResolverResult = {};

  for (const [entityId, entity] of Object.entries(cur)) {
    const entityResult = { id: entityId, properties: {} };
    const allStates: Record<PropertyID, unknown> = {};

    // First pass: collect all states
    for (const [propId, propState] of Object.entries(entity.properties)) {
      allStates[propId] = propState.state;
    }

    // Second pass: resolve each property with filtered states
    for (const [propId, propState] of Object.entries(entity.properties)) {
      const plugin = propState.plugin;
      const visibleStates: Record<PropertyID, unknown> = {};
      
      // Only include declared dependencies
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (allStates[dep] !== undefined) {
            visibleStates[dep] = allStates[dep];
          }
        }
      }

      const resolvedValue = plugin.resolve(propState.state, visibleStates);
      if (resolvedValue !== undefined) {
        entityResult.properties[propId] = resolvedValue;
      }
    }

    if (Object.keys(entityResult.properties).length > 0) {
      res[entityId] = entityResult;
    }
  }

  return res;
}
```

### 3. Add Validation
Add validation to ensure dependencies exist:

```typescript
private validateDependencies(): void {
  // Existing cycle detection...
  
  // Add validation that all dependencies exist
  for (const [pluginId, plugin] of Object.entries(this.config)) {
    for (const dep of plugin.dependencies || []) {
      if (!this.config[dep]) {
        throw new Error(`Plugin '${pluginId}' depends on unknown property: ${dep}`);
      }
    }
  }
}
```

### 4. Update Tests
1. Add tests for state visibility:
   - Test that plugins only receive their declared dependencies
   - Test that plugins can't access undeclared dependencies
   - Test that dependency validation works
   - Test that existing functionality remains unchanged

2. Update existing tests to account for the new behavior

## Migration Strategy
1. This is a breaking change for any plugins that were accessing undeclared dependencies
2. Add warnings in the next minor version
3. Make the behavior opt-in initially with a flag
4. In the next major version, make it the default

## Implementation Steps
1. [ ] Add the state filtering to `reducer`
2. [ ] Add the state filtering to `resolver`
3. [ ] Update dependency validation
4. [ ] Add comprehensive tests
5. [ ] Update documentation
6. [ ] Add deprecation warnings for plugins accessing undeclared dependencies

## Future Considerations
1. Add a debug mode that logs when plugins access undeclared dependencies
2. Consider adding granular permissions (read/write) for dependencies
3. Add support for wildcard dependencies for plugins that need access to many properties