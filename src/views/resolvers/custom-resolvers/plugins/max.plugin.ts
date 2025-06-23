import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

type MaxPluginState = {
  max?: number;
};

/**
 * Numeric max plugin
 * 
 * Tracks the maximum numeric value
 */
export class MaxPlugin implements ResolverPlugin<MaxPluginState> {
  readonly name = 'max';
  readonly dependencies = [] as const;

  initialize(): MaxPluginState {
    return { max: undefined };
  }

  update(
    currentState: MaxPluginState, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _dependencies: Record<string, never> = {}
  ): MaxPluginState {
    const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    
    if (!isNaN(numValue) && (currentState.max === undefined || numValue > currentState.max)) {
      return { max: numValue };
    }
    return currentState;
  }

  resolve(
    state: MaxPluginState,
    _dependencies: Record<string, never> = {}
  ): PropertyTypes | undefined {
    return state.max;
  }
}
