import { PropertyTypes, PropertyID } from "../../../../core/types";
import { DependencyStates, ResolverPlugin } from "../plugin";

type MinPluginState = {
  min?: number;
};

/**
 * Numeric min plugin
 * 
 * Tracks the minimum numeric value
 */
export class MinPlugin<Target extends PropertyID> extends ResolverPlugin<MinPluginState, Target> {
  name = 'min';
  readonly dependencies: Target[] = [];

  constructor(private readonly target?: Target) {
    super();
    if (target) {
      this.dependencies = [target];
    }
  }

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
