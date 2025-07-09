import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../hyperview";
import { ResolverPlugin } from "../plugin";
import Debug from 'debug';
const debug = Debug('rz:concatenation-plugin');

type ConcatenationState = {
  values: Array<{ value: string; timestamp: number }>;
};

/**
 * Concatenation plugin (for string values)
 * 
 * Concatenates all string values with a separator
 */
export class ConcatenationPlugin extends ResolverPlugin<ConcatenationState> {
  readonly dependencies = [] as const;

  constructor(private separator: string = ' ') {
    super();
  }

  initialize(): ConcatenationState {
    return { values: [] };
  }

  update(
    currentState: ConcatenationState, 
    newValue: PropertyTypes | null, 
    delta: CollapsedDelta,
  ): ConcatenationState {
    debug(`Update, newValue: ${newValue}`);
    // Skip null, undefined, or non-string values
    if (newValue === null || newValue === undefined || typeof newValue !== 'string') {
      return currentState;
    }
    
    return {
      values: [
        ...currentState.values,
        { value: newValue, timestamp: delta.timeCreated }
      ]
    };
  }

  resolve(
    state: ConcatenationState,
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
