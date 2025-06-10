import { apply } from 'json-logic-js';
import Debug from 'debug';
import { SchemaRegistry, SchemaID, ObjectSchema } from '../schema/schema';
import { Lossless, LosslessViewOne, LosslessViewMany, CollapsedDelta } from '../views/lossless';
import { DomainEntityID } from '../core/types';
import { DeltaFilter } from '../core/delta';

const debug = Debug('rz:query');

export type JsonLogic = Record<string, unknown>;

export interface QueryOptions {
  maxResults?: number;
  deltaFilter?: DeltaFilter;
}

export interface QueryResult {
  entities: LosslessViewMany;
  totalFound: number;
  limited: boolean;
}

export class QueryEngine {
  constructor(
    private lossless: Lossless,
    private schemaRegistry: SchemaRegistry
  ) {}

  /**
   * Query entities by schema type with optional JSON Logic filter
   */
  async query(
    schemaId: SchemaID, 
    filter?: JsonLogic, 
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    debug(`Querying schema ${schemaId} with filter:`, filter);

    // 1. Find all entities that could match this schema
    const candidateEntityIds = this.discoverEntitiesBySchema(schemaId);
    debug(`Found ${candidateEntityIds.length} candidate entities for schema ${schemaId}`);

    // 2. Compose lossless views for all candidates
    const allViews = this.lossless.compose(candidateEntityIds, options.deltaFilter);
    debug(`Composed ${Object.keys(allViews).length} lossless views`);

    // 3. Apply JSON Logic filter if provided
    let filteredViews: LosslessViewMany = allViews;
    
    if (filter) {
      filteredViews = this.applyJsonLogicFilter(allViews, filter, schemaId);
      debug(`After filtering: ${Object.keys(filteredViews).length} entities match`);
    }

    // 4. Apply result limits if specified
    const totalFound = Object.keys(filteredViews).length;
    let limited = false;
    
    if (options.maxResults && totalFound > options.maxResults) {
      const entityIds = Object.keys(filteredViews).slice(0, options.maxResults);
      filteredViews = {};
      for (const entityId of entityIds) {
        filteredViews[entityId] = allViews[entityId];
      }
      limited = true;
      debug(`Limited results to ${options.maxResults} entities`);
    }

    return {
      entities: filteredViews,
      totalFound,
      limited
    };
  }

  /**
   * Query for a single entity by ID with schema validation
   */
  async queryOne(schemaId: SchemaID, entityId: DomainEntityID): Promise<LosslessViewOne | null> {
    debug(`Querying single entity ${entityId} with schema ${schemaId}`);

    const views = this.lossless.compose([entityId]);
    const view = views[entityId];
    
    if (!view) {
      debug(`Entity ${entityId} not found`);
      return null;
    }

    // Validate that the entity matches the schema
    if (!this.entityMatchesSchema(view, schemaId)) {
      debug(`Entity ${entityId} does not match schema ${schemaId}`);
      return null;
    }

    return view;
  }

  /**
   * Discover all entities that could potentially match a given schema
   * This is a heuristic based on the schema's required properties
   */
  private discoverEntitiesBySchema(schemaId: SchemaID): DomainEntityID[] {
    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      debug(`Schema ${schemaId} not found in registry`);
      return [];
    }

    // Strategy: Find entities that have deltas for the schema's required properties
    const requiredProperties = schema.requiredProperties || [];
    const allEntityIds = Array.from(this.lossless.domainEntities.keys());

    if (requiredProperties.length === 0) {
      // No required properties - return all entities
      debug(`Schema ${schemaId} has no required properties, returning all entities`);
      return allEntityIds;
    }

    // Find entities that have at least one required property
    const candidateEntities: DomainEntityID[] = [];
    
    for (const entityId of allEntityIds) {
      const entity = this.lossless.domainEntities.get(entityId);
      if (!entity) continue;

      // Check if entity has deltas for any required property
      const hasRequiredProperty = requiredProperties.some(propertyId => 
        entity.properties.has(propertyId)
      );

      if (hasRequiredProperty) {
        candidateEntities.push(entityId);
      }
    }

