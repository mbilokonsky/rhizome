import { PropertyTypes } from "../../../../core/types";
import { CollapsedDelta } from "../../../lossless";
import { ResolverPlugin } from "../plugin";

/**
 * Concatenation plugin (for string values)
 * 
 * Concatenates all string values with a separator
 */
export class ConcatenationPlugin implements ResolverPlugin<{ values: { value: string, timestamp: number }[] }> {
  name = 'concatenation';
  dependencies: string[] = [];

  constructor(private separator: string = ' ') {}

  initialize() {
    return { values: [] };
  }

  update(
    currentState: { values: { value: string, timestamp: number }[] }, 
    newValue: PropertyTypes, 
    delta: CollapsedDelta,
    _allStates?: Record<string, unknown>
  ) {
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
    state: { values: { value: string, timestamp: number }[] },
    _allStates?: Record<string, unknown>
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
