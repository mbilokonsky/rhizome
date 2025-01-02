// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.

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

// We support incremental updates of lossy models.
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
    const losslessPartial = this.lossless.viewSpecific(id, deltaIds, this.deltaFilter);

    if (!losslessPartial) return;

    const latest = this.accumulator || this.initializer(losslessPartial);
    this.accumulator = this.reducer(latest, losslessPartial);
  }

  // Using the lossless view of some given domain entities,
  // apply a filter to the deltas composing that lossless view,
  // and then apply a supplied resolver function which receives
  // the filtered lossless view as input.
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    if (!this.accumulator) return undefined;

    return this.resolver(this.accumulator);
  }
}

