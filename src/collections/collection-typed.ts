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
import { HyperviewViewOne } from '../views/hyperview';
import { DomainEntityID } from '../core/types';
import { EntityProperties } from '../core/entity';
import { createDelta } from '@src/core';

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
    this.view = new TimestampResolver(this.rhizomeNode.hyperview);
  }

  resolve(id: string): ResolvedViewOne | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.view) throw new Error('view view not initialized');

    const res = this.view.resolve([id]) || {};
    return res[id];
  }

  // Validate an entity against the schema
  validate(entity: T): SchemaValidationResult {
    // Convert entity to a mock hyperview view for validation
    const mockHyperviewView: HyperviewViewOne = {
      id: 'validation-mock',
      referencedAs: [],
      propertyDeltas: {},
    };

    for (const [key, value] of Object.entries(entity)) {
      mockHyperviewView.propertyDeltas[key] = [createDelta('validation', 'validation')
        .addPointer(key, value as string)
        .buildV1(),
      ];
    }

    return this.schemaRegistry.validate('validation-mock', this.schema.id, mockHyperviewView);
  }

  // Apply schema to a hyperview view
  apply(view: HyperviewViewOne): SchemaAppliedView {
    return this.schemaRegistry.applySchema(view, this.schema.id, this.applicationOptions);
  }

  // Get a schema-validated view of an entity
  getValidatedView(entityId: DomainEntityID): SchemaAppliedView | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    
    const hyperviewView = this.rhizomeNode.hyperview.compose([entityId])[entityId];
    if (!hyperviewView) return undefined;

    return this.apply(hyperviewView);
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
    // Validate against schema
    const validationResult = this.validate(properties as T);

    // If strict validation is enabled, throw on validation failure
    if (this.applicationOptions.strictValidation) {
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
      
      const hyperviewView = this.rhizomeNode.hyperview.compose([entityId])[entityId];
      if (!hyperviewView) continue;

      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, hyperviewView);
      
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
    if (!this.rhizomeNode) {
      debug(`No rhizome node connected`)
      return [];
    }
    const hyperviewView = this.rhizomeNode.hyperview.compose(this.getIds());
    if (!hyperviewView) {
      debug(`No hyperview view found`)
      return [];
    }
    debug(`getValidEntities, hyperviewView: ${JSON.stringify(hyperviewView, null, 2)}`)
    debug(`Validating ${this.getIds().length} entities`)
    return this.getIds().filter(entityId => {
      debug(`Validating entity ${entityId}`)
      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, hyperviewView[entityId]);
      debug(`Validation result for entity ${entityId}: ${JSON.stringify(validationResult)}`)
      return validationResult.valid;
    });
  }

  getInvalidEntities(): Array<{ entityId: DomainEntityID; errors: string[] }> {
    if (!this.rhizomeNode) return [];
    
    const invalid: Array<{ entityId: DomainEntityID; errors: string[] }> = [];
    
    for (const entityId of this.getIds()) {
      const hyperviewView = this.rhizomeNode.hyperview.compose([entityId])[entityId];
      if (!hyperviewView) continue;
      
      const validationResult = this.schemaRegistry.validate(entityId, this.schema.id, hyperviewView);
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