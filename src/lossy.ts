// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.
//
// We can achieve this via functional expression, encoded as JSON-Logic.
// Fields in the output can be described as transformations

// import Debug from 'debug';
import {DeltaFilter} from "./delta.js";
import {CollapsedDelta, Lossless, LosslessViewMany, LosslessViewOne} from "./lossless.js";
import {DomainEntityID, PropertyID, PropertyTypes, Timestamp, ViewMany} from "./types.js";
// const debug = Debug('rz:lossy');

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

// TODO: Incremental updates of lossy models. For example, with last-write-wins,
// we keep the timeUpdated for each field. A second stage resolver can rearrange
// the data structure to a preferred shape and may discard the timeUpdated info.
export class Lossy {
  lossless: Lossless;

  constructor(lossless: Lossless) {
    this.lossless = lossless;
  }

  // Using the lossless view of some given domain entities,
  // apply a filter to the deltas composing that lossless view,
  // and then apply a supplied resolver function which receives
  // the filtered lossless view as input.
  // TODO: Cache things!
  resolve<T = ResolvedViewOne>(fn?: Resolver<T> | Resolver, entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): T {
    if (!fn) {
      fn = (v) => this.defaultResolver(v);
    }
    const losslessView = this.lossless.view(entityIds, deltaFilter);
    return fn(losslessView) as T;
  }

  defaultResolver(losslessView: LosslessViewMany): ResolvedViewMany {
    const resolved: ResolvedViewMany = {};

    // debug(`[${this.lossless.rhizomeNode.config.peerId}]`, 'Default resolver, lossless view', JSON.stringify(losslessView));
    for (const [id, ent] of Object.entries(losslessView)) {
      resolved[id] = {id, properties: {}};

      for (const key of Object.keys(ent.properties)) {
        const {value} = lastValueFromLosslessViewOne(ent, key) || {};

        // debug(`[${this.lossless.rhizomeNode.config.peerId}]`, `[ ${key} ] = ${value}`);
        resolved[id].properties[key] = value;
      }
    }
    return resolved;
  };

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