    debug(`Found ${candidateEntities.length} entities with required properties for schema ${schemaId}`);
    return candidateEntities;
  }

  /**
   * Apply JSON Logic filter to lossless views
   * This requires converting each lossless view to a queryable object
   */
  private applyJsonLogicFilter(
    views: LosslessViewMany, 
    filter: JsonLogic, 
    schemaId: SchemaID
  ): LosslessViewMany {
    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      debug(`Cannot filter without schema ${schemaId}`);
      return views;
    }

    const filteredViews: LosslessViewMany = {};

    for (const [entityId, view] of Object.entries(views)) {
      // Convert lossless view to queryable object using schema
      const queryableObject = this.losslessViewToQueryableObject(view, schema);
      
      try {
        // Apply JSON Logic filter
        const matches = apply(filter, queryableObject);
        
        if (matches) {
          filteredViews[entityId] = view;
          debug(`Entity ${entityId} matches filter`);
        } else {
          debug(`Entity ${entityId} does not match filter`);
        }
      } catch (error) {
        debug(`Error applying filter to entity ${entityId}:`, error);
        // Skip entities that cause filter errors
      }
    }

    return filteredViews;
  }

  /**
   * Convert a lossless view to a queryable object based on schema
   * Uses simple resolution strategies for now
   */
  private losslessViewToQueryableObject(view: LosslessViewOne, schema: ObjectSchema): Record<string, unknown> {
    const obj: Record<string, unknown> = {
      id: view.id,
      _referencedAs: view.referencedAs
    };

    // Convert each schema property from lossless view deltas
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      const deltas = view.propertyDeltas[propertyId] || [];
      
      if (deltas.length === 0) {
        obj[propertyId] = null;
        continue;
      }

      // Apply simple resolution strategy based on property schema type
      switch (propertySchema.type) {
        case 'primitive': {
          // Use last-write-wins for primitives
          const lastDelta = deltas.sort((a, b) => b.timeCreated - a.timeCreated)[0];
          const primitiveValue = this.extractPrimitiveValue(lastDelta, propertyId);
          obj[propertyId] = primitiveValue;
          break;
        }

        case 'array': {
          // Collect all values as array
          const arrayValues = deltas
            .map(delta => this.extractPrimitiveValue(delta, propertyId))
            .filter(value => value !== null);
          obj[propertyId] = arrayValues;
          break;
        }

        case 'reference': {
          // For references, include the target IDs
          const refValues = deltas
            .map(delta => this.extractReferenceValue(delta, propertyId))
            .filter(value => value !== null);
          obj[propertyId] = refValues;
          break;
        }

        default:
          obj[propertyId] = deltas.length;
      }
    }

    debug(`Converted entity ${view.id} to queryable object:`, obj);
    return obj;
  }

  /**
   * Extract primitive value from a delta for a given property
   */
  private extractPrimitiveValue(delta: CollapsedDelta, _propertyId: string): unknown {
    // Look for the value in collapsed pointers
    // CollapsedPointer is {[key: PropertyID]: PropertyTypes}
    for (const pointer of delta.pointers) {
      if (pointer.value !== undefined) {
        return pointer.value;
      }
    }
    return null;
  }

  /**
   * Extract reference value (target ID) from a delta for a given property
   */
  private extractReferenceValue(delta: CollapsedDelta, _propertyId: string): string | null {
    // For references, we want the value pointer that contains the reference ID
    for (const pointer of delta.pointers) {
      if (pointer.value !== undefined && typeof pointer.value === 'string') {
        return pointer.value;
      }
    }
    return null;
  }

  /**
   * Check if an entity matches a schema (basic validation)
   */
  private entityMatchesSchema(view: LosslessViewOne, schemaId: SchemaID): boolean {
    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) return false;

    // Check that all required properties have at least one delta
    const requiredProperties = schema.requiredProperties || [];
    
    for (const propertyId of requiredProperties) {
      const deltas = view.propertyDeltas[propertyId];
      if (!deltas || deltas.length === 0) {
        debug(`Entity ${view.id} missing required property ${propertyId} for schema ${schemaId}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get statistics about queryable entities
   */
  getStats() {
    const totalEntities = this.lossless.domainEntities.size;
    const registeredSchemas = this.schemaRegistry.list().length;
    
    return {
      totalEntities,
      registeredSchemas,
      schemasById: this.schemaRegistry.list().reduce((acc, schema) => {
        acc[schema.id] = this.discoverEntitiesBySchema(schema.id).length;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}