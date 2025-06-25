import { Lossless, LosslessViewOne } from "../lossless";
import { Lossy } from '../lossy';
import { DomainEntityID, PropertyID, ViewMany } from "../../core/types";
import { CollapsedDelta } from "../lossless";

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

// Extract a particular value from a delta's pointers
export function valueFromCollapsedDelta(
  key: string,
  delta: CollapsedDelta
): string | number | undefined {
  for (const pointer of delta.pointers) {
    for (const [k, value] of Object.entries(pointer)) {
      if (k === key && (typeof value === "string" || typeof value === "number")) {
        return value;
      }
    }
  }
}

export class AggregationResolver extends Lossy<Accumulator> {
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