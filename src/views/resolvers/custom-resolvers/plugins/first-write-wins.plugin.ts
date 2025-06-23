import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * First Write Wins plugin
 * 
 * Keeps the first value that was written, ignoring subsequent writes
 */
export class FirstWriteWinsPlugin implements ResolverPlugin<{ value?: PropertyTypes, timestamp: number }> {
  name = 'first-write-wins';
  dependencies: string[] = [];

  initialize() {
    return { timestamp: Infinity };
  }

  update(
    currentState: { value?: PropertyTypes, timestamp: number }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
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
    state: { value?: PropertyTypes, timestamp: number },
    _allStates?: Record<string, unknown>
  ): PropertyTypes | undefined {
    return state.value;
  }
}
