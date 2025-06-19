import jsonLogic from 'json-logic-js';
const { apply } = jsonLogic;
import Debug from 'debug';
import { SchemaRegistry, SchemaID, ObjectSchema } from '../schema';
import { DeltaQueryStorage, DeltaQuery } from '../storage/interface';
import { DomainEntityID } from '../core/types';
import { Delta, DeltaFilter } from '../core/delta';

const debug = Debug('rz:storage-query');

export type JsonLogic = Record<string, unknown>;

export interface StorageQueryOptions {
  maxResults?: number;
  deltaFilter?: DeltaFilter;
  useIndexes?: boolean; // Whether to use storage indexes for optimization
}

export interface StorageQueryResult {
  entities: StorageEntityResult[];
  totalFound: number;
  limited: boolean;
  queryTime: number; // milliseconds
}

export interface StorageEntityResult {
  entityId: DomainEntityID;
  deltas: Delta[];
  properties: Record<string, unknown>; // Resolved properties for filtering
}

/**
 * Query engine that works directly with storage backends
 * Supports both in-memory and persistent storage with optimizations
 */
export class StorageQueryEngine {
  constructor(
    private storage: DeltaQueryStorage,
    private schemaRegistry: SchemaRegistry
  ) {}

  /**
   * Query entities by schema type with optional JSON Logic filter
   * This version works directly with the storage layer for better performance
   */
  async query(
    schemaId: SchemaID, 
    filter?: JsonLogic, 
    options: StorageQueryOptions = {}
  ): Promise<StorageQueryResult> {
    const startTime = Date.now();
    debug(`Querying schema ${schemaId} with filter:`, filter);

    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      throw new Error(`Schema ${schemaId} not found`);
    }

    // 1. Use storage queries to find candidate deltas efficiently
    const candidateDeltas = await this.findCandidateDeltas(schema, options);
    debug(`Found ${candidateDeltas.length} candidate deltas`);

    // 2. Group deltas by entity
    const entityGroups = this.groupDeltasByEntity(candidateDeltas, schema);
    debug(`Grouped into ${entityGroups.length} entities`);

    // 3. Resolve properties for filtering
    const entityResults: StorageEntityResult[] = [];
    for (const group of entityGroups) {
      const properties = this.resolveEntityProperties(group.deltas, schema);
      entityResults.push({
        entityId: group.entityId,
        deltas: group.deltas,
        properties
      });
    }

    // 4. Apply JSON Logic filter if provided
    let filteredResults = entityResults;
    if (filter) {
      filteredResults = this.applyJsonLogicFilter(entityResults, filter);
      debug(`After filtering: ${filteredResults.length} entities match`);
    }

    // 5. Apply result limits
    const totalFound = filteredResults.length;
    let limited = false;
    
    if (options.maxResults && totalFound > options.maxResults) {
      filteredResults = filteredResults.slice(0, options.maxResults);
      limited = true;
      debug(`Limited results to ${options.maxResults} entities`);
    }

    const queryTime = Date.now() - startTime;
    debug(`Query completed in ${queryTime}ms`);

