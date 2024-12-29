// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.
//
// We can achieve this via functional expression, encoded as JSON-Logic.
// Fields in the output can be described as transformations

import Debug from 'debug';
import {DeltaFilter} from "./delta";
import {CollapsedDelta, Lossless, LosslessViewMany, LosslessViewOne} from "./lossless";
import {DomainEntityID, PropertyID, PropertyTypes, Timestamp, ViewMany} from "./types";
const debug = Debug('lossy');

type TimestampedProperty = {
  value: PropertyTypes,
  timeUpdated: Timestamp
};

export type LossyViewOne<T = TimestampedProperty> = {
  id: DomainEntityID;
  properties: {
    [key: PropertyID]: T
  };
};

export type LossyViewMany<T> = ViewMany<LossyViewOne<T>>;

export type ResolvedViewOne = LossyViewOne<PropertyTypes>;
export type ResolvedViewMany = ViewMany<ResolvedViewOne>;

export type Resolver<T = ResolvedViewMany> =
  (losslessView: LosslessViewMany) => T;

// Extract a particular value from a delta's pointers
export function valueFromCollapsedDelta(
  delta: CollapsedDelta,
  key: string
): string | number | undefined {
  for (const pointer of delta.pointers) {
    for (const [k, value] of Object.entries(pointer)) {
      if (k === key && (typeof value === "string" || typeof value === "number")) {
        return value;
      }
    }
  }
}

// Example function for resolving a value for an entity by taking the first value we find
export function firstValueFromLosslessViewOne(
  ent: LosslessViewOne,
  key: string
): {
  delta: CollapsedDelta,
  value: string | number
} | undefined {
  debug(`trying to get first value for ${key} from ${JSON.stringify(ent.properties[key])}`);
  for (const delta of ent.properties[key] || []) {
    const value = valueFromCollapsedDelta(delta, key);
    if (value) return {delta, value};
  }
}

// Function for resolving a value for an entity by last write wins
export function lastValueFromLosslessViewOne(
  ent: LosslessViewOne,
  key: string
): {
  delta?: CollapsedDelta,
  value?: string | number,
  timeUpdated?: number
} | undefined {
  const res: {
    delta?: CollapsedDelta,
    value?: string | number,
    timeUpdated?: number
  } = {};
  debug(`trying to get last value for ${key} from ${JSON.stringify(ent.properties[key])}`);
  res.timeUpdated = 0;

  for (const delta of ent.properties[key] || []) {
    const value = valueFromCollapsedDelta(delta, key);
    if (value === undefined) continue;
    if (delta.timeCreated < res.timeUpdated) continue;
    res.delta = delta;
    res.value = value;
    res.timeUpdated = delta.timeCreated;
  }

  return res;
}

export class Lossy {
  lossless: Lossless;

  constructor(lossless: Lossless) {
    this.lossless = lossless;
  }

  // Using the lossless view of some given domain entities,
  // apply a filter to the deltas composing that lossless view,
  // and then apply a supplied resolver function which receives
  // the filtered lossless view as input.
  resolve<T>(fn: Resolver<T>, entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter) {
    const losslessView = this.lossless.view(entityIds, deltaFilter);
    return fn(losslessView);
  }
}

// Generate a rule
// Apply the rule -- When?
//  - Maybe we shard a set of deltas and map/reduce the results --
//    We are trying to implement CRDT, so the results 
//    must be composable to preserve that feature.
//    That also seems to imply we want to stick with
//    the lossless view until the delta set is chosen
//  - So, in general on a set of deltas
//    at times which seem opportune
//    the results of which can be recorded
//    and indexed such that the results can be reused
//    i.e. you want to compute the result of a set which
//    contains a prior one

