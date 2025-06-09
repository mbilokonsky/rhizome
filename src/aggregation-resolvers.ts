import { EntityProperties } from "./entity";
import { Lossless, LosslessViewOne } from "./lossless";
import { Lossy } from './lossy';
import { DomainEntityID, PropertyID, ViewMany } from "./types";
import { valueFromCollapsedDelta } from "./last-write-wins";

export type AggregationType = 'min' | 'max' | 'sum' | 'average' | 'count';

export type AggregationConfig = {
  [propertyId: PropertyID]: AggregationType;
};

type AggregatedProperty = {
  values: number[];
  type: AggregationType;
  result?: number;
};

type AggregatedProperties = {
  [key: PropertyID]: AggregatedProperty;
};

export type AggregatedViewOne = {
  id: DomainEntityID;
  properties: AggregatedProperties;
};

export type AggregatedViewMany = ViewMany<AggregatedViewOne>;

type ResolvedAggregatedViewOne = {
  id: DomainEntityID;
  properties: EntityProperties;
};

type ResolvedAggregatedViewMany = ViewMany<ResolvedAggregatedViewOne>;

type Accumulator = AggregatedViewMany;
type Result = ResolvedAggregatedViewMany;

function aggregateValues(values: number[], type: AggregationType): number {
  if (values.length === 0) return 0;

  switch (type) {
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'sum':
      return values.reduce((sum, val) => sum + val, 0);
    case 'average':
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    case 'count':
      return values.length;
    default:
      throw new Error(`Unknown aggregation type: ${type}`);
  }
}

export class AggregationResolver extends Lossy<Accumulator, Result> {
  constructor(
    lossless: Lossless,
    private config: AggregationConfig
  ) {
    super(lossless);
  }

  initializer(): Accumulator {
    return {};
  }

  reducer(acc: Accumulator, cur: LosslessViewOne): Accumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }

    for (const [propertyId, deltas] of Object.entries(cur.propertyDeltas)) {
      const aggregationType = this.config[propertyId];
      if (!aggregationType) continue;

      if (!acc[cur.id].properties[propertyId]) {
        acc[cur.id].properties[propertyId] = {
          values: [],
          type: aggregationType
        };
      }

      // Extract numeric values from all deltas for this property
      const newValues: number[] = [];
      for (const delta of deltas || []) {
        const value = valueFromCollapsedDelta(propertyId, delta);
        if (typeof value === 'number') {
          newValues.push(value);
        }
      }

      // Update the values array (avoiding duplicates by clearing and rebuilding)
      acc[cur.id].properties[propertyId].values = newValues;
    }

    return acc;
  }

  resolver(cur: Accumulator): Result {
    const res: Result = {};

    for (const [id, entity] of Object.entries(cur)) {
      const entityResult: ResolvedAggregatedViewOne = { id, properties: {} };

      for (const [propertyId, aggregatedProp] of Object.entries(entity.properties)) {
        const result = aggregateValues(aggregatedProp.values, aggregatedProp.type);
        entityResult.properties[propertyId] = result;
      }

      // Only include entities that have at least one aggregated property
      if (Object.keys(entityResult.properties).length > 0) {
        res[id] = entityResult;
      }
    }

    return res;
  }

  // Override resolve to build accumulator on-demand if needed
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    // If we don't have an accumulator, build it from the lossless view
    if (!this.accumulator) {
      this.accumulator = this.initializer();

      // Use the general view method instead of viewSpecific
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

// Convenience classes for common aggregation types
export class MinResolver extends AggregationResolver {
  constructor(lossless: Lossless, properties: PropertyID[]) {
    const config: AggregationConfig = {};
    properties.forEach(prop => config[prop] = 'min');
    super(lossless, config);
  }
}

export class MaxResolver extends AggregationResolver {
  constructor(lossless: Lossless, properties: PropertyID[]) {
    const config: AggregationConfig = {};
    properties.forEach(prop => config[prop] = 'max');
    super(lossless, config);
  }
}

export class SumResolver extends AggregationResolver {
  constructor(lossless: Lossless, properties: PropertyID[]) {
    const config: AggregationConfig = {};
    properties.forEach(prop => config[prop] = 'sum');
    super(lossless, config);
  }
}

export class AverageResolver extends AggregationResolver {
  constructor(lossless: Lossless, properties: PropertyID[]) {
    const config: AggregationConfig = {};
    properties.forEach(prop => config[prop] = 'average');
    super(lossless, config);
  }
}

export class CountResolver extends AggregationResolver {
  constructor(lossless: Lossless, properties: PropertyID[]) {
    const config: AggregationConfig = {};
    properties.forEach(prop => config[prop] = 'count');
    super(lossless, config);
  }
}