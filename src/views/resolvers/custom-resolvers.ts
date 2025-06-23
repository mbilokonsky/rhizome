import { EntityProperties } from "../../core/entity";
import { CollapsedDelta, Lossless, LosslessViewOne } from "../lossless";
import { Lossy } from '../lossy';
import { DomainEntityID, PropertyID, PropertyTypes, ViewMany } from "../../core/types";

// Plugin interface for custom resolvers
export interface ResolverPlugin<T = unknown> {
  name: string;

  // Initialize the state for a property
  initialize(): T;

  // Process a new value for the property
  update(
    currentState: T, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    // Additional context including other properties' states
    context?: {
      // Current state of all properties for the entity
      entityState: Record<string, unknown>;
      // Current resolved values of all properties for the entity
      resolvedValues: Record<string, PropertyTypes>;
    }
  ): T;

  // Resolve the final value from the accumulated state
  resolve(
    state: T, 
    // Additional context including other properties' states
    context?: {
      // Current state of all properties for the entity
      entityState: Record<string, unknown>;
      // Current resolved values of all properties for the entity
      resolvedValues: Record<string, PropertyTypes>;
    }
  ): PropertyTypes | undefined;
}

// Configuration for custom resolver
export type CustomResolverConfig = {
  [propertyId: PropertyID]: ResolverPlugin;
};

type PropertyState = {
  plugin: ResolverPlugin;
  state: unknown;
};

type EntityState = {
  [propertyId: PropertyID]: PropertyState;
};

type CustomResolverAccumulator = {
  [entityId: DomainEntityID]: {
    id: DomainEntityID;
    properties: EntityState;
  };
};

type CustomResolverResult = ViewMany<{
  id: DomainEntityID;
  properties: EntityProperties;
}>;

// Extract value from delta for a specific property
function extractValueFromDelta(propertyId: PropertyID, delta: CollapsedDelta): PropertyTypes | undefined {
  for (const pointer of delta.pointers) {
    for (const [key, value] of Object.entries(pointer)) {
      if (key === propertyId && (typeof value === "string" || typeof value === "number")) {
        return value;
      }
    }
  }
  return undefined;
}

export class CustomResolver extends Lossy<CustomResolverAccumulator, CustomResolverResult> {
  constructor(
    lossless: Lossless,
    private config: CustomResolverConfig
  ) {
    super(lossless);
  }

  initializer(view: LosslessViewOne): CustomResolverAccumulator {
    return {
      [view.id]: { id: view.id, properties: {} }
    };
  }

  reducer(acc: CustomResolverAccumulator, cur: LosslessViewOne): CustomResolverAccumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }

    // First pass: collect all property states and resolved values
    const entityState: Record<string, unknown> = {};
    const resolvedValues: Record<string, PropertyTypes> = {};
    
    // Initialize all properties first
    for (const propertyId of Object.keys(cur.propertyDeltas)) {
      const plugin = this.config[propertyId];
      if (!plugin) continue;
      
      if (!acc[cur.id].properties[propertyId]) {
        acc[cur.id].properties[propertyId] = {
          plugin,
          state: plugin.initialize()
        };
      }
      
      // Store the current state
      entityState[propertyId] = acc[cur.id].properties[propertyId].state;
      
      // Resolve current value if possible
      try {
        const resolved = plugin.resolve(acc[cur.id].properties[propertyId].state, {
          entityState: {},
          resolvedValues: {}
        });
        if (resolved !== undefined) {
          resolvedValues[propertyId] = resolved;
        }
      } catch (_e) {
        // Ignore resolution errors during reduction
      }
    }

    // Second pass: process deltas with full context
    for (const [propertyId, deltas] of Object.entries(cur.propertyDeltas)) {
      const plugin = this.config[propertyId];
      if (!plugin) continue;

      const propertyState = acc[cur.id].properties[propertyId];
      const context = { entityState, resolvedValues };

      // Process all deltas for this property
      for (const delta of deltas || []) {
        const value = extractValueFromDelta(propertyId, delta);
        if (value !== undefined) {
          propertyState.state = plugin.update(
            propertyState.state, 
            value, 
            delta,
            context
          );
          
          // Update the resolved value after each update
          try {
            const resolved = plugin.resolve(propertyState.state, context);
            if (resolved !== undefined) {
              resolvedValues[propertyId] = resolved;
            }
          } catch (_e) {
            // Ignore resolution errors during reduction
          }
        }
      }
    }

    return acc;
  }

  resolver(cur: CustomResolverAccumulator): CustomResolverResult {
    const res: CustomResolverResult = {};

    for (const [entityId, entity] of Object.entries(cur)) {
      const entityResult: { id: string; properties: EntityProperties } = { id: entityId, properties: {} };
      
      // First pass: collect all property states
      const entityState: Record<string, unknown> = {};
      const resolvedValues: Record<string, PropertyTypes> = {};
      
      // Initialize with current states and resolve all properties
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        entityState[propertyId] = propertyState.state;
        // Initial resolution with empty context
        try {
          const resolved = propertyState.plugin.resolve(propertyState.state, {
            entityState: {},
            resolvedValues: {}
          });
          if (resolved !== undefined) {
            resolvedValues[propertyId] = resolved;
          }
        } catch (_e) {
          // Ignore resolution errors
        }
      }
      
      // Second pass: resolve with full context
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        const context = { entityState, resolvedValues };
        try {
          const resolvedValue = propertyState.plugin.resolve(propertyState.state, context);
          if (resolvedValue !== undefined) {
            entityResult.properties[propertyId] = resolvedValue;
            // Update the resolved value for dependent properties
            resolvedValues[propertyId] = resolvedValue;
          }
        } catch (_e) {
          // Ignore resolution errors
        }
      }

      // Only include entities that have at least one resolved property
      if (Object.keys(entityResult.properties).length > 0) {
        res[entityId] = entityResult;
      }
    }

    return res;
  }


}

