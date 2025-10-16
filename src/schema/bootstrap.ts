/**
 * Bootstrap Schema System
 * 
 * This file contains the ONLY hard-coded schema in Rhizome: the Schema schema itself.
 * All other schemas should be dynamic, stored as deltas in the database.
 * 
 * The Schema schema defines how schemas are represented as entities with deltas.
 */

import { ObjectSchema, SchemaBuilder, PrimitiveSchemas, ArraySchemas, ReferenceSchemas } from './schema';
import { DeltaBuilder } from '../core/delta-builder';
import { PropertyID, PropertyTypes } from '../core/types';
import { HyperviewOne } from '../views/hyperview';

/**
 * The bootstrap Schema schema - defines the structure of schemas themselves
 * This is the meta-schema that allows all other schemas to be stored as deltas
 */
export const SCHEMA_SCHEMA_ID = 'schema' as const;

/**
 * Creates the bootstrap schema schema
 * This defines how schemas are represented as entities in the database
 */
export function createBootstrapSchemaSchema(): ObjectSchema {
  return SchemaBuilder
    .create(SCHEMA_SCHEMA_ID)
    .name('Schema')
    .description('Meta-schema defining the structure of schemas themselves')
    // Basic schema identification
    .property('id', { ...PrimitiveSchemas.requiredString() })
    .property('name', { ...PrimitiveSchemas.requiredString() })
    .property('description', { ...PrimitiveSchemas.string() })
    // Schema metadata
    .property('version', { ...PrimitiveSchemas.number(), default: 1 })
    .property('created', { ...PrimitiveSchemas.requiredNumber() })
    .property('updated', { ...PrimitiveSchemas.number() })
    .property('creator', { ...PrimitiveSchemas.string() })
    // Schema behavior
    .property('additionalProperties', { ...PrimitiveSchemas.boolean(), default: false })
    // Properties are stored as separate entities with references
    // Each property is a PropertyDefinition entity
    .property('properties', ArraySchemas.of(
      ReferenceSchemas.to('schema-property', 1)
    ))
    // Required properties list (just the property IDs)
    .property('requiredProperties', ArraySchemas.of(
      PrimitiveSchemas.string()
    ))
    .required('id', 'name', 'created')
    .additionalProperties(false)
    .build();
}

/**
 * Schema for property definitions
 * Each property in a schema is represented by this structure
 */
export const PROPERTY_SCHEMA_ID = 'schema-property' as const;

export function createPropertyDefinitionSchema(): ObjectSchema {
  return SchemaBuilder
    .create(PROPERTY_SCHEMA_ID)
    .name('Schema Property')
    .description('Definition of a single property within a schema')
    // Property identification
    .property('propertyId', { ...PrimitiveSchemas.requiredString() })
    .property('type', { 
      ...PrimitiveSchemas.requiredString(),
      // Should be one of: 'primitive', 'reference', 'array'
    })
    // Primitive type properties
    .property('primitiveType', { ...PrimitiveSchemas.string() }) // 'string', 'number', 'boolean', 'null'
    // Reference type properties
    .property('targetSchema', { ...PrimitiveSchemas.string() }) // Schema ID for references
    .property('maxDepth', { ...PrimitiveSchemas.number() }) // Max depth for nested resolution
    // Array type properties
    .property('itemSchema', ReferenceSchemas.to(PROPERTY_SCHEMA_ID, 1)) // Recursive for nested arrays
    .property('maxItems', { ...PrimitiveSchemas.number() })
    // Common properties
    .property('required', { ...PrimitiveSchemas.boolean(), default: false })
    .property('default', { ...PrimitiveSchemas.string() }) // Stored as JSON string
    .required('propertyId', 'type')
    .additionalProperties(false)
    .build();
}

/**
 * Factory for creating ObjectSchema from deltas
 * This reads a schema entity from the hyperview and constructs an ObjectSchema
 */
