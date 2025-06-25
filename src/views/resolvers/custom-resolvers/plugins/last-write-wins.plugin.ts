import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

type LastWriteWinsState = {
  value?: PropertyTypes;
  timestamp: number;
};

/**
 * Last Write Wins plugin
 * 
 * Keeps the most recent value based on the delta's timestamp
 */
export class LastWriteWinsPlugin implements ResolverPlugin<LastWriteWinsState, never> {
  readonly dependencies = [] as const;

  initialize(): LastWriteWinsState {
    return { timestamp: 0 };
  }

  update(
    currentState: LastWriteWinsState,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
  ): LastWriteWinsState {
    if (delta.timeCreated > currentState.timestamp) {
      return {
        value: newValue,
        timestamp: delta.timeCreated
      };
    }
    return currentState;
  }

  resolve(
    state: LastWriteWinsState,
  ): PropertyTypes {
    return state.value || '';
  }
}
