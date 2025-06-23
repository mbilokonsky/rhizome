import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * Majority vote plugin
 * 
 * Returns the value that appears most frequently
 */
export class MajorityVotePlugin implements ResolverPlugin<{ votes: Map<PropertyTypes, number> }> {
  name = 'majority-vote';
  dependencies: string[] = [];

  initialize() {
    return { votes: new Map<PropertyTypes, number>() };
  }

  update(
    currentState: { votes: Map<PropertyTypes, number> }, 
    newValue: PropertyTypes, 
    _delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
    const currentCount = currentState.votes.get(newValue) || 0;
    currentState.votes.set(newValue, currentCount + 1);
    return currentState;
  }

  resolve(
    state: { votes: Map<PropertyTypes, number> },
    _allStates?: Record<string, unknown>
  ): PropertyTypes | undefined {
    let maxCount = 0;
    let result: PropertyTypes | undefined;
    
    state.votes.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        result = value;
      }
    });
    
    return result;
  }
}
