import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * Numeric min plugin
 * 
 * Tracks the minimum numeric value
 */
export class MinPlugin implements ResolverPlugin<{ min?: number }> {
  name = 'min';
  dependencies: string[] = [];

  initialize() {
    return { min: undefined };
  }

  update(
    currentState: { min?: number }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
    const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    
    if (!isNaN(numValue) && (currentState.min === undefined || numValue < currentState.min)) {
      return { min: numValue };
    }
    return currentState;
  }

  resolve(
    state: { min?: number },
    _allStates?: Record<string, unknown>
  ): PropertyTypes | undefined {
    return state.min;
  }
}
