import { CollapsedDelta, Lossless, LosslessViewOne } from "../lossless";
import { PropertyTypes } from "../../core/types";
import { Lossy } from "../lossy";
import Debug from 'debug';
import { CustomResolver, LastWriteWinsPlugin } from "./custom-resolvers";

const debug = Debug('rz:resolver:relationship-graph');
const trace = Debug('rz:resolver:relationship-graph:trace');
trace.enabled = true; // Always enable trace for now

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
  private relData: CustomResolver;
  constructor(lossless: Lossless) {
    super(lossless);

    this.relData = new CustomResolver(lossless, {
      relationships: new LastWriteWinsPlugin(),
    });
  }
  /**
   * Initialize a new accumulator
   */
  protected createRelationshipGraphAccumulator(): RelationshipGraphAccumulator {
    debug('Creating new relationship graph accumulator');
    const accumulator = {
      entities: new Map(),
      relationships: new Map(),
      relationshipsByType: new Map(),
      lastUpdated: Date.now()
    };
    trace('Created accumulator:', accumulator);
    return accumulator;
  }

  /**
   * Initialize the accumulator with a view
   */
  initializer(view: LosslessViewOne): RelationshipGraphAccumulator {
    debug('Initializing relationship graph for view:', view.id);
    const graph = this.createRelationshipGraphAccumulator();

    this.relData.initializer(view);
    
    trace('Initialized graph state:', {
      entities: Array.from(graph.entities.keys()),
      relationships: Array.from(graph.relationships.keys()),
      relationshipTypes: Array.from(graph.relationshipsByType.keys())
    });
    
    return graph;
  }

  /**
   * Process a view and update the accumulator
   */
  reducer(graph: RelationshipGraphAccumulator, view: LosslessViewOne): RelationshipGraphAccumulator {
    debug(`Processing view ${view.id} in reducer`);
    trace('View details:', {
      id: view.id,
      propertyCount: Object.keys(view.propertyDeltas).length,
      properties: Object.keys(view.propertyDeltas)
    });

    // if (!isRelationshipEntity) {
    //   trace(`Skipping non-relationship delta: ${view.id}`);
    //   return graph;
    // }
    
    // Ensure entity exists in the graph
    if (!graph.entities.has(view.id)) {
      trace(`Adding new entity in reducer: ${view.id}`);
      graph.entities.set(view.id, {
        outbound: new Map(),
        inbound: new Map()
      });
    }
    
    // Process relationship properties
    for (const [property, deltas] of Object.entries(view.propertyDeltas)) {
      trace(`Processing property: ${property} with ${deltas.length} deltas`);
      
      // Skip non-relationship properties
      if (!property.startsWith('_rel_')) {
        trace(`Skipping non-relationship property: ${property}`);
        continue;
      }

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
    debug('Resolving relationship graph');
    trace('Graph state at resolution:', {
      entities: Array.from(graph.entities.keys()),
      relationships: Array.from(graph.relationships.keys()),
      relationshipTypes: Array.from(graph.relationshipsByType.entries()).map(([type, ids]) => ({
        type,
        count: ids.size
      }))
    });
    return graph;
  }

  /**
   * Process a single relationship delta
   */
  private processRelationshipDelta(graph: RelationshipGraphAccumulator, delta: CollapsedDelta): void {
    debug('Processing relationship delta:', delta.id);
    trace('Delta details:', delta);
    
    // Extract relationship metadata from the delta
    const relProps = this.extractRelationshipProperties(delta);
    if (!relProps) {
      debug('No relationship properties found in delta:', delta.id);
      return;
    }
    
    trace('Extracted relationship properties:', relProps);

    const { type, sourceId, targetId, relId, properties } = relProps;
    
    debug(`Processing relationship ${relId} of type ${type} from ${sourceId} to ${targetId}`);
    
    // Ensure source and target entities exist in the graph
    if (!graph.entities.has(sourceId)) {
      trace(`Adding source entity: ${sourceId}`);
      graph.entities.set(sourceId, { outbound: new Map(), inbound: new Map() });
    }
    if (!graph.entities.has(targetId)) {
      trace(`Adding target entity: ${targetId}`);
      graph.entities.set(targetId, { outbound: new Map(), inbound: new Map() });
    }
    
    // Get or create the relationship
    let relationship = graph.relationships.get(relId);
    
    if (!relationship) {
      debug(`Creating new relationship: ${relId} (${type})`);
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
      trace(`Added relationship ${relId} to relationships map`);
      
      // Add to relationships by type index
      if (!graph.relationshipsByType.has(type)) {
        trace(`Creating new relationship type index: ${type}`);
        graph.relationshipsByType.set(type, new Set());
      }
      graph.relationshipsByType.get(type)?.add(relId);
      trace(`Added relationship ${relId} to type index: ${type}`);
      
      // Update entity relationships
      const sourceEntity = graph.entities.get(sourceId)!;
      const targetEntity = graph.entities.get(targetId)!;
      
      sourceEntity.outbound.set(relId, relationship);
      targetEntity.inbound.set(relId, relationship);
      
      trace('Updated entity relationships:', {
        sourceOutbound: Array.from(sourceEntity.outbound.keys()),
        targetInbound: Array.from(targetEntity.inbound.keys())
      });
    } else {
      debug(`Updating existing relationship: ${relId}`);
      // TODO: Conflict resolution e.g. using TimestampResolver
      relationship.properties = { ...relationship.properties, ...properties };
      
      // Track this delta if not already present
      if (!relationship.deltas.includes(delta.id)) {
        relationship.deltas.push(delta.id);
        trace(`Added delta ${delta.id} to relationship ${relId}`);
      } else {
        trace(`Delta ${delta.id} already tracked for relationship ${relId}`);
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
