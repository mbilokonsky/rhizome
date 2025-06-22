import { CollapsedDelta, LosslessViewOne } from "../lossless";
import { PropertyTypes } from "../../core/types";
import { Lossy } from "../lossy";

/**
 * Represents a single relationship between entities
 */
export interface Relationship {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, PropertyTypes>;
  deltas: string[];
}

/**
 * Tracks relationships from a single entity's perspective
 */
interface EntityRelationships {
  outbound: Map<string, Relationship>; // relationshipId -> Relationship
  inbound: Map<string, Relationship>;  // relationshipId -> Relationship
}

/**
 * The accumulator that maintains the complete relationship graph state
 */
interface RelationshipGraphAccumulator {
  // Maps entity ID to its relationships
  entities: Map<string, EntityRelationships>;
  
  // Maps relationship ID to the relationship data
  relationships: Map<string, Relationship>;
  
  // For quick lookups by relationship type
  relationshipsByType: Map<string, Set<string>>; // type -> Set<relationshipId>
  
  // Timestamp of the most recent update
  lastUpdated?: number;
}

/**
 * The public view of relationships for a single entity
 */
export type RelationshipView = {
  outbound: Relationship[];
  inbound: Relationship[];
};

/**
 * A resolver that builds a relationship graph from a LosslessViewMany
 */
export class RelationshipGraphResolver extends Lossy<RelationshipGraphAccumulator, RelationshipGraphAccumulator> {
  /**
   * Initialize a new accumulator
   */
  protected createRelationshipGraphAccumulator(): RelationshipGraphAccumulator {
    return {
      entities: new Map(),
      relationships: new Map(),
      relationshipsByType: new Map(),
      lastUpdated: Date.now()
    };
  }

  /**
   * Initialize the accumulator with a view
   */
  initializer(view: LosslessViewOne): RelationshipGraphAccumulator {
    const graph = this.createRelationshipGraphAccumulator();
    
    // Initialize entity relationships if they don't exist
    if (!graph.entities.has(view.id)) {
      graph.entities.set(view.id, {
        outbound: new Map(),
        inbound: new Map()
      });
    }
    
    return graph;
  }

  /**
   * Process a view and update the accumulator
   */
  reducer(graph: RelationshipGraphAccumulator, view: LosslessViewOne): RelationshipGraphAccumulator {
    // Ensure entity exists in the graph
    if (!graph.entities.has(view.id)) {
      graph.entities.set(view.id, {
        outbound: new Map(),
        inbound: new Map()
      });
    }
    
    // Process relationship properties
    for (const [property, deltas] of Object.entries(view.propertyDeltas)) {
      // Skip non-relationship properties
      if (!property.startsWith('_rel_')) continue;

      for (const delta of deltas) {
        this.processRelationshipDelta(graph, delta);
      }
    }
    
    graph.lastUpdated = Date.now();
    return graph;
  }

  /**
   * Resolve the accumulator into a final result.
   * For now, we just return the accumulator as is.
   */
  resolver(graph: RelationshipGraphAccumulator): RelationshipGraphAccumulator {
    return graph;
  }

  /**
   * Process a single relationship delta
   */
  private processRelationshipDelta(graph: RelationshipGraphAccumulator, delta: CollapsedDelta): void {
    // Extract relationship metadata from the delta
    const relProps = this.extractRelationshipProperties(delta);
    if (!relProps) return;

    const { type, sourceId, targetId, relId, properties } = relProps;
    
    // Ensure source and target entities exist in the graph
    if (!graph.entities.has(sourceId)) {
      graph.entities.set(sourceId, { outbound: new Map(), inbound: new Map() });
    }
    if (!graph.entities.has(targetId)) {
      graph.entities.set(targetId, { outbound: new Map(), inbound: new Map() });
    }
    
    // Get or create the relationship
    let relationship = graph.relationships.get(relId);
    
    if (!relationship) {
      // Create new relationship
      relationship = {
        id: relId,
        type,
        source: sourceId,
        target: targetId,
        properties: { ...properties },
        deltas: [delta.id]
      };
      
      // Add to relationships map
      graph.relationships.set(relId, relationship);
      
      // Add to relationships by type index
      if (!graph.relationshipsByType.has(type)) {
        graph.relationshipsByType.set(type, new Set());
      }
      graph.relationshipsByType.get(type)?.add(relId);
      
      // Update entity relationships
      const sourceEntity = graph.entities.get(sourceId)!;
      const targetEntity = graph.entities.get(targetId)!;
      
      sourceEntity.outbound.set(relId, relationship);
      targetEntity.inbound.set(relId, relationship);
    } else {
      // Update existing relationship
      // TODO: Conflict resolution e.g. using TimestampResolver
      relationship.properties = { ...relationship.properties, ...properties };
      
      // Track this delta if not already present
      if (!relationship.deltas.includes(delta.id)) {
        relationship.deltas.push(delta.id);
      }
    }
  }

  /**
   * Extract relationship properties from a delta
   */
  private extractRelationshipProperties(delta: CollapsedDelta): {
    relId: string;
    sourceId: string;
    targetId: string;
    type: string;
    properties: Record<string, PropertyTypes>;
  } | null {
    // Get all pointers that are part of this relationship
    const relPointers = delta.pointers.filter(p => 
      p._rel_source || p._rel_target || p._rel_type
    );
    
    if (relPointers.length === 0) return null;
    
    // Find the relationship metadata
    const sourcePtr = relPointers.find(p => p._rel_source);
    const targetPtr = relPointers.find(p => p._rel_target);
    const typePtr = relPointers.find(p => p._rel_type);
    
    if (!sourcePtr || !targetPtr || !typePtr) return null;
    
    const relId = delta.id; // Use delta ID as relationship ID
    const sourceId = sourcePtr._rel_source as string;
    const targetId = targetPtr._rel_target as string;
    const type = typePtr._rel_type as string;
    
    // Extract other properties (non-special _rel_ pointers)
    const properties: Record<string, PropertyTypes> = {};
    
    for (const ptr of delta.pointers) {
      for (const [key, value] of Object.entries(ptr)) {
        if (key.startsWith('_rel_') && !['_rel_source', '_rel_target', '_rel_type'].includes(key)) {
          const propName = key.substring(5); // Remove '_rel_' prefix
          properties[propName] = value as PropertyTypes;
        }
      }
    }
    
    return { relId, sourceId, targetId, type, properties };
  }
}
