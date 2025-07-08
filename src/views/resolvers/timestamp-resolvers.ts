import { EntityProperties } from "../../core/entity";
import { Lossless, CollapsedDelta, valueFromDelta, LosslessViewOne } from "../lossless";
import { Lossy } from '../lossy';
import { DomainEntityID, PropertyID, PropertyTypes, Timestamp, ViewMany } from "../../core/types";
import Debug from 'debug';

const debug = Debug('rz:views:resolvers:timestamp-resolvers');

export type TimestampedProperty = {
  value: PropertyTypes,
  timeUpdated: Timestamp
};

export type TimestampedProperties = {
  [key: PropertyID]: TimestampedProperty
};

export type TieBreakingStrategy = 'creator-id' | 'delta-id' | 'host-id' | 'lexicographic';

type TimestampedPropertyWithTieBreaking = {
  value: PropertyTypes,
  timeUpdated: Timestamp,
  creator: string,
  deltaId: string,
  host: string
};

type TimestampedPropertiesWithTieBreaking = {
  [key: PropertyID]: TimestampedPropertyWithTieBreaking
};

export type TimestampedViewOne = {
  id: DomainEntityID;
  properties: TimestampedPropertiesWithTieBreaking;
};

export type TimestampedViewMany = ViewMany<TimestampedViewOne>;

export type ResolvedTimestampedViewOne = {
  id: DomainEntityID;
  properties: EntityProperties;
};

export type ResolvedTimestampedViewMany = ViewMany<ResolvedTimestampedViewOne>;

type Accumulator = TimestampedViewMany;
type Result = ResolvedTimestampedViewMany;

function compareWithTieBreaking(
  a: TimestampedPropertyWithTieBreaking,
  b: TimestampedPropertyWithTieBreaking,
  strategy: TieBreakingStrategy
): number {
  // First compare by timestamp (most recent wins)
  if (a.timeUpdated !== b.timeUpdated) {
    return a.timeUpdated - b.timeUpdated;
  }

  // If timestamps are equal, use tie-breaking strategy
  switch (strategy) {
    case 'creator-id':
      return a.creator.localeCompare(b.creator);
    case 'delta-id':
      return a.deltaId.localeCompare(b.deltaId);
    case 'host-id':
      return a.host.localeCompare(b.host);
    case 'lexicographic':
      // Compare by value if it's a string, otherwise by delta ID
      if (typeof a.value === 'string' && typeof b.value === 'string') {
        return a.value.localeCompare(b.value);
      }
      return a.deltaId.localeCompare(b.deltaId);
    default:
      throw new Error(`Unknown tie-breaking strategy: ${strategy}`);
  }
}

export class TimestampResolver extends Lossy<Accumulator, Result> {
  constructor(
    lossless: Lossless,
    private tieBreakingStrategy: TieBreakingStrategy = 'delta-id'
  ) {
    super(lossless);
  }

  reducer(acc: Accumulator, cur: LosslessViewOne): Accumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }

    for (const [key, deltas] of Object.entries(cur.propertyDeltas)) {
      let bestProperty: TimestampedPropertyWithTieBreaking | undefined;

      for (const delta of deltas) {
        const value = valueFromDelta(key, delta);
        debug(`delta: ${JSON.stringify(delta)}`);
        debug(`valueFromDelta(${key}) = ${value}`);
        if (value === undefined) continue;

        const property: TimestampedPropertyWithTieBreaking = {
          value,
          timeUpdated: delta.timeCreated,
          creator: delta.creator,
          deltaId: delta.id,
          host: delta.host
        };

        if (!bestProperty || compareWithTieBreaking(property, bestProperty, this.tieBreakingStrategy) > 0) {
          bestProperty = property;
        }
      }

      if (bestProperty) {
        const existing = acc[cur.id].properties[key];
        if (!existing || compareWithTieBreaking(bestProperty, existing, this.tieBreakingStrategy) > 0) {
          acc[cur.id].properties[key] = bestProperty;
        }
      }
    }
    return acc;
  }

  resolver(cur: Accumulator): Result {
    const res: Result = {};

    for (const [id, ent] of Object.entries(cur)) {
      res[id] = { id, properties: {} };
      for (const [key, timestampedProp] of Object.entries(ent.properties)) {
        res[id].properties[key] = timestampedProp.value;
      }
    }

    return res;
  }


}

// Convenience classes for different tie-breaking strategies
export class CreatorIdTimestampResolver extends TimestampResolver {
  constructor(lossless: Lossless) {
    super(lossless, 'creator-id');
  }
}

export class DeltaIdTimestampResolver extends TimestampResolver {
  constructor(lossless: Lossless) {
    super(lossless, 'delta-id');
  }
}

export class HostIdTimestampResolver extends TimestampResolver {
  constructor(lossless: Lossless) {
    super(lossless, 'host-id');
  }
}

export class LexicographicTimestampResolver extends TimestampResolver {
  constructor(lossless: Lossless) {
    super(lossless, 'lexicographic');
  }
}

// Resolve a value for an entity by last write wins
export function latestFromCollapsedDeltas(
  key: string,
  deltas?: CollapsedDelta[]
): {
  delta?: CollapsedDelta,
  value?: PropertyTypes,
  timeUpdated?: number
} | undefined {
  const res: {
    delta?: CollapsedDelta,
    value?: PropertyTypes,
    timeUpdated?: number
  } = {};
  res.timeUpdated = 0;

  for (const delta of deltas || []) {
    const value = valueFromDelta(key, delta);
    if (value === undefined) continue;
    if (res.timeUpdated && delta.timeCreated < res.timeUpdated) continue;
    res.delta = delta;
    res.value = value;
    res.timeUpdated = delta.timeCreated;
  }

  return res;
}