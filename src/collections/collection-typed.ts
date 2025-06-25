import Debug from 'debug';
import { Collection } from '../collections/collection-abstract';
import { ResolvedTimestampedViewOne as ResolvedViewOne } from '../views/resolvers/timestamp-resolvers';
import { TimestampResolver } from '../views/resolvers/timestamp-resolvers'
import { 
  ObjectSchema, 
  SchemaValidationResult, 
  SchemaAppliedView, 
  TypedCollection,
  SchemaApplicationOptions
} from '../schema/schema';
import { DefaultSchemaRegistry } from '../schema/schema-registry';
import { LosslessViewOne } from '../views/lossless';
import { DomainEntityID, PropertyTypes } from '../core/types';
import { EntityProperties } from '../core/entity';

const debug = Debug('rz:typed-collection');

export class SchemaValidationError extends Error {
  constructor(message: string, public validationResult: SchemaValidationResult) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

export class TypedCollectionImpl<T extends Record<string, unknown>> 
  extends Collection<TimestampResolver> 
  implements TypedCollection<T> {
  
  schema: ObjectSchema;
  private schemaRegistry: DefaultSchemaRegistry;
  private applicationOptions: SchemaApplicationOptions;

  constructor(
    name: string, 
    schema: ObjectSchema, 
    schemaRegistry: DefaultSchemaRegistry,
    options: SchemaApplicationOptions = {}
  ) {
    super(name);
    this.schema = schema;
    this.schemaRegistry = schemaRegistry;
    this.applicationOptions = {
      maxDepth: 3,
      includeMetadata: true,
      strictValidation: false,
      ...options
    };

    // Register the schema if not already registered
    if (!this.schemaRegistry.get(schema.id)) {
      this.schemaRegistry.register(schema);
    }

    debug(`Created typed collection '${name}' with schema '${schema.id}'`);
  }

  initializeView(): void {
    if (!this.rhizomeNode) throw new Error('not connected to rhizome');
    this.lossy = new TimestampResolver(this.rhizomeNode.lossless);
  }

  resolve(id: string): ResolvedViewOne | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.lossy) throw new Error('lossy view not initialized');

    const res = this.lossy.resolve([id]) || {};
    return res[id];
  }

  // Validate an entity against the schema
  validate(entity: T): SchemaValidationResult {
    // Convert entity to a mock lossless view for validation
    const mockLosslessView: LosslessViewOne = {
      id: 'validation-mock',
      referencedAs: [],
      propertyDeltas: {},
    };

    // Create mock deltas for each property
    for (const [key, value] of Object.entries(entity)) {
      if (value !== undefined) {
        mockLosslessView.propertyDeltas[key] = [{
          id: 'mock-delta',
          timeCreated: Date.now(),
          host: 'validation',
          creator: 'validation',
          pointers: [{ [key]: value as PropertyTypes }]
        }];
      }
    }

    return this.schemaRegistry.validate('validation-mock', this.schema.id, mockLosslessView);
  }

  // Apply schema to a lossless view
  apply(view: LosslessViewOne): SchemaAppliedView {
    return this.schemaRegistry.applySchema(view, this.schema.id, this.applicationOptions);
  }

  // Get a schema-validated view of an entity
  getValidatedView(entityId: DomainEntityID): SchemaAppliedView | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    
    const losslessView = this.rhizomeNode.lossless.compose([entityId])[entityId];
    if (!losslessView) return undefined;

    return this.apply(losslessView);
  }

  // Get all entities in this collection with schema validation
  getAllValidatedViews(): SchemaAppliedView[] {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    
    const entityIds = this.getIds();
    const views: SchemaAppliedView[] = [];

    for (const entityId of entityIds) {
      const view = this.getValidatedView(entityId);
      if (view) {
        views.push(view);
      }
    }

    return views;
  }

  // Override put to include schema validation
  async put(
    entityId: DomainEntityID | undefined,
    properties: EntityProperties,
  ): Promise<ResolvedViewOne> {
    // Validate against schema if strict validation is enabled
    if (this.applicationOptions.strictValidation) {
      const validationResult = this.validate(properties as T);
      if (!validationResult.valid) {
        throw new SchemaValidationError(
          `Schema validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`,
          validationResult
        );
      }
    }

    // Call parent put method
    const result = await super.put(entityId, properties);

    // Log validation warnings if any
    const validationResult = this.validate(properties as T);
    if (validationResult.warnings.length > 0) {
      debug(`Validation warnings for entity ${entityId}:`, validationResult.warnings);
    }

    return result;
  }

  // Get validation statistics for the collection
  getValidationStats(): {
    totalEntities: number;
    validEntities: number;
    invalidEntities: number;
    entitiesWithWarnings: number;
    commonErrors: Map<string, number>;
  } {
    const entityIds = this.getIds();
    const stats = {
      totalEntities: entityIds.length,
      validEntities: 0,
      invalidEntities: 0,
      entitiesWithWarnings: 0,
      commonErrors: new Map<string, number>()
    };

    for (const entityId of entityIds) {
      if (!this.rhizomeNode) continue;
      
      const losslessView = this.rhizomeNode.lossless.compose([entityId])[entityId];
      if (!losslessView) continue;

      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, losslessView);
      
      if (validationResult.valid) {
        stats.validEntities++;
      } else {
        stats.invalidEntities++;
      }

      if (validationResult.warnings.length > 0) {
        stats.entitiesWithWarnings++;
      }

      // Count common errors
      for (const error of validationResult.errors) {
        const count = stats.commonErrors.get(error.message) || 0;
        stats.commonErrors.set(error.message, count + 1);
      }
    }

    return stats;
  }

  // Filter entities by schema validation status
  getValidEntities(): DomainEntityID[] {
    if (!this.rhizomeNode) return [];
    
    return this.getIds().filter(entityId => {
      const losslessView = this.rhizomeNode!.lossless.compose([entityId])[entityId];
      if (!losslessView) return false;
      
      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, losslessView);
      return validationResult.valid;
    });
  }

  getInvalidEntities(): Array<{ entityId: DomainEntityID; errors: string[] }> {
    if (!this.rhizomeNode) return [];
    
    const invalid: Array<{ entityId: DomainEntityID; errors: string[] }> = [];
    
    for (const entityId of this.getIds()) {
      const losslessView = this.rhizomeNode.lossless.compose([entityId])[entityId];
      if (!losslessView) continue;
      
      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, losslessView);
      if (!validationResult.valid) {
        invalid.push({
          entityId,
          errors: validationResult.errors.map(e => e.message)
        });
      }
    }
    
    return invalid;
  }

  // Schema introspection
  getSchemaInfo(): {
    schema: ObjectSchema;
    dependencies: string[];
    hasCircularDependencies: boolean;
  } {
    const dependencies = this.schemaRegistry.getDependencyGraph().get(this.schema.id) || new Set();
    
    return {
      schema: this.schema,
      dependencies: Array.from(dependencies),
      hasCircularDependencies: this.schemaRegistry.hasCircularDependencies()
    };
  }
}