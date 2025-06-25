import { PropertyTypes } from "../../../../core/types";
import { ResolverPlugin } from "../plugin";

type MajorityVoteState = {
  votes: Map<PropertyTypes, number>;
};

/**
 * Majority vote plugin
 * 
 * Returns the value that appears most frequently
 */
export class MajorityVotePlugin extends ResolverPlugin<MajorityVoteState, never> {
  readonly dependencies = [] as const;

  initialize(): MajorityVoteState {
    return { votes: new Map<PropertyTypes, number>() };
  }

  update(
    currentState: MajorityVoteState, 
    newValue: PropertyTypes, 
  ): MajorityVoteState {
    if (newValue === undefined) return currentState;
    const currentCount = currentState.votes.get(newValue) || 0;
    // Create a new Map to ensure immutability
    const newVotes = new Map(currentState.votes);
    newVotes.set(newValue, currentCount + 1);
    return { votes: newVotes };
  }

  resolve(
    state: MajorityVoteState,
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
