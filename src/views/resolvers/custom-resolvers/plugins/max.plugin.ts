import { PropertyID, PropertyTypes } from "@src/core/types";
import { CollapsedDelta } from "@src/views/lossless";
import { ResolverPlugin, DependencyStates } from "../plugin";

type MaxPluginState = {
  max?: number;
};

/**
 * Numeric max plugin
 * 
 * Tracks the maximum numeric value
 */
export class MaxPlugin<Target extends PropertyID> implements ResolverPlugin<MaxPluginState, Target> {
  name = 'max';
  readonly dependencies: Target[] = [];

  constructor(private readonly target?: Target) {
    if (target) {
      this.dependencies = [target];
    }
  }

  initialize(dependencies: DependencyStates): MaxPluginState {
    return { max: this.target ? dependencies[this.target] as number : undefined };
  }

  update(
    currentState: MaxPluginState, 
    newValue?: PropertyTypes,
    _delta?: CollapsedDelta,
    dependencies?: DependencyStates
  ): MaxPluginState {
    // const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    const numValue = (this.target ? dependencies?.[this.target] : newValue) as number;
    
    if (currentState.max === undefined || numValue > currentState.max) {
      return { max: numValue };
    }
    return currentState;
  }

  resolve(
    state: MaxPluginState,
    _dependencies?: DependencyStates
  ): PropertyTypes | undefined {
    return state.max;
  }
}
