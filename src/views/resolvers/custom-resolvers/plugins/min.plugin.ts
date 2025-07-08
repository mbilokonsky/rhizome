import { PropertyTypes } from "../../../../core/types";
import { DependencyStates, ResolverPlugin } from "../plugin";

type MinPluginState = {
  min?: number;
};

/**
 * Numeric min plugin
 * 
 * Tracks the minimum numeric value
 */
export class MinPlugin extends ResolverPlugin<MinPluginState> {
  name = 'min';

  initialize(dependencies: DependencyStates): MinPluginState {
    return { min: this.target ? dependencies[this.target] as number : undefined };
  }

  update(
    currentState: MinPluginState, 
    newValue?: PropertyTypes, 
  ): MinPluginState {
    const numValue = newValue as number;
    if (currentState.min === undefined || numValue < currentState.min) {
      return { min: numValue };
    }
    return currentState;
  }

  resolve(
    state: MinPluginState,
  ): PropertyTypes | undefined {
    return state.min;
  }
}
