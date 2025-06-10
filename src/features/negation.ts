import Debug from 'debug';
import { Delta, DeltaID } from '../core/delta';
import { CreatorID, HostID } from '../core/types';

const debug = Debug('rz:negation');

// Negation-specific types
export interface NegationPointer {
  localContext: 'negates';
  target: DeltaID;
  targetContext: 'negated_by';
}

export interface NegationDelta extends Delta {
  isNegation: true;
  negatedDeltaId: DeltaID;
}

// Helper functions for creating and identifying negation deltas
export class NegationHelper {
  
  /**
   * Create a negation delta that negates another delta
   */
  static createNegation(
    deltaToNegate: DeltaID,
    creator: CreatorID,
    host: HostID
  ): NegationDelta {
    const negationDelta = new Delta({
      creator,
      host,
      pointers: [{
        localContext: 'negates',
        target: deltaToNegate,
        targetContext: 'negated_by'
      }]
    }) as NegationDelta;

    negationDelta.isNegation = true;
    negationDelta.negatedDeltaId = deltaToNegate;

    debug(`Created negation delta ${negationDelta.id} negating ${deltaToNegate}`);
    return negationDelta;
  }

  /**
   * Check if a delta is a negation delta
   */
  static isNegationDelta(delta: Delta): delta is NegationDelta {
    return delta.pointers.some(pointer => 
      pointer.localContext === 'negates' && 
      pointer.targetContext === 'negated_by'
    );
  }

  /**
   * Extract the negated delta ID from a negation delta
   */
  static getNegatedDeltaId(negationDelta: Delta): DeltaID | null {
    const negationPointer = negationDelta.pointers.find(pointer =>
      pointer.localContext === 'negates' && 
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
  static findNegationsFor(targetDeltaId: DeltaID, deltas: Delta[]): NegationDelta[] {
    return deltas
      .filter(delta => this.isNegationDelta(delta))
      .filter(delta => this.getNegatedDeltaId(delta) === targetDeltaId) as NegationDelta[];
  }

  /**
   * Check if a delta is negated by any negation deltas
   */
  static isDeltaNegated(deltaId: DeltaID, deltas: Delta[]): boolean {
    return this.findNegationsFor(deltaId, deltas).length > 0;
  }

  /**
   * Filter out negated deltas from a list
   * Returns deltas that are not negated by any negation deltas in the list
   */
  static filterNegatedDeltas(deltas: Delta[]): Delta[] {
    const negatedDeltaIds = new Set<DeltaID>();
    
    // First pass: collect all negated delta IDs
    for (const delta of deltas) {
      if (this.isNegationDelta(delta)) {
        const negatedId = this.getNegatedDeltaId(delta);
        if (negatedId) {
          negatedDeltaIds.add(negatedId);
        }
      }
    }

    // Second pass: filter out negated deltas and negation deltas themselves
    return deltas.filter(delta => {
      // Exclude negation deltas themselves (they're metadata)
      if (this.isNegationDelta(delta)) {
        return false;
      }
      
      // Exclude deltas that have been negated
      if (negatedDeltaIds.has(delta.id)) {
        debug(`Filtering out negated delta ${delta.id}`);
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
    negatedDeltaIds: DeltaID[];
    negationMap: Map<DeltaID, DeltaID[]>; // negated -> [negating deltas]
  } {
    const negationDeltas = deltas.filter(d => this.isNegationDelta(d));
    const negatedDeltaIds = new Set<DeltaID>();
    const negationMap = new Map<DeltaID, DeltaID[]>();

    for (const negDelta of negationDeltas) {
      const negatedId = this.getNegatedDeltaId(negDelta);
      if (negatedId) {
        negatedDeltaIds.add(negatedId);
        
        if (!negationMap.has(negatedId)) {
          negationMap.set(negatedId, []);
        }
        negationMap.get(negatedId)!.push(negDelta.id);
      }
    }

    const effectiveDeltas = deltas.length - negationDeltas.length - negatedDeltaIds.size;

    return {
      totalDeltas: deltas.length,
      negationDeltas: negationDeltas.length,
      negatedDeltas: negatedDeltaIds.size,
      effectiveDeltas,
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