export class SchemaFactory {
  /**
   * Construct an ObjectSchema from a hyperview of a schema entity
   */
  static fromHyperview(view: HyperviewOne): ObjectSchema | null {
    try {
      // Extract basic schema properties
      const id = this.getPropertyValue(view, 'id');
      const name = this.getPropertyValue(view, 'name');
      
      if (!id || typeof id !== 'string' || !name || typeof name !== 'string') {
        console.warn('Schema missing required id or name');
        return null;
      }

      const description = this.getPropertyValue(view, 'description') as string | undefined;
      const additionalProperties = this.getPropertyValue(view, 'additionalProperties') as boolean | undefined;
      const requiredProperties = this.getPropertyValue(view, 'requiredProperties') as string[] | undefined;

      // Properties will need to be resolved from references
      // For now, we'll just create a basic schema structure
      // TODO: Implement property resolution from nested entities
      const properties: { [key: PropertyID]: any } = {};

      const schema: ObjectSchema = {
        id,
        name,
        description,
        properties,
        requiredProperties: requiredProperties || [],
        additionalProperties: additionalProperties ?? false
      };

      return schema;
    } catch (error) {
      console.error('Error constructing schema from hyperview:', error);
      return null;
    }
  }

  /**
   * Helper to extract the most recent property value from a hyperview
   */
  private static getPropertyValue(view: HyperviewOne, propertyId: PropertyID): PropertyTypes | PropertyTypes[] | undefined {
    const deltas = view.propertyDeltas[propertyId];
    if (!deltas || deltas.length === 0) {
      return undefined;
    }

    // Get the most recent delta (highest timeCreated)
    const sortedDeltas = [...deltas].sort((a, b) => b.timeCreated - a.timeCreated);
    const latestDelta = sortedDeltas[0];

    // Extract the value from the delta's pointers
    const valuePointer = latestDelta.pointers.find(p => p.localContext === propertyId);
    return valuePointer?.target;
  }

  /**
   * Create deltas to persist a schema to the database
   * Returns an array of deltas that represent the schema
   */
  static toDeltas(schema: ObjectSchema, creator: string, host = 'local'): any[] {
    const deltas: any[] = [];
    const timestamp = Date.now();
    const schemaEntityId = `schema:${schema.id}`;

    // Create delta for basic schema properties
    deltas.push(
      new DeltaBuilder(creator, host)
        .withTimestamp(timestamp)
        .setProperty(schemaEntityId, 'id', schema.id)
        .build()
    );

    deltas.push(
      new DeltaBuilder(creator, host)
        .withTimestamp(timestamp)
        .setProperty(schemaEntityId, 'name', schema.name)
        .build()
    );

    if (schema.description) {
      deltas.push(
        new DeltaBuilder(creator, host)
          .withTimestamp(timestamp)
          .setProperty(schemaEntityId, 'description', schema.description)
          .build()
      );
    }

    deltas.push(
      new DeltaBuilder(creator, host)
        .withTimestamp(timestamp)
        .setProperty(schemaEntityId, 'created', timestamp)
        .build()
    );

    deltas.push(
      new DeltaBuilder(creator, host)
        .withTimestamp(timestamp)
        .setProperty(schemaEntityId, 'creator', creator)
        .build()
    );

    deltas.push(
      new DeltaBuilder(creator, host)
        .withTimestamp(timestamp)
        .setProperty(schemaEntityId, 'additionalProperties', schema.additionalProperties ?? false)
        .build()
    );

    // Store required properties as array
    if (schema.requiredProperties && schema.requiredProperties.length > 0) {
      for (const propId of schema.requiredProperties) {
        deltas.push(
          new DeltaBuilder(creator, host)
            .withTimestamp(timestamp)
            .setProperty(schemaEntityId, 'requiredProperties', propId)
            .build()
        );
      }
    }

    // TODO: Create deltas for property definitions
    // Each property should be its own entity with references back to the schema

    return deltas;
  }
}

/**
 * Initialize the bootstrap schemas
 * These are the only schemas that must be hard-coded
 */
export function initializeBootstrapSchemas() {
  return [
    createBootstrapSchemaSchema(),
    createPropertyDefinitionSchema()
  ];
}

