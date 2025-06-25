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
export class MaxPlugin<Target extends PropertyID> extends ResolverPlugin<MaxPluginState, Target> {
  name = 'max';
  readonly dependencies: Target[] = [];

  constructor(private readonly target?: Target) {
    super();
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
  ): MaxPluginState {
    const numValue = newValue as number;
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
