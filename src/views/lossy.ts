// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.

import Debug from 'debug';
import {DeltaFilter, DeltaID} from "../core/delta";
import {Lossless, LosslessViewOne} from "./lossless";
import {DomainEntityID} from "../core/types";
const debug = Debug('rz:lossy');

// We support incremental updates of lossy models.
export abstract class Lossy<Accumulator, Result> {
  deltaFilter?: DeltaFilter;
  accumulator?: Accumulator;

  abstract initializer(v: LosslessViewOne): Accumulator;
  abstract reducer(acc: Accumulator, cur: LosslessViewOne): Accumulator;
  abstract resolver(cur: Accumulator): Result;

  constructor(
    readonly lossless: Lossless,
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
  // Resolve the current state of the view
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    // If we don't have an accumulator, build it from the lossless view
    if (!this.accumulator) {
      this.accumulator = {} as Accumulator;
      
      // Use the general view method to get the full view
      const fullView = this.lossless.view(entityIds, this.deltaFilter);
      
      // Build the accumulator by reducing each entity's view
      for (const entityId of entityIds) {
        const losslessViewOne = fullView[entityId];
        if (losslessViewOne) {
          if (!this.accumulator) {
            this.accumulator = this.initializer(losslessViewOne);
          } else {
            this.accumulator = this.reducer(this.accumulator, losslessViewOne);
          }
        }
      }
    }

    if (!this.accumulator) return undefined;

    return this.resolver(this.accumulator);
  }
}

