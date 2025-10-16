/**
 * Example: Library-First Direct Delta Writing
 * 
 * This example demonstrates how to use Rhizome as a library to write deltas
 * directly to storage, without using the HTTP API or networking layers.
 * 
 * This is the recommended approach for:
 * - Bulk data imports
 * - Content ingestion pipelines
 * - Background processing tasks
 * - Any scenario where HTTP overhead is unnecessary
 */

import { StorageFactory } from '../src/storage/factory';
import { DeltaBuilder } from '../src/core/delta-builder';
import { SchemaBuilder } from '../src/schema';
import { Hyperview } from '../src/views/hyperview';

async function main() {
  console.log('=== Library-First Direct Delta Writing ===\n');

  // === STEP 1: Initialize Storage Directly ===
  console.log('Initializing LevelDB storage...');
  
  const storage = StorageFactory.create({
    type: 'leveldb',
    path: './data/library-example'
  });

  console.log('✓ Storage initialized\n');

  // === STEP 2: Define Schemas (for content entities) ===
  console.log('Creating content schemas...');

  const contentSchema = SchemaBuilder
    .create('content')
    .name('Content')
    .description('A piece of content (blog post, video, tweet, etc.)')
    .property('type', {
      type: 'primitive',
      primitiveType: 'string',
      required: true
    })
    .property('title', {
      type: 'primitive',
      primitiveType: 'string',
      required: true
    })
    .property('url', {
      type: 'primitive',
      primitiveType: 'string'
    })
    .property('content', {
      type: 'primitive',
      primitiveType: 'string'
    })
    .property('publishedAt', {
      type: 'primitive',
      primitiveType: 'number',
      required: true
    })
    .property('platform', {
      type: 'primitive',
      primitiveType: 'string'
    })
    .required('type', 'title', 'publishedAt')
    .build();

  console.log(`✓ Created schema: ${contentSchema.name}`);
  console.log(`  Properties: ${Object.keys(contentSchema.properties).join(', ')}\n`);

  // === STEP 3: Create Deltas for Content Entities ===
  console.log('Creating content deltas...');

  const creator = 'leo';
  const host = 'local';

  // Sample content from different platforms
  const contentItems = [
    {
      id: 'content:medium-post-1',
      type: 'blog-post',
      title: 'Understanding Consciousness in AI Systems',
      url: 'https://medium.com/@leo/consciousness-ai',
      content: 'In this post, we explore the concept of consciousness...',
      publishedAt: new Date('2024-01-15').getTime(),
      platform: 'medium'
    },
    {
      id: 'content:youtube-video-1',
      type: 'video',
      title: 'Building Distributed Systems with Deltas',
      url: 'https://youtube.com/watch?v=xyz',
      content: 'Video transcript: Today we discuss how deltas...',
      publishedAt: new Date('2024-02-20').getTime(),
      platform: 'youtube'
    },
    {
      id: 'content:tweet-1',
      type: 'tweet',
      title: 'Thought on consciousness OSI stack',
      content: 'The seven layers of consciousness map perfectly to OSI model',
      publishedAt: new Date('2024-03-10').getTime(),
      platform: 'twitter'
    }
  ];

  // Convert content items to deltas
  const deltas = [];
  for (const item of contentItems) {
    // Create a delta for each property
    for (const [property, value] of Object.entries(item)) {
      if (property === 'id') continue; // Skip the ID itself
      
      const delta = new DeltaBuilder(creator, host)
        .setProperty(item.id, property, value)
        .build();
      
      deltas.push(delta);
    }
  }

  console.log(`✓ Created ${deltas.length} deltas for ${contentItems.length} content items\n`);

  // === STEP 4: Write Deltas Directly to Storage ===
  console.log('Writing deltas to storage...');

  let writeCount = 0;
  for (const delta of deltas) {
    await storage.storeDelta(delta);
    writeCount++;
  }

  console.log(`✓ Wrote ${writeCount} deltas to LevelDB\n`);

  // === STEP 5: Read Back and Verify ===
  console.log('Reading deltas from storage...');

  // Get all deltas for the first content item
  const firstItemId = contentItems[0].id;
  const retrievedDeltas = await storage.getDeltasForEntity(firstItemId);

  console.log(`✓ Retrieved ${retrievedDeltas.length} deltas for ${firstItemId}`);
  console.log('\nDelta details:');
  for (const delta of retrievedDeltas) {
    for (const pointer of delta.pointers) {
      if (pointer.localContext !== 'entity' && typeof pointer.target !== 'string') {
        console.log(`  ${pointer.localContext}: ${pointer.target}`);
      }
    }
  }
  console.log();

  // === STEP 6: Use Hyperview to Compose Entity State ===
  console.log('Composing entity state with Hyperview...');

  // Create a minimal Rhizome node config just for the hyperview
  const mockNode = {
    config: { peerId: 'library-example', creator },
    deltaStream: {
      subscribeDeltas: () => {},
      publishDelta: () => {}
    }
  };

  const hyperview = new Hyperview(mockNode as any);

  // Ingest all deltas into hyperview
  for (const delta of deltas) {
    hyperview.ingestDelta(delta);
  }

  // Compose the state of all content items
  const entityIds = contentItems.map(item => item.id);
  const composedViews = hyperview.compose(entityIds);

  console.log(`✓ Composed ${Object.keys(composedViews).length} entities\n`);

  // Display composed state
  for (const [entityId, view] of Object.entries(composedViews)) {
    console.log(`\n${entityId}:`);
    const properties = Object.entries(view.propertyDeltas);
    for (const [propName, propDeltas] of properties) {
      const latestDelta = propDeltas[propDeltas.length - 1];
      const value = latestDelta.pointers.find(p => p.localContext === propName)?.target;
      console.log(`  ${propName}: ${value}`);
    }
  }

  console.log('\n=== Performance Stats ===\n');
  console.log(`Total deltas written: ${writeCount}`);
  console.log(`Total entities created: ${contentItems.length}`);
  console.log(`Average deltas per entity: ${(writeCount / contentItems.length).toFixed(1)}`);
  console.log(`Storage type: LevelDB`);
  console.log(`Storage path: ./data/library-example`);

  console.log('\n=== Next Steps ===\n');
  console.log('This example showed basic direct writing. For real-world usage:');
  console.log('1. Add entity relationships (transformations, references)');
  console.log('2. Implement batch writing for better performance');
  console.log('3. Add error handling and transaction support');
  console.log('4. Create indexes for efficient querying');
  console.log('5. Implement schema validation before writing');
  console.log('\nSee examples/content-ingestion.ts for a more complete example.');
}

// Run the example
main().catch(console.error);

