import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../hyperview";
import { ResolverPlugin } from "../plugin";

type FirstWriteWinsState = {
  value?: PropertyTypes;
  timestamp: number;
};

/**
 * First Write Wins plugin
 * 
 * Keeps the first value that was written, ignoring subsequent writes
 */
export class FirstWriteWinsPlugin extends ResolverPlugin<FirstWriteWinsState> {
  readonly dependencies = [] as const;

  initialize(): FirstWriteWinsState {
    return { timestamp: Infinity };
  }

  update(
    currentState: FirstWriteWinsState,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
  ): FirstWriteWinsState {
    // Only update if this delta is earlier than our current earliest
    if (delta.timeCreated < currentState.timestamp) {
      return {
        value: newValue,
        timestamp: delta.timeCreated
      };
    }
    return currentState;
  }

  resolve(
    state: FirstWriteWinsState,
  ): PropertyTypes | undefined {
    return state.value;
  }
}
