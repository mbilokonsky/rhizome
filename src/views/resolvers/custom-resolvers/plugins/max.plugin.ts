import { PropertyTypes } from "@src/core/types";
import { ResolverPlugin, DependencyStates } from "../plugin";

type MaxPluginState = {
  max?: number;
};

/**
 * Numeric max plugin
 * 
 * Tracks the maximum numeric value
 */
export class MaxPlugin extends ResolverPlugin<MaxPluginState> {
  name = 'max';

  initialize(dependencies: DependencyStates): MaxPluginState {
    return { max: this.target ? dependencies[this.target] as number : undefined };
  }

  update(
    currentState: MaxPluginState, 
    newValue?: PropertyTypes,
  ): MaxPluginState {
    const numValue = newValue as number;
    if (currentState.max === undefined || numValue > currentState.max) {
      return { max: numValue };
    }
    return currentState;
  }

  resolve(
    state: MaxPluginState,
  ): PropertyTypes | undefined {
    return state.max;
  }
}
