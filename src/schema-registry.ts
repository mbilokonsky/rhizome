import Debug from 'debug';
import {
  SchemaRegistry,
  ObjectSchema,
  SchemaID,
  SchemaValidationResult,
  SchemaValidationError,
  PropertySchema,
  PrimitiveSchema,
  ReferenceSchema,
  ArraySchema,
  SchemaAppliedView,
  SchemaApplicationOptions
} from './schema';
import { LosslessViewOne } from './lossless';
import { DomainEntityID, PropertyID } from './types';
import { CollapsedDelta } from './lossless';

const debug = Debug('rz:schema-registry');

export class DefaultSchemaRegistry implements SchemaRegistry {
  schemas = new Map<SchemaID, ObjectSchema>();

  register(schema: ObjectSchema): void {
    this.validateSchemaStructure(schema);
    this.schemas.set(schema.id, schema);
    debug(`Registered schema: ${schema.id} (${schema.name})`);
  }

  get(id: SchemaID): ObjectSchema | undefined {
    return this.schemas.get(id);
  }

  list(): ObjectSchema[] {
    return Array.from(this.schemas.values());
  }

  private validateSchemaStructure(schema: ObjectSchema): void {
    if (!schema.id || typeof schema.id !== 'string') {
      throw new Error('Schema must have a valid string id');
    }
    if (!schema.name || typeof schema.name !== 'string') {
      throw new Error('Schema must have a valid string name');
    }
    if (!schema.properties || typeof schema.properties !== 'object') {
      throw new Error('Schema must have properties object');
    }

    // Validate property schemas
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      this.validatePropertySchema(propertySchema, `${schema.id}.${propertyId}`);
    }

