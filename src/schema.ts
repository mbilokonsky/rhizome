import { DomainEntityID, PropertyID, PropertyTypes } from "./types";
import { LosslessViewOne } from "./lossless";
import { CollapsedDelta } from "./lossless";

// Base schema types
export type SchemaID = string;

// Primitive schema types - these terminate the recursion
export type PrimitiveSchemaType = 'string' | 'number' | 'boolean' | 'null';

export interface PrimitiveSchema {
  type: 'primitive';
  primitiveType: PrimitiveSchemaType;
  required?: boolean;
  default?: PropertyTypes;
}

// Reference schema for linking to other objects
export interface ReferenceSchema {
  type: 'reference';
  targetSchema: SchemaID; // Reference to another schema by ID
  required?: boolean;
  maxDepth?: number; // Prevent infinite recursion
}

// Array schema for collections of values
export interface ArraySchema {
  type: 'array';
  itemSchema: PropertySchema;
  required?: boolean;
  maxItems?: number;
}

// Union type for all property schema types
export type PropertySchema = PrimitiveSchema | ReferenceSchema | ArraySchema;

// Object schema defines the structure of an entity
export interface ObjectSchema {
  id: SchemaID;
  name: string;
  description?: string;
  properties: {
    [propertyId: PropertyID]: PropertySchema;
  };
  requiredProperties?: PropertyID[];
  additionalProperties?: boolean; // Allow properties not in schema
}

// Schema registry manages all schemas
export interface SchemaRegistry {
  schemas: Map<SchemaID, ObjectSchema>;
  register(schema: ObjectSchema): void;
  get(id: SchemaID): ObjectSchema | undefined;
  list(): ObjectSchema[];
  validate(entityId: DomainEntityID, schemaId: SchemaID, view: LosslessViewOne): SchemaValidationResult;
}

// Validation result types
export interface SchemaValidationError {
  property: PropertyID;
  message: string;
  expectedType?: string;
  actualValue?: unknown;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
  warnings: SchemaValidationError[];
}

// Schema application options
export interface SchemaApplicationOptions {
  maxDepth?: number;
  includeMetadata?: boolean;
  strictValidation?: boolean;
}

// Applied schema result - a lossless view filtered through a schema
export interface SchemaAppliedView {
  id: DomainEntityID;
  schemaId: SchemaID;
  properties: {
    [propertyId: PropertyID]: {
      deltas: CollapsedDelta[];
      schema: PropertySchema;
      validationResult: SchemaValidationResult;
    };
  };
  metadata?: {
    appliedAt: number;
    depth: number;
    truncated: boolean;
  };
}

// Schema-based collection interface
export interface TypedCollection<T> {
  schema: ObjectSchema;
  validate(entity: T): SchemaValidationResult;
  apply(view: LosslessViewOne): SchemaAppliedView;
}

// Built-in schema helpers
export const PrimitiveSchemas = {
  string: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'string' }),
  number: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'number' }),
  boolean: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'boolean' }),
  null: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'null' }),
  
  requiredString: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'string', required: true }),
  requiredNumber: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'number', required: true }),
  requiredBoolean: (): PrimitiveSchema => ({ type: 'primitive', primitiveType: 'boolean', required: true }),
} as const;

export const ReferenceSchemas = {
  to: (targetSchema: SchemaID, maxDepth = 3): ReferenceSchema => ({
    type: 'reference',
    targetSchema,
    maxDepth
  }),
  
  required: (targetSchema: SchemaID, maxDepth = 3): ReferenceSchema => ({
    type: 'reference',
    targetSchema,
    maxDepth,
    required: true
  })
} as const;

export const ArraySchemas = {
  of: (itemSchema: PropertySchema, maxItems?: number): ArraySchema => ({
    type: 'array',
    itemSchema,
    maxItems
  }),
  
  required: (itemSchema: PropertySchema, maxItems?: number): ArraySchema => ({
    type: 'array',
    itemSchema,
    maxItems,
    required: true
  })
} as const;

// Schema builder for fluent API
export class SchemaBuilder {
  private schema: Partial<ObjectSchema> = {};
  
  static create(id: SchemaID): SchemaBuilder {
    const builder = new SchemaBuilder();
    builder.schema.id = id;
    builder.schema.properties = {};
    return builder;
  }
  
  name(name: string): SchemaBuilder {
    this.schema.name = name;
    return this;
  }
  
  description(description: string): SchemaBuilder {
    this.schema.description = description;
    return this;
  }
  
  property(propertyId: PropertyID, schema: PropertySchema): SchemaBuilder {
    if (!this.schema.properties) this.schema.properties = {};
    this.schema.properties[propertyId] = schema;
    return this;
  }
  
  required(...propertyIds: PropertyID[]): SchemaBuilder {
    this.schema.requiredProperties = [
      ...(this.schema.requiredProperties || []),
      ...propertyIds
    ];
    return this;
  }
  
  additionalProperties(allowed = true): SchemaBuilder {
    this.schema.additionalProperties = allowed;
    return this;
  }
  
  build(): ObjectSchema {
    if (!this.schema.id || !this.schema.name) {
      throw new Error('Schema must have id and name');
    }
    return this.schema as ObjectSchema;
  }
}

// Common schema patterns
export const CommonSchemas = {
  // User schema with friends references
  User: () => SchemaBuilder
    .create('user')
    .name('User')
    .description('A user entity with profile information')
    .property('name', PrimitiveSchemas.requiredString())
    .property('email', PrimitiveSchemas.string())
    .property('age', PrimitiveSchemas.number())
    .property('active', PrimitiveSchemas.boolean())
    .property('friends', ArraySchemas.of(ReferenceSchemas.to('user-summary', 1)))
    .required('name')
    .build(),
    
  // User summary schema for references to prevent infinite recursion
  UserSummary: () => SchemaBuilder
    .create('user-summary')
    .name('User Summary')
    .description('Abbreviated user information for references')
    .property('name', PrimitiveSchemas.requiredString())
    .property('email', PrimitiveSchemas.string())
    .required('name')
    .additionalProperties(false)
    .build(),
    
  // Document schema
  Document: () => SchemaBuilder
    .create('document')
    .name('Document')
    .description('A document with metadata')
    .property('title', PrimitiveSchemas.requiredString())
    .property('content', PrimitiveSchemas.string())
    .property('author', ReferenceSchemas.required('user-summary'))
    .property('tags', ArraySchemas.of(PrimitiveSchemas.string()))
    .property('created', PrimitiveSchemas.requiredNumber())
    .property('published', PrimitiveSchemas.boolean())
    .required('title', 'author', 'created')
    .build()
} as const;