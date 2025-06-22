import Debug from 'debug';
import { Delta, DeltaID } from '../core/delta';
import { createDelta } from '../core/delta-builder';
import { CreatorID, HostID } from '../core/types';

const debug = Debug('rz:negation');

// Negation-specific types
export interface NegationPointer {
  localContext: '_negates';
  target: DeltaID;
  targetContext: 'negated_by';
}

// Helper functions for creating and identifying negation deltas
export class NegationHelper {
  /**
   * Check if a delta is a negation delta
   */
  static isNegationDelta(delta: Delta): boolean {
    return delta.pointers.some(pointer => 
      pointer.localContext === '_negates' && 
      pointer.targetContext === 'negated_by'
    );
  }

  /**
   * Extract the negated delta ID from a negation delta
   */
  static getNegatedDeltaId(negationDelta: Delta): DeltaID | null {
    const negationPointer = negationDelta.pointers.find(pointer =>
      pointer.localContext === '_negates' && 
      pointer.targetContext === 'negated_by'
    );

    if (negationPointer && typeof negationPointer.target === 'string') {
      return negationPointer.target;
    }

    return null;
  }

  /**
   * Find all negation deltas that negate a specific delta
   */
  static findNegationsFor(targetDeltaId: DeltaID, deltas: Delta[]): Delta[] {
    return deltas
      .filter(delta => this.isNegationDelta(delta))
      .filter(delta => this.getNegatedDeltaId(delta) === targetDeltaId);
  }

  /**
   * Check if a delta is negated by any negation deltas
   * @param deltaId The ID of the delta to check
   * @param deltas The list of all deltas to consider
   * @returns True if the delta is effectively negated, false otherwise
   */
  static isDeltaNegated(deltaId: DeltaID, deltas: Delta[]): boolean {
    // Create a map of delta ID to its negation status
    const deltaStatus = new Map<DeltaID, boolean>();
    // Create a map of delta ID to its negation deltas
    const deltaToNegations = new Map<DeltaID, Delta[]>();
    
    // First pass: collect all deltas and their negations
    for (const delta of deltas) {
      if (this.isNegationDelta(delta)) {
        const negatedId = this.getNegatedDeltaId(delta);
        if (negatedId) {
          if (!deltaToNegations.has(negatedId)) {
            deltaToNegations.set(negatedId, []);
          }
          deltaToNegations.get(negatedId)!.push(delta);
        }
      }
    }

    // Function to determine if a delta is effectively negated
    const isEffectivelyNegated = (currentDeltaId: DeltaID, visited: Set<DeltaID> = new Set()): boolean => {
      // Avoid infinite recursion in case of cycles
      if (visited.has(currentDeltaId)) {
        return false; // If we've seen this delta before, assume it's not negated to break the cycle
      }
      
      // Check if we've already determined this delta's status
      if (deltaStatus.has(currentDeltaId)) {
        return deltaStatus.get(currentDeltaId)!;
      }
      
      // Get all negations targeting this delta
      const negations = deltaToNegations.get(currentDeltaId) || [];
      
      // If there are no negations, the delta is not negated
      if (negations.length === 0) {
        deltaStatus.set(currentDeltaId, false);
        return false;
      }
      
      // Check each negation to see if it's effectively applied
      // A negation is effective if it's not itself negated
      for (const negation of negations) {
        // If the negation delta is not itself negated, then the target is negated
        if (!isEffectivelyNegated(negation.id, new Set([...visited, currentDeltaId]))) {
          deltaStatus.set(currentDeltaId, true);
          return true;
        }
      }
      
      // If all negations are themselves negated, the delta is not negated
      deltaStatus.set(currentDeltaId, false);
      return false;
    };

    // Check if the target delta is negated
    return isEffectivelyNegated(deltaId);
  }