// Built-in plugin implementations

// Last Write Wins plugin
export class LastWriteWinsPlugin implements ResolverPlugin<{ value?: PropertyTypes, timestamp: number }> {
  name = 'last-write-wins';

  initialize() {
    return { timestamp: 0 };
  }

  update(
    currentState: { value?: PropertyTypes, timestamp: number }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    if (delta.timeCreated > currentState.timestamp) {
      return {
        value: newValue,
        timestamp: delta.timeCreated
      };
    }
    return currentState;
  }

  resolve(state: { value?: PropertyTypes, timestamp: number }): PropertyTypes {
    return state.value || '';
  }
}

// First Write Wins plugin
export class FirstWriteWinsPlugin implements ResolverPlugin<{ value?: PropertyTypes, timestamp: number }> {
  name = 'first-write-wins';

  initialize() {
    return { timestamp: Infinity };
  }

  update(
    currentState: { value?: PropertyTypes, timestamp: number }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    if (delta.timeCreated < currentState.timestamp) {
      return {
        value: newValue,
        timestamp: delta.timeCreated
      };
    }
    return currentState;
  }

  resolve(state: { value?: PropertyTypes, timestamp: number }): PropertyTypes {
    return state.value || '';
  }
}

// Concatenation plugin (for string values)
export class ConcatenationPlugin implements ResolverPlugin<{ values: { value: string, timestamp: number }[] }> {
  name = 'concatenation';

  constructor(private separator: string = ' ') { }

  initialize() {
    return { values: [] };
  }

  update(
    currentState: { values: { value: string, timestamp: number }[] }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    if (typeof newValue === 'string') {
      // Check if this value already exists (avoid duplicates)
      const exists = currentState.values.some(v => v.value === newValue);
      if (!exists) {
        currentState.values.push({
          value: newValue,
          timestamp: delta.timeCreated
        });
        // Sort by timestamp to maintain chronological order
        currentState.values.sort((a, b) => a.timestamp - b.timestamp);
      }
    }
    return currentState;
  }

  resolve(
    state: { values: { value: string, timestamp: number }[] },
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ): PropertyTypes {
    return state.values.map(v => v.value).join(this.separator);
  }
}

// Majority vote plugin
export class MajorityVotePlugin implements ResolverPlugin<{ votes: Map<PropertyTypes, number> }> {
  name = 'majority-vote';

  initialize() {
    return { votes: new Map() };
  }

  update(
    currentState: { votes: Map<PropertyTypes, number> }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    const count = (currentState.votes.get(newValue) || 0) + 1;
    currentState.votes.set(newValue, count);
    return currentState;
  }

  resolve(
    state: { votes: Map<PropertyTypes, number> },
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ): PropertyTypes {
    let maxVotes = 0;
    let result: PropertyTypes = '';
    
    for (const [value, count] of state.votes.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        result = value;
      }
    }
    
    return result;
  }
}

// Numeric min/max plugins
export class MinPlugin implements ResolverPlugin<{ min?: number }> {
  name = 'min';

  initialize() {
    return {};
  }

  update(
    currentState: { min?: number }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    if (typeof newValue === 'number') {
      if (currentState.min === undefined || newValue < currentState.min) {
        return { min: newValue };
      }
    }
    return currentState;
  }

  resolve(
    state: { min?: number },
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ): PropertyTypes | undefined {
    return state.min;
  }
}

export class MaxPlugin implements ResolverPlugin<{ max?: number }> {
  name = 'max';

  initialize() {
    return {};
  }

  update(
    currentState: { max?: number }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ) {
    if (typeof newValue === 'number') {
      if (currentState.max === undefined || newValue > currentState.max) {
        return { max: newValue };
      }
    }
    return currentState;
  }

  resolve(
    state: { max?: number },
    _context?: { entityState: Record<string, unknown>, resolvedValues: Record<string, PropertyTypes> }
  ): PropertyTypes | undefined {
    return state.max;
  }
}