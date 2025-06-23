import { PropertyID, PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * Last Write Wins plugin
 * 
 * Keeps the most recent value based on the delta's timestamp
 */
export class LastWriteWinsPlugin implements ResolverPlugin<{ value?: PropertyTypes, timestamp: number }> {
  name = 'last-write-wins';
  dependencies: PropertyID[] = [];

  initialize() {
    return { timestamp: 0 };
  }

  update(
    currentState: { value?: PropertyTypes, timestamp: number }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
    if (delta.timeCreated > currentState.timestamp) {
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
  ): PropertyTypes {
    return state.value || '';
  }
}
