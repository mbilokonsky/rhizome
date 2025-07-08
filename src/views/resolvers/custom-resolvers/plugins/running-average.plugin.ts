import { PropertyTypes } from "@src/core/types";
import { CollapsedDelta } from "@src/views/lossless";
import { ResolverPlugin, DependencyStates } from "../plugin";

type RunningAverageState = {
  sum: number;
  count: number;
};

/**
 * Running Average Plugin
 * 
 * Tracks the running average of numeric values
 */
export class RunningAveragePlugin extends ResolverPlugin<RunningAverageState> {
  readonly dependencies = [] as const;

  initialize(): RunningAverageState {
    return { sum: 0, count: 0 };
  }

  update(
    currentState: RunningAverageState, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _dependencies: DependencyStates = {}
  ): RunningAverageState {
    const numValue = typeof newValue === 'number' ? newValue : 0;
    return {
      sum: currentState.sum + numValue,
      count: currentState.count + 1
    };
  }
  
  resolve(
    state: RunningAverageState,
    _dependencies: DependencyStates = {}
  ): number {
    return state.count > 0 ? state.sum / state.count : 0;
  }
}