    return {
      entities: filteredResults,
      totalFound,
      limited,
      queryTime
    };
  }

  /**
   * Query for a single entity by ID with schema validation
   */
  async queryOne(schemaId: SchemaID, entityId: DomainEntityID): Promise<StorageEntityResult | null> {
    debug(`Querying single entity ${entityId} with schema ${schemaId}`);

    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      throw new Error(`Schema ${schemaId} not found`);
    }

    // Get all deltas for this entity
    const deltas = await this.storage.getDeltasForEntity(entityId);
    
    if (deltas.length === 0) {
      return null;
    }

    // Resolve properties and validate against schema
    const properties = this.resolveEntityProperties(deltas, schema);
    
    // Basic schema validation - check required properties
    if (!this.entityMatchesSchema(properties, schema)) {
      debug(`Entity ${entityId} does not match schema ${schemaId}`);
      return null;
    }

    return {
      entityId,
      deltas,
      properties
    };
  }

  /**
   * Find candidate deltas based on schema requirements
   */
  private async findCandidateDeltas(schema: ObjectSchema, options: StorageQueryOptions): Promise<Delta[]> {
    const requiredProperties = schema.requiredProperties || [];
    
    if (requiredProperties.length === 0) {
      // No required properties - get all deltas (with optional filter)
      return await this.storage.getAllDeltas(options.deltaFilter);
    }

    // Use storage query optimization if available
    if (options.useIndexes !== false && 'queryDeltas' in this.storage) {
      const deltaQuery: DeltaQuery = {
        contexts: requiredProperties,
        // Add other query optimizations based on schema
      };
      
      return await this.storage.queryDeltas(deltaQuery);
    }

    // Fallback: get all deltas and filter
    return await this.storage.getAllDeltas(options.deltaFilter);
  }

  /**
   * Group deltas by the entities they reference
   */
  private groupDeltasByEntity(deltas: Delta[], schema: ObjectSchema): { entityId: DomainEntityID; deltas: Delta[] }[] {
    const entityMap = new Map<DomainEntityID, Delta[]>();

    for (const delta of deltas) {
      // Find entity references in this delta
      const entityIds = this.extractEntityIds(delta, schema);
      
      for (const entityId of entityIds) {
        if (!entityMap.has(entityId)) {
          entityMap.set(entityId, []);
        }
        entityMap.get(entityId)!.push(delta);
      }
    }

    return Array.from(entityMap.entries()).map(([entityId, deltas]) => ({
      entityId,
      deltas
    }));
  }

  /**
   * Extract entity IDs from a delta based on schema context
   */
  private extractEntityIds(delta: Delta, schema: ObjectSchema): DomainEntityID[] {
    const entityIds: DomainEntityID[] = [];
    
    for (const pointer of delta.pointers) {
      // Check if this pointer references an entity with a property defined in the schema
      if (typeof pointer.target === 'string' && 
          pointer.targetContext && 
          schema.properties[pointer.targetContext]) {
        entityIds.push(pointer.target);
      }
    }
    
    return [...new Set(entityIds)]; // Remove duplicates
  }

  /**
   * Resolve entity properties from deltas for query filtering
   */
  private resolveEntityProperties(deltas: Delta[], schema: ObjectSchema): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    // Group deltas by property context
    const propertyDeltas = new Map<string, Delta[]>();
    
    for (const delta of deltas) {
      for (const pointer of delta.pointers) {
        if (pointer.targetContext && schema.properties[pointer.targetContext]) {
          if (!propertyDeltas.has(pointer.targetContext)) {
            propertyDeltas.set(pointer.targetContext, []);
          }
          propertyDeltas.get(pointer.targetContext)!.push(delta);
        }
      }
    }

    // Resolve each property using simple last-write-wins strategy
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      const propDeltas = propertyDeltas.get(propertyId) || [];
      
      if (propDeltas.length === 0) {
        properties[propertyId] = null;
        continue;
      }

      // Apply simple resolution strategy based on property schema type
      switch (propertySchema.type) {
        case 'primitive': {
          // Use last-write-wins for primitives
          const lastDelta = propDeltas.sort((a, b) => b.timeCreated - a.timeCreated)[0];
          properties[propertyId] = this.extractPrimitiveValue(lastDelta, propertyId);
          break;
        }

        case 'array': {
          // Collect all values as array
          const arrayValues = propDeltas
            .map(delta => this.extractPrimitiveValue(delta, propertyId))
            .filter(value => value !== null);
          properties[propertyId] = arrayValues;
          break;
        }

        case 'reference': {
          // For references, include the target IDs
          const refValues = propDeltas
            .map(delta => this.extractReferenceValue(delta, propertyId))
            .filter(value => value !== null);
          properties[propertyId] = refValues;
          break;
        }

        default:
          properties[propertyId] = propDeltas.length;
      }
    }

    return properties;
  }

  /**
   * Extract primitive value from a delta for a given property
   */
  private extractPrimitiveValue(delta: Delta, _propertyId: string): unknown {
    for (const pointer of delta.pointers) {
      if (pointer.localContext === 'value') {
        return pointer.target;
      }
    }
    return null;
  }

  /**
   * Extract reference value (target ID) from a delta for a given property
   */
  private extractReferenceValue(delta: Delta, _propertyId: string): string | null {
    for (const pointer of delta.pointers) {
      if (pointer.localContext === 'value' && typeof pointer.target === 'string') {
        return pointer.target;
      }
    }
    return null;
  }

  /**
   * Apply JSON Logic filter to entity results
   */
  private applyJsonLogicFilter(entityResults: StorageEntityResult[], filter: JsonLogic): StorageEntityResult[] {
    return entityResults.filter(entityResult => {
      try {
        const matches = apply(filter, entityResult.properties);
        return matches;
      } catch (error) {
        debug(`Error applying filter to entity ${entityResult.entityId}:`, error);
        return false;
      }
    });
  }

  /**
   * Check if an entity matches a schema (basic validation)
   */
  private entityMatchesSchema(properties: Record<string, unknown>, schema: ObjectSchema): boolean {
    const requiredProperties = schema.requiredProperties || [];
    
    for (const propertyId of requiredProperties) {
      if (properties[propertyId] === null || properties[propertyId] === undefined) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get query engine statistics
   */
  async getStats() {
    const storageStats = await this.storage.getStats();
    const registeredSchemas = this.schemaRegistry.list().length;
    
    return {
      storage: storageStats,
      registeredSchemas,
      storageType: this.storage.constructor.name
    };
  }
}