  /**
   * Filter out negated deltas from a list, handling both direct and indirect negations
   * Returns deltas that are not effectively negated by any chain of negations
   */
  static filterNegatedDeltas(deltas: Delta[]): Delta[] {
    // Create a map of delta ID to its negation status
    const deltaStatus = new Map<DeltaID, boolean>();
    // Create a map of delta ID to its negation deltas
    const deltaToNegations = new Map<DeltaID, Delta[]>();
    
    // First pass: collect all deltas and their negations
    for (const delta of deltas) {
      if (this.isNegationDelta(delta)) {
        const negatedId = this.getNegatedDeltaId(delta);
        if (negatedId) {
          if (!deltaToNegations.has(negatedId)) {
            deltaToNegations.set(negatedId, []);
          }
          deltaToNegations.get(negatedId)!.push(delta);
        }
      }
    }

    // Function to determine if a delta is effectively negated
    const isEffectivelyNegated = (deltaId: DeltaID, visited: Set<DeltaID> = new Set()): boolean => {
      // Avoid infinite recursion in case of cycles
      if (visited.has(deltaId)) {
        return false; // If we've seen this delta before, assume it's not negated to break the cycle
      }
      
      // Check if we've already determined this delta's status
      if (deltaStatus.has(deltaId)) {
        return deltaStatus.get(deltaId)!;
      }
      
      // Get all negations targeting this delta
      const negations = deltaToNegations.get(deltaId) || [];
      
      // If there are no negations, the delta is not negated
      if (negations.length === 0) {
        deltaStatus.set(deltaId, false);
        return false;
      }
      
      // Check each negation to see if it's effectively applied
      // A negation is effective if it's not itself negated
      for (const negation of negations) {
        // If the negation delta is not itself negated, then the target is negated
        if (!isEffectivelyNegated(negation.id, new Set([...visited, deltaId]))) {
          deltaStatus.set(deltaId, true);
          return true;
        }
      }
      
      // If all negations are themselves negated, the delta is not negated
      deltaStatus.set(deltaId, false);
      return false;
    };

    // Second pass: filter out effectively negated deltas and all negation deltas
    return deltas.filter(delta => {
      // Always exclude negation deltas (they're metadata)
      if (this.isNegationDelta(delta)) {
        return false;
      }
      
      // Check if this delta is effectively negated
      const isNegated = isEffectivelyNegated(delta.id);
      
      if (isNegated) {
        debug(`Filtering out effectively negated delta ${delta.id}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Get negation statistics for a list of deltas
   */
  static getNegationStats(deltas: Delta[]): {
    totalDeltas: number;
    negationDeltas: number;
    negatedDeltas: number;
    effectiveDeltas: number;
    negationsByProperty: { [key: string]: { negated: number; total: number } };
    negatedDeltaIds: string[];
    negationMap: Map<DeltaID, DeltaID[]>;
  } {
    const negationDeltas = deltas.filter(d => this.isNegationDelta(d));
    const negationMap = new Map<DeltaID, DeltaID[]>();
    const deltaById = new Map<DeltaID, Delta>();
    const properties = new Set<string>();
    const negatedDeltaIds = new Set<string>();

    // Build maps and collect properties
    for (const delta of deltas) {
      deltaById.set(delta.id, delta);
      
      // Collect all properties referenced in the delta
      if (delta.pointers) {
        for (const pointer of delta.pointers) {
          if (pointer.targetContext) {
            properties.add(pointer.targetContext);
          }
        }
      }
      
      if (this.isNegationDelta(delta)) {
        const negatedId = this.getNegatedDeltaId(delta);
        if (negatedId) {
          if (!negationMap.has(negatedId)) {
            negationMap.set(negatedId, []);
          }
          negationMap.get(negatedId)!.push(delta.id);
        }
      }
    }

    // Track which deltas are effectively negated
    const deltaStatus = new Map<DeltaID, boolean>();
    
    // Function to determine if a delta is effectively negated
    const isEffectivelyNegated = (deltaId: DeltaID, visited: Set<DeltaID> = new Set()): boolean => {
      // Avoid infinite recursion in case of cycles
      if (visited.has(deltaId)) {
        return false; // If we've seen this delta before, assume it's not negated to break the cycle
      }
      
      // Check if we've already determined this delta's status
      if (deltaStatus.has(deltaId)) {
        return deltaStatus.get(deltaId)!;
      }
      
      // Get all negations targeting this delta
      const negations = negationMap.get(deltaId) || [];
      
      // If there are no negations, the delta is not negated
      if (negations.length === 0) {
        deltaStatus.set(deltaId, false);
        return false;
      }
      
      // Check each negation to see if it's effectively applied
      // A negation is effective if it's not itself negated
      for (const negationId of negations) {
        // If the negation delta is not itself negated, then the target is negated
        if (!isEffectivelyNegated(negationId, new Set([...visited, deltaId]))) {
          deltaStatus.set(deltaId, true);
          return true;
        }
      }
      
      // If all negations are themselves negated, the delta is not negated
      deltaStatus.set(deltaId, false);
      return false;
    };

    // First pass: determine status of all deltas
    for (const delta of deltas) {
      isEffectivelyNegated(delta.id);
    }

    // Calculate statistics
    let effectiveDeltas = 0;
    const negationsByProperty: { [key: string]: { negated: number; total: number } } = {};

    // Initialize property counters
    for (const prop of properties) {
      negationsByProperty[prop] = { negated: 0, total: 0 };
    }

    // Second pass: count negated and effective deltas
    for (const delta of deltas) {
      const isNegation = this.isNegationDelta(delta);
      const isNegated = deltaStatus.get(delta.id) || false;

      if (isNegated) {
        // For non-negation deltas, add them to the negated set
        if (!isNegation) {
          negatedDeltaIds.add(delta.id);
        } else {
          // For negation deltas, add the delta they negate (if it's not a negation delta)
          const negatedId = this.getNegatedDeltaId(delta);
          if (negatedId) {
            const negatedDelta = deltaById.get(negatedId);
            if (negatedDelta && !this.isNegationDelta(negatedDelta)) {
              negatedDeltaIds.add(negatedId);
            }
          }
        }
      }

      if (!isNegation) {
        if (isNegated) {
          // Already counted in negatedDeltaIds
        } else {
          effectiveDeltas++;
        }
      }
    }

    // Update property-based statistics
    for (const delta of deltas) {
      const isNegated = deltaStatus.get(delta.id) || false;
      
      if (delta.pointers) {
        for (const pointer of delta.pointers) {
          if (pointer.targetContext && negationsByProperty[pointer.targetContext] !== undefined) {
            negationsByProperty[pointer.targetContext].total++;
            if (isNegated) {
              negationsByProperty[pointer.targetContext].negated++;
            }
          }
        }
      }
    }

    return {
      totalDeltas: deltas.length,
      negationDeltas: negationDeltas.length,
      negatedDeltas: negatedDeltaIds.size,
      effectiveDeltas,
      negationsByProperty,
      negatedDeltaIds: Array.from(negatedDeltaIds),
      negationMap
    };
  }
  
  /**
   * Apply negations to a delta stream in chronological order
   * Later negations can override earlier ones
   */
  static applyNegationsChronologically(deltas: Delta[]): Delta[] {
    // Sort by timestamp to apply negations in order
    const sortedDeltas = [...deltas].sort((a, b) => a.timeCreated - b.timeCreated);
    const negatedIds = new Set<DeltaID>();
    const unnegatedIds = new Set<DeltaID>();

    // Process deltas in chronological order
    for (const delta of sortedDeltas) {
      if (this.isNegationDelta(delta)) {
        const negatedId = this.getNegatedDeltaId(delta);
        if (negatedId) {
          negatedIds.add(negatedId);
          unnegatedIds.delete(negatedId); // Remove from unnegated if it was there
          debug(`Chronologically negated delta ${negatedId} at time ${delta.timeCreated}`);
        }
      } else {
        // If this delta was previously negated, it might be reinstated by this newer delta
        if (negatedIds.has(delta.id)) {
          // Check if there are any negations after this delta's timestamp
          const laterNegations = sortedDeltas
            .filter(d => d.timeCreated > delta.timeCreated)
            .filter(d => this.isNegationDelta(d))
            .filter(d => this.getNegatedDeltaId(d) === delta.id);
          
          if (laterNegations.length === 0) {
            unnegatedIds.add(delta.id);
            negatedIds.delete(delta.id);
          }
        }
      }
    }

    // Filter based on final negation state
    return deltas.filter(delta => {
      if (this.isNegationDelta(delta)) {
        return false; // Remove negation deltas from final result
      }
      return !negatedIds.has(delta.id);
    });
  }
}

// Export a singleton instance for convenience
export const Negation = NegationHelper;