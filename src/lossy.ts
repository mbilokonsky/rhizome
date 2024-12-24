// We have the lossless transformation of the delta stream.
// We want to enable transformations from the lossless view, 
// into various possible "lossy" views that combine or exclude some information.
//
// We can achieve this via functional expression, encoded as JSON-Logic.
// Fields in the output can be described as transformations

import {CollapsedDelta, Lossless, LosslessViewMany, LosslessViewOne} from "./lossless";
import {DeltaFilter} from "./types";

type Resolver = (losslessView: LosslessViewMany) => unknown;

export function firstValueFromCollapsedDelta(delta: CollapsedDelta, key: string): string | undefined {
  const pointers = delta.pointers;
  for (const pointer of pointers || []) {
    const [[k, value]] = Object.entries(pointer);
    if (k === key && typeof value === "string") {
      return value;
    }
  }
}

export function firstValueFromLosslessViewOne(ent: LosslessViewOne, key: string): {delta: CollapsedDelta, value: string} | undefined {
  for (const delta of ent.properties[key] || []) {
    const value = firstValueFromCollapsedDelta(delta, key);
    if (value) return {delta, value};
  }
}

export class Lossy {
  lossless: Lossless;

  constructor(lossless: Lossless) {
    this.lossless = lossless;
  }

  resolve(fn: Resolver, deltaFilter?: DeltaFilter) {
    return fn(this.lossless.view(deltaFilter));
  }
}

