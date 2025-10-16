import { SchemaBuilder } from '../src/schema';

/**
 * ⚠️  TEST-ONLY SCHEMAS ⚠️
 * 
 * These schemas are ONLY for testing purposes and should NOT be used in production code.
 * 
 * In the Rhizome architecture, schemas should be:
 * 1. Created dynamically using SchemaBuilder
 * 2. Persisted to storage as deltas via SchemaRegistry.persistSchema()
 * 3. Loaded from storage on node startup
 * 
 * The ONLY hard-coded schemas in production should be the bootstrap schemas:
 * - schema (meta-schema for defining schemas)
 * - schema-property (defines schema property structure)
 * 
 * These test schemas exist to validate the schema system itself and provide
 * examples for test cases. Do not import these into application code.
 */
export const CommonSchemas = {
  // User schema with friends references
  User: () => SchemaBuilder
    .create('user')
    .name('User')
    .description('A user entity with profile information')
    .property('name', { type: 'primitive', primitiveType: 'string', required: true })
    .property('email', { type: 'primitive', primitiveType: 'string' })
    .property('age', { type: 'primitive', primitiveType: 'number' })
    .property('active', { type: 'primitive', primitiveType: 'boolean' })
    .property('friends', { 
      type: 'array', 
      itemSchema: { 
        type: 'reference', 
        targetSchema: 'user-summary',
        maxDepth: 2 
      } 
    })
    .required('name')
    .build(),
    
  // User summary schema for references to prevent infinite recursion
  UserSummary: () => SchemaBuilder
    .create('user-summary')
    .name('User Summary')
    .description('Abbreviated user information for references')
    .property('name', { type: 'primitive', primitiveType: 'string', required: true })
    .property('email', { type: 'primitive', primitiveType: 'string' })
    .build(),
    
  // Document schema
  Document: () => SchemaBuilder
    .create('document')
    .name('Document')
    .description('A document with title, content, and author')
    .property('title', { type: 'primitive', primitiveType: 'string', required: true })
    .property('content', { type: 'primitive', primitiveType: 'string' })
    .property('author', { 
      type: 'reference', 
      targetSchema: 'user-summary',
      maxDepth: 1,
      required: true
    })
    .property('tags', {
      type: 'array',
      itemSchema: { type: 'primitive', primitiveType: 'string' }
    })
    .property('created', { type: 'primitive', primitiveType: 'number', required: true })
    .property('published', { type: 'primitive', primitiveType: 'boolean' })
    .required('title', 'author', 'created')
    .build()
} as const;