    // Validate required properties exist
    if (schema.requiredProperties) {
      for (const required of schema.requiredProperties) {
        if (!(required in schema.properties)) {
          throw new Error(`Required property '${required}' not found in schema '${schema.id}'`);
        }
      }
    }
  }

  private validatePropertySchema(schema: PropertySchema, path: string): void {
    switch (schema.type) {
      case 'primitive':
        this.validatePrimitiveSchema(schema, path);
        break;
      case 'reference':
        this.validateReferenceSchema(schema, path);
        break;
      case 'array':
        this.validateArraySchema(schema, path);
        break;
      default:
        throw new Error(`Unknown schema type at ${path}`);
    }
  }

  private validatePrimitiveSchema(schema: PrimitiveSchema, path: string): void {
    const validTypes = ['string', 'number', 'boolean', 'null'];
    if (!validTypes.includes(schema.primitiveType)) {
      throw new Error(`Invalid primitive type '${schema.primitiveType}' at ${path}`);
    }
  }

  private validateReferenceSchema(schema: ReferenceSchema, path: string): void {
    if (!schema.targetSchema || typeof schema.targetSchema !== 'string') {
      throw new Error(`Reference schema must have valid targetSchema at ${path}`);
    }
    if (schema.maxDepth !== undefined && schema.maxDepth < 0) {
      throw new Error(`Reference maxDepth must be non-negative at ${path}`);
    }
  }

  private validateArraySchema(schema: ArraySchema, path: string): void {
    this.validatePropertySchema(schema.itemSchema, `${path}[]`);
    if (schema.maxItems !== undefined && schema.maxItems < 0) {
      throw new Error(`Array maxItems must be non-negative at ${path}`);
    }
  }

  validate(entityId: DomainEntityID, schemaId: SchemaID, view: LosslessViewOne): SchemaValidationResult {
    const schema = this.get(schemaId);
    if (!schema) {
      return {
        valid: false,
        errors: [{
          property: '',
          message: `Schema '${schemaId}' not found`
        }],
        warnings: []
      };
    }

    const errors: SchemaValidationError[] = [];
    const warnings: SchemaValidationError[] = [];

    // Check required properties
    if (schema.requiredProperties) {
      for (const required of schema.requiredProperties) {
        if (!(required in view.propertyDeltas) || view.propertyDeltas[required].length === 0) {
          errors.push({
            property: required,
            message: `Required property '${required}' is missing or has no deltas`
          });
        }
      }
    }

    // Validate each property in the view
    for (const [propertyId, deltas] of Object.entries(view.propertyDeltas)) {
      const propertySchema = schema.properties[propertyId];
      
      if (!propertySchema) {
        if (schema.additionalProperties === false) {
          warnings.push({
            property: propertyId,
            message: `Property '${propertyId}' not defined in schema and additionalProperties is false`
          });
        }
        continue;
      }

      // Validate each delta for this property
      for (const delta of deltas) {
        const validationResult = this.validateDeltaAgainstPropertySchema(
          delta, 
          propertySchema, 
          propertyId
        );
        errors.push(...validationResult.errors);
        warnings.push(...validationResult.warnings);
      }
    }

    // Validate properties defined in schema but missing from view
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      if (!(propertyId in view.propertyDeltas)) {
        if (propertySchema.required) {
          errors.push({
            property: propertyId,
            message: `Required property '${propertyId}' is missing from view`
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateDeltaAgainstPropertySchema(
    delta: CollapsedDelta,
    schema: PropertySchema,
    propertyId: PropertyID
  ): SchemaValidationResult {
    const errors: SchemaValidationError[] = [];
    const warnings: SchemaValidationError[] = [];

    // Extract the value from the delta
    const valuePointer = delta.pointers.find(p => p[propertyId] !== undefined);
    if (!valuePointer) {
      errors.push({
        property: propertyId,
        message: `Delta does not contain expected property '${propertyId}'`
      });
      return { valid: false, errors, warnings };
    }

    const value = valuePointer[propertyId];

    switch (schema.type) {
      case 'primitive':
        this.validatePrimitiveValue(value, schema, propertyId, errors);
        break;
      case 'reference':
        this.validateReferenceValue(value, schema, propertyId, errors, warnings);
        break;
      case 'array':
        // Arrays are complex - for now just warn that we don't fully validate them
        warnings.push({
          property: propertyId,
          message: `Array validation not fully implemented for property '${propertyId}'`
        });
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validatePrimitiveValue(
    value: unknown,
    schema: PrimitiveSchema,
    propertyId: PropertyID,
    errors: SchemaValidationError[]
  ): void {
    let valid = false;

    switch (schema.primitiveType) {
      case 'string':
        valid = typeof value === 'string';
        break;
      case 'number':
        valid = typeof value === 'number';
        break;
      case 'boolean':
        valid = typeof value === 'boolean';
        break;
      case 'null':
        valid = value === null;
        break;
    }

    if (!valid) {
      errors.push({
        property: propertyId,
        message: `Expected ${schema.primitiveType} but got ${typeof value}`,
        expectedType: schema.primitiveType,
        actualValue: value
      });
    }
  }

  private validateReferenceValue(
    value: unknown,
    schema: ReferenceSchema,
    propertyId: PropertyID,
    errors: SchemaValidationError[],
    warnings: SchemaValidationError[]
  ): void {
    if (typeof value !== 'string') {
      errors.push({
        property: propertyId,
        message: `Reference value must be a string (entity ID), got ${typeof value}`,
        expectedType: 'string (entity ID)',
        actualValue: value
      });
      return;
    }

    // Check if target schema exists
    const targetSchema = this.get(schema.targetSchema);
    if (!targetSchema) {
      warnings.push({
        property: propertyId,
        message: `Target schema '${schema.targetSchema}' not found for reference`
      });
    }
  }

  applySchema(
    view: LosslessViewOne,
    schemaId: SchemaID,
    options: SchemaApplicationOptions = {}
  ): SchemaAppliedView {
    const schema = this.get(schemaId);
    if (!schema) {
      throw new Error(`Schema '${schemaId}' not found`);
    }

    const { includeMetadata = true, strictValidation = false } = options;
    
    const appliedView: SchemaAppliedView = {
      id: view.id,
      schemaId,
      properties: {}
    };

    // Apply schema to each property
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      const deltas = view.propertyDeltas[propertyId] || [];
      const validationResult = this.validate(view.id, schemaId, view);

      appliedView.properties[propertyId] = {
        deltas,
        schema: propertySchema,
        validationResult
      };

      // If strict validation is enabled and there are errors, throw
      if (strictValidation && !validationResult.valid) {
        throw new Error(`Schema validation failed for property '${propertyId}': ${validationResult.errors[0]?.message}`);
      }
    }

    // Add metadata if requested
    if (includeMetadata) {
      appliedView.metadata = {
        appliedAt: Date.now(),
        depth: 1, // TODO: Calculate actual depth in nested references
        truncated: false // TODO: Mark if we hit maxDepth limits
      };
    }

    return appliedView;
  }

  // Helper method to resolve circular dependencies
  getDependencyGraph(): Map<SchemaID, Set<SchemaID>> {
    const dependencies = new Map<SchemaID, Set<SchemaID>>();
    
    for (const schema of this.schemas.values()) {
      const deps = new Set<SchemaID>();
      this.collectSchemaDependencies(schema, deps);
      dependencies.set(schema.id, deps);
    }
    
    return dependencies;
  }

  private collectSchemaDependencies(schema: ObjectSchema, deps: Set<SchemaID>): void {
    for (const propertySchema of Object.values(schema.properties)) {
      this.collectPropertySchemaDependencies(propertySchema, deps);
    }
  }

  private collectPropertySchemaDependencies(schema: PropertySchema, deps: Set<SchemaID>): void {
    switch (schema.type) {
      case 'reference':
        deps.add(schema.targetSchema);
        break;
      case 'array':
        this.collectPropertySchemaDependencies(schema.itemSchema, deps);
        break;
    }
  }

  // Check for circular dependencies
  hasCircularDependencies(): boolean {
    const dependencies = this.getDependencyGraph();
    const visited = new Set<SchemaID>();
    const recursionStack = new Set<SchemaID>();

    for (const schemaId of dependencies.keys()) {
      if (this.hasCircularDependencyDFS(schemaId, dependencies, visited, recursionStack)) {
        return true;
      }
    }

    return false;
  }

  private hasCircularDependencyDFS(
    schemaId: SchemaID,
    dependencies: Map<SchemaID, Set<SchemaID>>,
    visited: Set<SchemaID>,
    recursionStack: Set<SchemaID>
  ): boolean {
    if (recursionStack.has(schemaId)) {
      return true; // Circular dependency found
    }

    if (visited.has(schemaId)) {
      return false; // Already processed
    }

    visited.add(schemaId);
    recursionStack.add(schemaId);

    const deps = dependencies.get(schemaId) || new Set();
    for (const dep of deps) {
      if (this.hasCircularDependencyDFS(dep, dependencies, visited, recursionStack)) {
        return true;
      }
    }

    recursionStack.delete(schemaId);
    return false;
  }
}