/**
 * Example: Dynamic Schema Creation and Persistence
 * 
 * This example demonstrates how to create schemas dynamically and persist them
 * to the database as deltas, rather than hard-coding them in application code.
 */

import { RhizomeNode } from '../src/node';
import { SchemaBuilder } from '../src/schema';
import { DeltaBuilder } from '../src/core/delta-builder';

async function main() {
  console.log('=== Dynamic Schema Example ===\n');

  // Create a Rhizome node with LevelDB storage
  const node = new RhizomeNode({
    peerId: 'schema-example',
    creator: 'example-user',
    httpEnable: false, // Disable HTTP for this example
    storage: {
      type: 'memory', // Use memory for simplicity
      path: './data/schema-example'
    }
  });

  await node.start();

  console.log('✓ Node started');
  console.log(`✓ Bootstrap schemas loaded: ${node.schemaRegistry.list().map(s => s.id).join(', ')}\n`);

  // === STEP 1: Create a schema dynamically ===
  console.log('Creating a Blog Post schema...');
  
  const blogPostSchema = SchemaBuilder
    .create('blog-post')
    .name('Blog Post')
    .description('A blog post with title, content, and metadata')
    .property('title', { 
      type: 'primitive', 
      primitiveType: 'string', 
      required: true 
    })
    .property('content', { 
      type: 'primitive', 
      primitiveType: 'string',
      required: true
    })
    .property('published', { 
      type: 'primitive', 
      primitiveType: 'boolean' 
    })
    .property('publishedAt', { 
      type: 'primitive', 
      primitiveType: 'number' 
    })
    .property('tags', {
      type: 'array',
      itemSchema: { type: 'primitive', primitiveType: 'string' }
    })
    .property('author', {
      type: 'reference',
      targetSchema: 'user',
      required: true,
      maxDepth: 1
    })
    .required('title', 'content', 'author')
    .additionalProperties(false)
    .build();

  console.log(`✓ Created schema: ${blogPostSchema.name} (${blogPostSchema.id})`);
  console.log(`  Properties: ${Object.keys(blogPostSchema.properties).join(', ')}`);
  console.log(`  Required: ${blogPostSchema.requiredProperties?.join(', ')}\n`);

  // === STEP 2: Persist the schema to storage ===
  console.log('Persisting schema to storage...');
  
  // Register the schema in the registry
  node.schemaRegistry.register(blogPostSchema);
  
  // Persist it to storage as deltas
  await node.schemaRegistry.persistSchema(blogPostSchema, 'example-user');
  
  console.log('✓ Schema persisted to storage as deltas');
  console.log(`✓ Total schemas in registry: ${node.schemaRegistry.list().length}\n`);

  // === STEP 3: Create data using the schema ===
  console.log('Creating blog post data...');
  
  const blogPostId = 'blog-post:1';
  const authorId = 'user:alice';
  
  // Create author first
  const authorDeltas = [
    new DeltaBuilder('example-user', 'local')
      .setProperty(authorId, 'name', 'Alice Smith')
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(authorId, 'email', 'alice@example.com')
      .build()
  ];

  // Create blog post
  const blogPostDeltas = [
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'title', 'Getting Started with Rhizome')
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'content', 'Rhizome is a distributed database built on deltas...')
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'published', true)
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'publishedAt', Date.now())
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'author', authorId)
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'tags', 'database')
      .build(),
    new DeltaBuilder('example-user', 'local')
      .setProperty(blogPostId, 'tags', 'distributed')
      .build()
  ];

  // Publish all deltas
  for (const delta of [...authorDeltas, ...blogPostDeltas]) {
    node.deltaStream.publishDelta(delta);
  }

  console.log('✓ Blog post data created and published\n');

  // Wait a moment for deltas to propagate
  await new Promise(resolve => setTimeout(resolve, 100));

  // === STEP 4: Query and validate the data ===
  console.log('Querying blog post data...');
  
  const blogPostView = node.hyperview.compose([blogPostId])[blogPostId];
  
  if (blogPostView) {
    console.log('✓ Blog post retrieved from hyperview');
    console.log(`  Title: ${blogPostView.propertyDeltas.title?.[0]?.pointers.find(p => p.localContext === 'title')?.target}`);
    console.log(`  Published: ${blogPostView.propertyDeltas.published?.[0]?.pointers.find(p => p.localContext === 'published')?.target}`);
    console.log(`  Tags: ${blogPostView.propertyDeltas.tags?.map(d => d.pointers.find(p => p.localContext === 'tags')?.target).join(', ')}\n`);
    
    // Validate against schema
    const validationResult = node.schemaRegistry.validate(blogPostId, 'blog-post', blogPostView);
    
    if (validationResult.valid) {
      console.log('✓ Blog post validates against schema');
    } else {
      console.log('✗ Validation errors:');
      validationResult.errors.forEach(err => {
        console.log(`  - ${err.property}: ${err.message}`);
      });
    }
  }

  // === STEP 5: Demonstrate schema evolution ===
  console.log('\n=== Schema Evolution ===\n');
  console.log('In Rhizome, schemas can evolve over time:');
  console.log('1. Create a new version of the schema with additional properties');
  console.log('2. Persist the new schema version to storage');
  console.log('3. Old data continues to work (backward compatible)');
  console.log('4. New data can use the new schema properties');
  console.log('5. Schema versioning is tracked via the "version" property\n');

  // Cleanup
  await node.stop();
  console.log('✓ Node stopped');
}

// Run the example
main().catch(console.error);

