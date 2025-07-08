import jsonLogic from 'json-logic-js';
const { apply, is_logic } = jsonLogic;
import Debug from 'debug';
import { SchemaRegistry, SchemaID, ObjectSchema } from '../schema/schema';
import { Lossless, LosslessViewMany, LosslessViewOne, valueFromDelta } from '../views/lossless';
import { DomainEntityID } from '../core/types';
import { Delta, DeltaFilter } from '../core/delta';

const debug = Debug('rz:query');

// List of valid JSON Logic operators
const VALID_OPERATORS = new Set([
  '==', '===', '!=', '!==', '>', '>=', '<', '<=', '!', '!!',
  'and', 'or', 'if', '?:', '??', '!!', '!', '!!', '!!', '!',
  'var', 'missing', 'missing_some', 'in', 'cat', 'log', 'method', 'merge',
  '+', '-', '*', '/', '%', 'min', 'max', 'map', 'reduce', 'filter', 'all', 'some', 'none'
]);

class InvalidQueryOperatorError extends Error {
  constructor(operator: string) {
    super(`Invalid query operator: ${operator}`);
    this.name = 'InvalidQueryOperatorError';
  }
}

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
  /**
   * Validate JSON Logic operators in a filter
   * @throws {InvalidQueryOperatorError} If an invalid operator is found
   */
  private validateJsonLogicOperators(logic: unknown): void {
    if (!logic || typeof logic !== 'object') {
      return;
    }

    const logicObj = logic as Record<string, unknown>;
    const operator = Object.keys(logicObj)[0];
    
    // Check if this is an operator
    if (is_logic(logic) && operator && !VALID_OPERATORS.has(operator)) {
      throw new InvalidQueryOperatorError(operator);
    }

    // Recursively check nested logic
    for (const value of Object.values(logicObj)) {
      if (Array.isArray(value)) {
        value.forEach(item => this.validateJsonLogicOperators(item));
      } else if (value && typeof value === 'object') {
        this.validateJsonLogicOperators(value);
      }
    }
  }

  async query(
    schemaId: SchemaID, 
    filter?: JsonLogic, 
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    debug(`Querying schema ${schemaId} with filter:`, filter);
    
    // Validate filter operators if provided
    if (filter) {
      try {
        this.validateJsonLogicOperators(filter);
      } catch (error) {
        if (error instanceof InvalidQueryOperatorError) {
          debug(`Invalid query operator: ${error.message}`);
          throw error; // Re-throw to let the caller handle it
        }
        throw error;
      }
    }

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

      // Check if entity has deltas for all required property
      const hasRequiredProperties = requiredProperties.every(propertyId => 
        entity.properties.has(propertyId)
      );

      if (hasRequiredProperties) {
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
    let hasFilterErrors = false;
    const filterErrors: string[] = [];

    for (const [entityId, view] of Object.entries(views)) {
      try {
        // Convert lossless view to queryable object using schema
        const queryableObject = this.losslessViewToQueryableObject(view, schema);
        
        // Apply JSON Logic filter
        const matches = apply(filter, queryableObject);
        
        if (matches) {
          filteredViews[entityId] = view;
          debug(`Entity ${entityId} matches filter`);
        } else {
          debug(`Entity ${entityId} does not match filter`);
        }
      } catch (error) {
        hasFilterErrors = true;
        const errorMsg = `Error applying filter to entity ${entityId}: ${error instanceof Error ? error.message : String(error)}`;
        filterErrors.push(errorMsg);
        debug(errorMsg, error);
        // Continue processing other entities
      }
    }

    // If we had any filter errors, log them as a warning
    if (hasFilterErrors) {
      console.warn(`Encountered ${filterErrors.length} filter errors. First error: ${filterErrors[0]}`);
      debug('All filter errors:', filterErrors);
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
          const deltasSorted = deltas.sort((a, b) => b.timeCreated - a.timeCreated);
          for (const delta of deltasSorted) {
            const primitiveValue = this.extractPrimitiveValue(delta, propertyId);
            if (primitiveValue !== null) {
              obj[propertyId] = primitiveValue;
            }
          }
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
            .map(delta => this.extractPrimitiveValue(delta, propertyId))
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
  private extractPrimitiveValue(delta: Delta, propertyId: string): unknown {
    return valueFromDelta(propertyId, delta);
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