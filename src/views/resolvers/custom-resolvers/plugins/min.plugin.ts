import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

type MinPluginState = {
  min?: number;
};

/**
 * Numeric min plugin
 * 
 * Tracks the minimum numeric value
 */
export class MinPlugin implements ResolverPlugin<MinPluginState> {
  readonly name = 'min';
  readonly dependencies = [] as const;

  initialize(): MinPluginState {
    return { min: undefined };
  }

  update(
    currentState: MinPluginState, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _dependencies: Record<string, never> = {}
  ): MinPluginState {
    const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    
    if (!isNaN(numValue) && (currentState.min === undefined || numValue < currentState.min)) {
      return { min: numValue };
    }
    return currentState;
  }

  resolve(
    state: MinPluginState,
    _dependencies: Record<string, never> = {}
  ): PropertyTypes | undefined {
    return state.min;
  }
}
