// We have the hyperview transformation of the delta stream.
// We want to enable transformations from the hyperview, 
// into various possible "view" views that combine or exclude some information.

import Debug from 'debug';
import {Delta, DeltaFilter, DeltaID} from "../core/delta";
import {Hyperview, HyperviewViewOne} from "./hyperview";
import {DomainEntityID, PropertyID, PropertyTypes, ViewMany} from "../core/types";
const debug = Debug('rz:view');

type PropertyMap = Record<PropertyID, PropertyTypes>;

export type LossyViewOne<T = PropertyMap> = {
  id: DomainEntityID;
  properties: T;
};

export type LossyViewMany<T = PropertyMap> = ViewMany<LossyViewOne<T>>;

// We support incremental updates of view models.
export abstract class Lossy<Accumulator, Result = Accumulator> {
  deltaFilter?: DeltaFilter;
  private accumulator?: Accumulator;

  initializer?(): Accumulator;
  abstract reducer(acc: Accumulator, cur: HyperviewViewOne): Accumulator;
  resolver?(acc: Accumulator, entityIds: DomainEntityID[]): Result;

  constructor(
    readonly hyperview: Hyperview,
  ) {
    this.hyperview.eventStream.on("updated", (id, deltaIds) => {
      debug(`[${this.hyperview.rhizomeNode.config.peerId}] entity ${id} updated, deltaIds:`,
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
    const hyperviewPartial = this.hyperview.compose([entityId], combinedFilter);

    if (!hyperviewPartial) {
      // This should not happen; this should only be called after the hyperview has been updated
      console.error(`Hyperview view for entity ${entityId} not found`);
      return;
    }

    const latest = this.accumulator || this.initializer?.() || {} as Accumulator;
    this.accumulator = this.reducer(latest, hyperviewPartial[entityId]);
  }

  // Resolve the current state of the view
  resolve(entityIds?: DomainEntityID[]): Result | undefined {
    if (!this.accumulator) {
      this.accumulator =this.initializer?.() || {} as Accumulator;
    }

    if (!entityIds) {
      entityIds = Array.from(this.hyperview.domainEntities.keys());
    }

    if (!this.resolver) {
      throw new Error(`Resolver not implemented for ${this.constructor.name}`)
    }

    return this.resolver(this.accumulator, entityIds);
  }
}

// "Lossy" can simply be called "View"
export abstract class View<Accumulator, Result> extends Lossy<Accumulator, Result> {};
