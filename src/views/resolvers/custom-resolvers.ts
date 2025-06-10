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
  update(currentState: T, newValue: PropertyTypes, delta: CollapsedDelta): T;

  // Resolve the final value from the accumulated state
  resolve(state: T): PropertyTypes;
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

  initializer(): CustomResolverAccumulator {
    return {};
  }

  reducer(acc: CustomResolverAccumulator, cur: LosslessViewOne): CustomResolverAccumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }

    for (const [propertyId, deltas] of Object.entries(cur.propertyDeltas)) {
      const plugin = this.config[propertyId];
      if (!plugin) continue;

      // Initialize property state if not exists
      if (!acc[cur.id].properties[propertyId]) {
        acc[cur.id].properties[propertyId] = {
          plugin,
          state: plugin.initialize()
        };
      }

      const propertyState = acc[cur.id].properties[propertyId];

      // Process all deltas for this property
      for (const delta of deltas || []) {
        const value = extractValueFromDelta(propertyId, delta);
        if (value !== undefined) {
          propertyState.state = propertyState.plugin.update(propertyState.state, value, delta);
        }
      }
    }

    return acc;
  }

  resolver(cur: CustomResolverAccumulator): CustomResolverResult {
    const res: CustomResolverResult = {};

    for (const [entityId, entity] of Object.entries(cur)) {
      const entityResult: { id: string; properties: EntityProperties } = { id: entityId, properties: {} };

      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        const resolvedValue = propertyState.plugin.resolve(propertyState.state);
        entityResult.properties[propertyId] = resolvedValue;
      }

      // Only include entities that have at least one resolved property
      if (Object.keys(entityResult.properties).length > 0) {
        res[entityId] = entityResult;
      }
    }

    return res;
  }

  // Override resolve to build accumulator on-demand if needed
  resolve(entityIds?: DomainEntityID[]): CustomResolverResult | undefined {
    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    // If we don't have an accumulator, build it from the lossless view
    if (!this.accumulator) {
      this.accumulator = this.initializer();

      const fullView = this.lossless.view(entityIds, this.deltaFilter);

      for (const entityId of entityIds) {
        const losslessViewOne = fullView[entityId];
        if (losslessViewOne) {
          this.accumulator = this.reducer(this.accumulator, losslessViewOne);
        }
      }
    }

    if (!this.accumulator) return undefined;

    return this.resolver(this.accumulator);
  }
}

// Built-in plugin implementations

// Last Write Wins plugin
export class LastWriteWinsPlugin implements ResolverPlugin<{ value?: PropertyTypes, timestamp: number }> {
  name = 'last-write-wins';

  initialize() {
    return { timestamp: 0 };
  }

  update(currentState: { value?: PropertyTypes, timestamp: number }, newValue: PropertyTypes, delta: CollapsedDelta) {
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

  update(currentState: { value?: PropertyTypes, timestamp: number }, newValue: PropertyTypes, delta: CollapsedDelta) {
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

  update(currentState: { values: { value: string, timestamp: number }[] }, newValue: PropertyTypes, delta: CollapsedDelta) {
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

  resolve(state: { values: { value: string, timestamp: number }[] }): PropertyTypes {
    return state.values.map(v => v.value).join(this.separator);
  }
}

// Majority vote plugin
export class MajorityVotePlugin implements ResolverPlugin<{ votes: Map<PropertyTypes, number> }> {
  name = 'majority-vote';

  initialize() {
    return { votes: new Map() };
  }

  update(currentState: { votes: Map<PropertyTypes, number> }, newValue: PropertyTypes, _delta: CollapsedDelta) {
    const currentCount = currentState.votes.get(newValue) || 0;
    currentState.votes.set(newValue, currentCount + 1);
    return currentState;
  }

  resolve(state: { votes: Map<PropertyTypes, number> }): PropertyTypes {
    let maxVotes = 0;
    let winner: PropertyTypes = '';

    for (const [value, votes] of state.votes.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winner = value;
      }
    }

    return winner;
  }
}

// Numeric min/max plugins
export class MinPlugin implements ResolverPlugin<{ min?: number }> {
  name = 'min';

  initialize() {
    return {};
  }

  update(currentState: { min?: number }, newValue: PropertyTypes, _delta: CollapsedDelta) {
    if (typeof newValue === 'number') {
      if (currentState.min === undefined || newValue < currentState.min) {
        return { min: newValue };
      }
    }
    return currentState;
  }

  resolve(state: { min?: number }): PropertyTypes {
    return state.min || 0;
  }
}

export class MaxPlugin implements ResolverPlugin<{ max?: number }> {
  name = 'max';

  initialize() {
    return {};
  }

  update(currentState: { max?: number }, newValue: PropertyTypes, _delta: CollapsedDelta) {
    if (typeof newValue === 'number') {
      if (currentState.max === undefined || newValue > currentState.max) {
        return { max: newValue };
      }
    }
    return currentState;
  }

  resolve(state: { max?: number }): PropertyTypes {
    return state.max || 0;
  }
}