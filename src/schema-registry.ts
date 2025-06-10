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
  SchemaAppliedViewWithNesting,
  SchemaApplicationOptions,
  ResolutionContext
} from './schema';
import { LosslessViewOne, Lossless } from './lossless';
import { DomainEntityID, PropertyID, PropertyTypes } from './types';
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

    const { includeMetadata = true, strictValidation = false, maxDepth: _maxDepth = 3 } = options;
    
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
        depth: 1,
        truncated: false
      };
    }

    return appliedView;
  }

  /**
   * Apply schema with nested object resolution
   * Resolves references to other entities according to schema specifications
   */
  applySchemaWithNesting(
    view: LosslessViewOne,
    schemaId: SchemaID,
    losslessView: Lossless,
    options: SchemaApplicationOptions = {}
  ): SchemaAppliedViewWithNesting {
    const { maxDepth = 3, includeMetadata = true, strictValidation = false } = options;
    const resolutionContext = new ResolutionContext(maxDepth);
    
    return this.resolveNestedView(
      view,
      schemaId,
      losslessView,
      resolutionContext,
      { includeMetadata, strictValidation }
    );
  }

  private resolveNestedView(
    view: LosslessViewOne,
    schemaId: SchemaID,
    losslessView: Lossless,
    context: ResolutionContext,
    options: { includeMetadata: boolean; strictValidation: boolean }
  ): SchemaAppliedViewWithNesting {
    const schema = this.get(schemaId);
    if (!schema) {
      throw new Error(`Schema '${schemaId}' not found`);
    }

    // Check for circular reference
    if (context.hasVisited(view.id, schemaId)) {
      return this.createTruncatedView(view.id, schemaId, context.currentDepth, true);
    }

    // Check depth limit
    if (context.currentDepth >= context.maxDepth) {
      return this.createTruncatedView(view.id, schemaId, context.currentDepth, true);
    }

    // Mark this entity/schema combination as visited
    context.visit(view.id, schemaId);

    const appliedView: SchemaAppliedViewWithNesting = {
      id: view.id,
      schemaId,
      properties: {},
      nestedObjects: {}
    };

    // Validate the view once
    const overallValidationResult = this.validate(view.id, schemaId, view);

    // Process each property
    for (const [propertyId, propertySchema] of Object.entries(schema.properties)) {
      const deltas = view.propertyDeltas[propertyId] || [];

      appliedView.properties[propertyId] = {
        deltas,
        schema: propertySchema,
        validationResult: overallValidationResult
      };

      // Handle reference resolution
      if (propertySchema.type === 'reference') {
        const referenceSchema = propertySchema as ReferenceSchema;
        const nestedViews = this.resolveReferenceProperty(
          deltas,
          referenceSchema,
          losslessView,
          context.withDepth(context.currentDepth + 1),
          options,
          view.id
        );
        if (nestedViews.length > 0) {
          appliedView.nestedObjects[propertyId] = nestedViews;
        }
      } else if (propertySchema.type === 'array' && propertySchema.itemSchema?.type === 'reference') {
        const arraySchema = propertySchema as ArraySchema;
        const referenceSchema = arraySchema.itemSchema as ReferenceSchema;
        const nestedViews = this.resolveReferenceProperty(
          deltas,
          referenceSchema,
          losslessView,
          context.withDepth(context.currentDepth + 1),
          options,
          view.id
        );
        if (nestedViews.length > 0) {
          appliedView.nestedObjects[propertyId] = nestedViews;
        }
      }

      // Validation error handling
      if (options.strictValidation && !overallValidationResult.valid) {
        throw new Error(`Schema validation failed for property '${propertyId}': ${overallValidationResult.errors[0]?.message}`);
      }
    }

    // Add metadata
    if (options.includeMetadata) {
      appliedView.metadata = {
        appliedAt: Date.now(),
        depth: context.currentDepth,
        truncated: context.currentDepth >= context.maxDepth
      };
    }

    // Mark as unvisited when leaving this path
    context.unvisit(view.id, schemaId);

    return appliedView;
  }

  private resolveReferenceProperty(
    deltas: CollapsedDelta[],
    referenceSchema: ReferenceSchema,
    losslessView: Lossless,
    context: ResolutionContext,
    options: { includeMetadata: boolean; strictValidation: boolean },
    parentEntityId: string
  ): SchemaAppliedViewWithNesting[] {
    const resolvedViews: SchemaAppliedViewWithNesting[] = [];
    const referenceDepthLimit = referenceSchema.maxDepth || context.maxDepth;

    // Check if we're at the reference's specific depth limit
    if (context.currentDepth >= referenceDepthLimit) {
      return [];
    }

    // Create composite objects from deltas - one per delta
    for (const delta of deltas) {
      try {
        const compositeObject = this.createCompositeObjectFromDelta(
          delta,
          parentEntityId,
          referenceSchema.targetSchema,
          losslessView,
          context,
          options
        );
        if (compositeObject) {
          resolvedViews.push(compositeObject);
        } else {
          // Fall back to original logic for single entity references
          const referenceIds = this.extractReferenceIdsFromDelta(delta, parentEntityId);
          for (const referenceId of referenceIds) {
            try {
              // Get the referenced entity's lossless view
              const referencedViews = losslessView.view([referenceId]);
              const referencedView = referencedViews[referenceId];
              
              if (referencedView) {
                // Recursively resolve the referenced entity with its target schema
                const nestedView = this.resolveNestedView(
                  referencedView,
                  referenceSchema.targetSchema,
                  losslessView,
                  context,
                  options
                );
                resolvedViews.push(nestedView);
              }
            } catch (error) {
              // Handle resolution errors gracefully
              console.warn(`Failed to resolve reference ${referenceId}:`, error);
            }
          }
        }
      } catch (error) {
        // Handle resolution errors gracefully
        console.warn(`Failed to resolve composite object from delta ${delta.id}:`, error);
      }
    }

    return resolvedViews;
  }

  private createCompositeObjectFromDelta(
    delta: CollapsedDelta,
    parentEntityId: string,
    targetSchema: SchemaID,
    losslessView: Lossless,
    context: ResolutionContext,
    options: { includeMetadata: boolean; strictValidation: boolean }
  ): SchemaAppliedViewWithNesting | null {
    // Group pointers by localContext, excluding the parent pointer
    const pointersByContext: { [localContext: string]: PropertyTypes[] } = {};
    let entityReferenceCount = 0;
    let scalarCount = 0;
    
    for (const pointer of delta.pointers) {
      for (const [localContext, target] of Object.entries(pointer)) {
        // Skip the pointer that references the parent entity (the "up" pointer)
        if (typeof target === 'string' && target === parentEntityId) {
          continue;
        }
        
        if (!pointersByContext[localContext]) {
          pointersByContext[localContext] = [];
        }
        pointersByContext[localContext].push(target);
        
        // Count entity references vs scalars
        if (typeof target === 'string') {
          const referencedViews = losslessView.view([target]);
          if (referencedViews[target]) {
            entityReferenceCount++;
          } else {
            scalarCount++;
          }
        } else {
          scalarCount++;
        }
      }
    }
    
    // If no non-parent pointers found, return null
    if (Object.keys(pointersByContext).length === 0) {
      return null;
    }
    
    // Only create composite objects for deltas with multiple entity references or mixed entity/scalar
    // Single entity reference should use the original behavior
    if (entityReferenceCount === 1 && scalarCount === 0) {
      return null; // Let the original logic handle single entity references
    }
    
    // Create the composite object
    const nestedObjects: { [propertyId: string]: SchemaAppliedViewWithNesting[] } = {};
    const scalarProperties: { [key: string]: PropertyTypes | PropertyTypes[] } = {};
    
    for (const [localContext, targets] of Object.entries(pointersByContext)) {
      if (targets.length === 1) {
        const target = targets[0];
        if (typeof target === 'string') {
          // Try to resolve as entity reference
          try {
            const referencedViews = losslessView.view([target]);
            const referencedView = referencedViews[target];
            
            if (referencedView) {
              // Recursively resolve the referenced entity
              const nestedView = this.resolveNestedView(
                referencedView,
                targetSchema,
                losslessView,
                context,
                options
              );
              nestedObjects[localContext] = [nestedView];
            } else {
              // Not a valid entity reference, treat as scalar
              scalarProperties[localContext] = target;
            }
          } catch (_error) {
            // Failed to resolve as entity, treat as scalar
            scalarProperties[localContext] = target;
          }
        } else {
          // Scalar value
          scalarProperties[localContext] = target;
        }
      } else {
        // Multiple values for same localContext - create array
        const resolvedArray: (PropertyTypes | SchemaAppliedViewWithNesting)[] = [];
        
        for (const target of targets) {
          if (typeof target === 'string') {
            // Try to resolve as entity reference
            try {
              const referencedViews = losslessView.view([target]);
              const referencedView = referencedViews[target];
              
              if (referencedView) {
                const nestedView = this.resolveNestedView(
                  referencedView,
                  targetSchema,
                  losslessView,
                  context,
                  options
                );
                resolvedArray.push(nestedView);
              } else {
                // Not a valid entity reference, treat as scalar
                resolvedArray.push(target);
              }
            } catch (_error) {
              // Failed to resolve as entity, treat as scalar
              resolvedArray.push(target);
            }
          } else {
            // Scalar value
            resolvedArray.push(target);
          }
        }
        
        // Separate entities from scalars in the array
        const entities: SchemaAppliedViewWithNesting[] = [];
        const scalars: PropertyTypes[] = [];
        
        for (const item of resolvedArray) {
          if (typeof item === 'object' && item !== null && 'schemaId' in item) {
            entities.push(item as SchemaAppliedViewWithNesting);
          } else {
            scalars.push(item as PropertyTypes);
          }
        }
        
        if (entities.length > 0) {
          nestedObjects[localContext] = entities;
        }
        if (scalars.length > 0) {
          scalarProperties[localContext] = scalars.length === 1 ? scalars[0] : scalars;
        }
      }
    }
    
    // Create a synthetic composite object
    const compositeObject = {
      id: `composite-${delta.id}`, // Synthetic ID for the composite object
      schemaId: targetSchema,
      properties: scalarProperties, // Custom field for scalar values
      nestedObjects,
      metadata: {
        appliedAt: Date.now(),
        depth: context.currentDepth,
        truncated: false
      }
    };
    
    return compositeObject as unknown as SchemaAppliedViewWithNesting;
  }

  private extractReferenceIdsFromDelta(delta: CollapsedDelta, parentEntityId: string): string[] {
    const referenceIds = new Set<string>();
    
    // For each pointer in the delta, collect all values that aren't the parent entity
    for (const pointer of delta.pointers) {
      for (const [_key, value] of Object.entries(pointer)) {
        if (typeof value === 'string' && value !== parentEntityId) {
          // This is a potential reference - any string value that's not the parent
          referenceIds.add(value);
        } else if (typeof value === 'object' && value !== null) {
          // For object values, collect the entity IDs (keys) that aren't the parent
          for (const entityId of Object.keys(value)) {
            if (typeof entityId === 'string' && entityId !== parentEntityId) {
              referenceIds.add(entityId);
            }
          }
        }
      }
    }
    
    return Array.from(referenceIds);
  }

  private extractReferenceIds(deltas: CollapsedDelta[], parentEntityId: string): string[] {
    const referenceIds = new Set<string>();
    
    for (const delta of deltas) {
      // For each pointer in the delta, collect all values that aren't the parent entity
      for (const pointer of delta.pointers) {
        for (const [_key, value] of Object.entries(pointer)) {
          if (typeof value === 'string' && value !== parentEntityId) {
            // This is a potential reference - any string value that's not the parent
            referenceIds.add(value);
          } else if (typeof value === 'object' && value !== null) {
            // For object values, collect the entity IDs (keys) that aren't the parent
            for (const entityId of Object.keys(value)) {
              if (typeof entityId === 'string' && entityId !== parentEntityId) {
                referenceIds.add(entityId);
              }
            }
          }
        }
      }
    }
    
    return Array.from(referenceIds);
  }

  private createTruncatedView(
    entityId: string,
    schemaId: SchemaID,
    depth: number,
    truncated: boolean
  ): SchemaAppliedViewWithNesting {
    return {
      id: entityId,
      schemaId,
      properties: {},
      nestedObjects: {},
      metadata: {
        appliedAt: Date.now(),
        depth,
        truncated
      }
    };
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