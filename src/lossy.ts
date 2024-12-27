// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.
//
// We can achieve this via functional expression, encoded as JSON-Logic.
// Fields in the output can be described as transformations

import Debug from 'debug';
import {CollapsedDelta, Lossless, LosslessViewMany, LosslessViewOne} from "./lossless";
import {DomainEntityID, Properties} from "./types";
import {DeltaFilter} from "./delta";
const debug = Debug('lossy');

export type LossyViewOne<T = Properties> = {
  id: DomainEntityID;
  properties: T;
};

export type LossyViewMany = {
  [key: DomainEntityID]: LossyViewOne;
};

type Resolver<T = LosslessViewMany> = (losslessView: LosslessViewMany) => T;

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
  debug(`trying to get value for ${key} from ${JSON.stringify(ent.properties[key])}`);
  for (const delta of ent.properties[key] || []) {
    const value = valueFromCollapsedDelta(delta, key);
    if (value) return {delta, value};
  }
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

