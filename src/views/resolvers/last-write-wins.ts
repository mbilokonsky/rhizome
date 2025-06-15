// import Debug from 'debug';
import {EntityProperties} from "../../core/entity";
import {CollapsedDelta, LosslessViewOne} from "../lossless";
import {Lossy} from '../lossy';
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

export class LastWriteWins extends Lossy<Accumulator, Result> {
  initializer(view: LosslessViewOne): Accumulator {
    return {
      [view.id]: { id: view.id, properties: {} }
    };
  }

  reducer(acc: Accumulator, cur: LosslessViewOne): Accumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }

    for (const [key, deltas] of Object.entries(cur.propertyDeltas)) {
      const { value, timeUpdated } = lastValueFromDeltas(key, deltas) || {};
      if (!value || timeUpdated === undefined) continue;

      const currentTime = acc[cur.id].properties[key]?.timeUpdated || 0;
      if (timeUpdated > currentTime) {
        acc[cur.id].properties[key] = { value, timeUpdated };
      }
    }
    
    return acc;
  }

  resolver(cur: Accumulator): Result {
    const result: Result = {};

    for (const [id, entity] of Object.entries(cur)) {
      result[id] = { 
        id, 
        properties: Object.fromEntries(
          Object.entries(entity.properties)
            .map(([key, { value }]) => [key, value])
        )
      };
    }

    return result;
  }
}

