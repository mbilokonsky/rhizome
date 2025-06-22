// import Debug from 'debug';
import {EntityProperties} from "../../core/entity";
import {CollapsedDelta} from "../lossless";
import {DomainEntityID, PropertyID, PropertyTypes, Timestamp, ViewMany} from "../../core/types";
// const debug = Debug('rz:lossy:last-write-wins');

type TimestampedProperty = {
  value: PropertyTypes,
  timeUpdated: Timestamp
};

type TimestampedProperties = {
  [key: PropertyID]: TimestampedProperty
};

export type LossyViewOne<T = TimestampedProperties> = {
  id: DomainEntityID;
  properties: T;
};

export type LossyViewMany<T = TimestampedProperties> = ViewMany<LossyViewOne<T>>;

export type ResolvedViewOne = LossyViewOne<EntityProperties>;
export type ResolvedViewMany = ViewMany<ResolvedViewOne>;

type Accumulator = LossyViewMany<TimestampedProperties>;
type Result = LossyViewMany<EntityProperties>;

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

// Resolve a value for an entity by last write wins
export function lastValueFromDeltas(
  key: string,
  deltas?: CollapsedDelta[]
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

  for (const delta of deltas || []) {
    const value = valueFromCollapsedDelta(key, delta);
    if (value === undefined) continue;
    if (res.timeUpdated && delta.timeCreated < res.timeUpdated) continue;
    res.delta = delta;
    res.value = value;
    res.timeUpdated = delta.timeCreated;
  }

  return res;
}
