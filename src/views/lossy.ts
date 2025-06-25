// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.

import Debug from 'debug';
import {Delta, DeltaFilter, DeltaID} from "../core/delta";
import {Lossless, LosslessViewOne} from "./lossless";
import {DomainEntityID, PropertyID, PropertyTypes, ViewMany} from "../core/types";
const debug = Debug('rz:lossy');

type PropertyMap = Record<PropertyID, PropertyTypes>;

export type LossyViewOne<T = PropertyMap> = {
  id: DomainEntityID;
  properties: T;
};

export type LossyViewMany<T = PropertyMap> = ViewMany<LossyViewOne<T>>;

// We support incremental updates of lossy models.
export abstract class Lossy<Accumulator, Result = Accumulator> {
  deltaFilter?: DeltaFilter;
  private accumulator?: Accumulator;

  initializer?(): Accumulator;
  abstract reducer(acc: Accumulator, cur: LosslessViewOne): Accumulator;
  resolver?(acc: Accumulator, entityIds: DomainEntityID[]): Result;

  constructor(
    readonly lossless: Lossless,
  ) {
    this.lossless.eventStream.on("updated", (id, deltaIds) => {
      debug(`[${this.lossless.rhizomeNode.config.peerId}] entity ${id} updated, deltaIds:`,
        JSON.stringify(deltaIds));

      this.ingestUpdate(id, deltaIds);
    });
    debug(`Lossy view initialized: ${this.constructor.name}`);
  }

  ingestUpdate(entityId: DomainEntityID, deltaIds: DeltaID[]) {
    const combinedFilter = (delta: Delta) => {
      if (!deltaIds.includes(delta.id)) {
        return false;
      }
      if (!this.deltaFilter) return true;
      return this.deltaFilter(delta);
    };
    const losslessPartial = this.lossless.compose([entityId], combinedFilter);
    debug(`Lossless partial for entity ${entityId}:`, JSON.stringify(losslessPartial));

    if (!losslessPartial) {
      // This should not happen; this should only be called after the lossless view has been updated
      console.error(`Lossless view for entity ${entityId} not found`);
      return;
    }

    const latest = this.accumulator || this.initializer?.() || {} as Accumulator;
    this.accumulator = this.reducer(latest, losslessPartial[entityId]);
  }

  // Resolve the current state of the view
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!this.accumulator) {
      return undefined;
    }

    if (!entityIds) {
      entityIds = Array.from(this.lossless.domainEntities.keys());
    }

    if (!this.resolver) {
      throw new Error(`Resolver not implemented for ${this.constructor.name}`)
    }

    return this.resolver(this.accumulator, entityIds);
  }
}

