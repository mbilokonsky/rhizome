import { SchemaBuilder } from '../../src/schema';

/**
 * Common schemas used for testing purposes.
 * These schemas are not part of the main application code
 * and are only used in test files.
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
