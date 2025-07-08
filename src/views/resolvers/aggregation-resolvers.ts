import { Lossless, LosslessViewOne } from "../lossless";
import { Lossy } from '../lossy';
import { DomainEntityID, PropertyID, ViewMany } from "../../core/types";
import { valueFromDelta } from "../lossless";
import { EntityRecord, EntityRecordMany } from "@src/core/entity";
import Debug from 'debug';
const debug = Debug('rz:test:performance');

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

type Accumulator = AggregatedViewMany;
type Result = EntityRecordMany;

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
      // For count, we want to count all values, including duplicates
      // So we use the length of the values array directly
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
      for (const delta of deltas) {
        const value = valueFromDelta(propertyId, delta);

        if (typeof value === 'number') {
          acc[cur.id].properties[propertyId].values.push(value);
        }
      }
    }

    return acc;
  }

  resolver(cur: Accumulator): Result {
    const res: Result = {};

    for (const [id, entity] of Object.entries(cur)) {
      const entityResult: EntityRecord = { id, properties: {} };

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