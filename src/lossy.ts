// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.
//
// We can achieve this via functional expression, encoded as JSON-Logic.
// Fields in the output can be described as transformations

import Debug from 'debug';
import {DeltaFilter, DeltaID} from "./delta.js";
import {CollapsedDelta, Lossless, LosslessViewOne} from "./lossless.js";
import {DomainEntityID} from "./types.js";
const debug = Debug('rz:lossy');

export type Initializer<Accumulator> = (v: LosslessViewOne) => Accumulator;
export type Reducer<Accumulator> = (acc: Accumulator, cur: LosslessViewOne) => Accumulator;
export type Resolver<Accumulator, Result> = (cur: Accumulator) => Result;

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

// TODO: Incremental updates of lossy models. For example, with last-write-wins,
// we keep the timeUpdated for each field. A second stage resolver can rearrange
// the data structure to a preferred shape and may discard the timeUpdated info.
export class Lossy<Accumulator, Result> {
  deltaFilter?: DeltaFilter;
  accumulator?: Accumulator;

  constructor(
    readonly lossless: Lossless,
    readonly initializer: Initializer<Accumulator>,
    readonly reducer: Reducer<Accumulator>,
    readonly resolver: Resolver<Accumulator, Result>,
  ) {
    this.lossless.eventStream.on("updated", (id, deltaIds) => {
      debug(`[${this.lossless.rhizomeNode.config.peerId}] entity ${id} updated, deltaIds:`,
        JSON.stringify(deltaIds));
      this.ingestUpdate(id, deltaIds);
    });
  }

  ingestUpdate(id: DomainEntityID, deltaIds: DeltaID[]) {
    debug(`[${this.lossless.rhizomeNode.config.peerId}] prior to ingesting update, deltaIds:`, deltaIds);
    const losslessPartial = this.lossless.viewSpecific(id, deltaIds, this.deltaFilter);

    debug(`[${this.lossless.rhizomeNode.config.peerId}] prior to ingesting update, lossless partial:`,
      JSON.stringify(losslessPartial, null, 2));

    if (!losslessPartial) return;

    const latest = this.accumulator || this.initializer(losslessPartial);
    this.accumulator = this.reducer(latest, losslessPartial);

    debug(`[${this.lossless.rhizomeNode.config.peerId}] after ingesting update, entity ${id} accumulator:`,
      JSON.stringify(this.accumulator, null, 2));
  }

  // Using the lossless view of some given domain entities,
  // apply a filter to the deltas composing that lossless view,
  // and then apply a supplied resolver function which receives
  // the filtered lossless view as input.
  // resolve<T = ResolvedViewOne>(fn?: Resolver<T> | Resolver, entityIds?: DomainEntityID[], deltaFilter?: DeltaFilter): T {
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    if (!this.accumulator) return undefined;

    return this.resolver(this.accumulator);
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

