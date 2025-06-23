import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../../views/lossless";
import { ResolverPlugin } from "../plugin";

type ConcatenationState = {
  values: Array<{ value: string; timestamp: number }>;
};

/**
 * Concatenation plugin (for string values)
 * 
 * Concatenates all string values with a separator
 */
export class ConcatenationPlugin implements ResolverPlugin<ConcatenationState> {
  readonly name = 'concatenation';
  readonly dependencies = [] as const;

  constructor(private separator: string = ' ') {}

  initialize(): ConcatenationState {
    return { values: [] };
  }

  update(
    currentState: ConcatenationState, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _dependencies: Record<string, never> = {}
  ): ConcatenationState {
    if (typeof newValue === 'string') {
      return {
        values: [
          ...currentState.values,
          { value: newValue, timestamp: delta.timeCreated }
        ]
      };
    }
    return currentState;
  }

  resolve(
    state: ConcatenationState,
    _dependencies: Record<string, never> = {}
  ): PropertyTypes {
    // Sort by timestamp to ensure consistent ordering
    const sortedValues = [...state.values].sort((a, b) => a.timestamp - b.timestamp);
    
    // Use a Set to track seen values and keep only the first occurrence of each value
    const seen = new Set<string>();
    const uniqueValues: string[] = [];
    
    for (const { value } of sortedValues) {
      if (!seen.has(value)) {
        seen.add(value);
        uniqueValues.push(value);
      }
    }
    
    return uniqueValues.join(this.separator);
  }
}
