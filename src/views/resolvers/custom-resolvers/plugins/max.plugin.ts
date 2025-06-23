import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * Numeric max plugin
 * 
 * Tracks the maximum numeric value
 */
export class MaxPlugin implements ResolverPlugin<{ max?: number }> {
  name = 'max';
  dependencies: string[] = [];

  initialize() {
    return { max: undefined };
  }

  update(
    currentState: { max?: number }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
    const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    
    if (!isNaN(numValue) && (currentState.max === undefined || numValue > currentState.max)) {
      return { max: numValue };
    }
    return currentState;
  }

  resolve(
    state: { max?: number },
    _allStates?: Record<string, unknown>
  ): PropertyTypes | undefined {
    return state.max;
  }
}
