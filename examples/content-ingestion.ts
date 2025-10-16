/**
 * Example: Content Ingestion Pipeline
 * 
 * This example demonstrates a complete content ingestion pipeline using the
 * Entity-Transformation-Attribute pattern discussed in the conversation.
 * 
 * Use case: Ingest 5 years of content (blog posts, videos, tweets) and extract:
 * - Entities (the content pieces themselves)
 * - Transformations (what changed or was learned)
 * - Attributes (properties, metadata, extracted features)
 * 
 * This maps to Leo's IdeaRank system with dimensions:
 * - Uniqueness
 * - Cohesion
 * - Learning
 * - Quality
 * - Citations (Trust)
 * - Density
 */

import { StorageFactory } from '../src/storage/factory';
import { DeltaBuilder } from '../src/core/delta-builder';
import { SchemaBuilder, DefaultSchemaRegistry } from '../src/schema';
import { Hyperview } from '../src/views/hyperview';

// === Schemas for Content Analysis ===

const ContentEntitySchema = SchemaBuilder
  .create('content-entity')
  .name('Content Entity')
  .description('A piece of content from any platform')
  .property('type', { type: 'primitive', primitiveType: 'string', required: true })
  .property('title', { type: 'primitive', primitiveType: 'string', required: true })
  .property('content', { type: 'primitive', primitiveType: 'string' })
  .property('url', { type: 'primitive', primitiveType: 'string' })
  .property('platform', { type: 'primitive', primitiveType: 'string', required: true })
  .property('publishedAt', { type: 'primitive', primitiveType: 'number', required: true })
  .property('wordCount', { type: 'primitive', primitiveType: 'number' })
  .required('type', 'title', 'platform', 'publishedAt')
  .build();

const TransformationSchema = SchemaBuilder
  .create('transformation')
  .name('Transformation')
  .description('A change or evolution detected between content pieces')
  .property('fromContent', { type: 'reference', targetSchema: 'content-entity', required: true })
  .property('toContent', { type: 'reference', targetSchema: 'content-entity', required: true })
  .property('transformationType', { type: 'primitive', primitiveType: 'string', required: true })
  .property('description', { type: 'primitive', primitiveType: 'string' })
  .property('detectedAt', { type: 'primitive', primitiveType: 'number', required: true })
  .required('fromContent', 'toContent', 'transformationType', 'detectedAt')
  .build();

const IdeaRankSchema = SchemaBuilder
  .create('idea-rank')
  .name('IdeaRank Score')
  .description('Multi-dimensional quality score for content')
  .property('contentId', { type: 'reference', targetSchema: 'content-entity', required: true })
  .property('uniqueness', { type: 'primitive', primitiveType: 'number' })
  .property('cohesion', { type: 'primitive', primitiveType: 'number' })
  .property('learning', { type: 'primitive', primitiveType: 'number' })
  .property('quality', { type: 'primitive', primitiveType: 'number' })
  .property('citations', { type: 'primitive', primitiveType: 'number' })
  .property('density', { type: 'primitive', primitiveType: 'number' })
  .property('overallScore', { type: 'primitive', primitiveType: 'number' })
  .property('computedAt', { type: 'primitive', primitiveType: 'number', required: true })
  .required('contentId', 'computedAt')
  .build();

// === Helper: Batch Delta Writer ===

class BatchDeltaWriter {
  private storage: any;
  private batchSize: number;
  private batch: any[] = [];
  private totalWritten = 0;

  constructor(storage: any, batchSize = 100) {
    this.storage = storage;
    this.batchSize = batchSize;
  }

  async add(delta: any): Promise<void> {
    this.batch.push(delta);
    
    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    for (const delta of this.batch) {
      await this.storage.storeDelta(delta);
    }

    this.totalWritten += this.batch.length;
    console.log(`  Flushed ${this.batch.length} deltas (total: ${this.totalWritten})`);
    this.batch = [];
  }

  getTotalWritten(): number {
    return this.totalWritten;
  }
}

// === Helper: Create Deltas from Object ===

function createEntityDeltas(
  entityId: string,
  properties: Record<string, any>,
  creator: string,
  host: string
): any[] {
  const deltas = [];
  
  for (const [property, value] of Object.entries(properties)) {
    const delta = new DeltaBuilder(creator, host)
      .setProperty(entityId, property, value)
      .build();
    deltas.push(delta);
  }
  
  return deltas;
}

// === Main Example ===

async function main() {
  console.log('=== Content Ingestion Pipeline ===\n');

  const creator = 'leo';
  const host = 'ingestion-pipeline';

  // === STEP 1: Initialize Storage ===
  console.log('Step 1: Initializing storage...');
  
  const storage = StorageFactory.create({
    type: 'leveldb',
    path: './data/content-ingestion'
  });

  const batchWriter = new BatchDeltaWriter(storage, 50);
  
  console.log('✓ Storage initialized with batch writer\n');

  // === STEP 2: Register Schemas ===
  console.log('Step 2: Registering schemas...');
  
  const schemaRegistry = new DefaultSchemaRegistry();
  schemaRegistry.register(ContentEntitySchema);
  schemaRegistry.register(TransformationSchema);
  schemaRegistry.register(IdeaRankSchema);
  
  console.log(`✓ Registered ${schemaRegistry.list().length} schemas\n`);

  // === STEP 3: Ingest Content Entities ===
  console.log('Step 3: Ingesting content entities...');

  const contentItems = [
    {
      id: 'content:medium-2024-01',
      type: 'blog-post',
      title: 'The Conscious OSI Stack',
      content: 'Exploring how consciousness can be modeled as layers similar to the OSI network model...',
      url: 'https://medium.com/@leo/conscious-osi',
      platform: 'medium',
      publishedAt: new Date('2024-01-15').getTime(),
      wordCount: 2500
    },
    {
      id: 'content:medium-2024-02',
      type: 'blog-post',
      title: 'Time Violence and Accountability',
      content: 'Why tracking time isn\'t enough - we need to track outcomes and actual time saved...',
      url: 'https://medium.com/@leo/time-violence',
      platform: 'medium',
      publishedAt: new Date('2024-02-10').getTime(),
      wordCount: 1800
    },
    {
      id: 'content:youtube-2024-01',
      type: 'video',
      title: 'Building the Bottega 1010',
      content: 'Transcript: Today we\'re discussing the apprentice guild system...',
      url: 'https://youtube.com/watch?v=abc',
      platform: 'youtube',
      publishedAt: new Date('2024-03-05').getTime(),
      wordCount: 3200
    },
    {
      id: 'content:tweet-2024-03-12',
      type: 'tweet',
      title: 'Delta-based consciousness',
      content: 'Consciousness is just constantly deciding which deltas to accept. Identity = delta filter.',
      platform: 'twitter',
      publishedAt: new Date('2024-03-12').getTime(),
      wordCount: 15
    }
  ];

  for (const item of contentItems) {
    const { id, ...properties } = item;
    const deltas = createEntityDeltas(id, properties, creator, host);
    
    for (const delta of deltas) {
      await batchWriter.add(delta);
    }
  }

  await batchWriter.flush();
  console.log(`✓ Ingested ${contentItems.length} content entities\n`);

  // === STEP 4: Extract Transformations ===
  console.log('Step 4: Detecting transformations...');

  // Example: Detect that the tweet builds on the blog post
  const transformation1 = {
    id: 'transformation:001',
    fromContent: 'content:medium-2024-01',
    toContent: 'content:tweet-2024-03-12',
    transformationType: 'refinement',
    description: 'Distilled consciousness OSI concept into delta-acceptance model',
    detectedAt: Date.now()
  };

  const transformation2 = {
    id: 'transformation:002',
    fromContent: 'content:medium-2024-02',
    toContent: 'content:youtube-2024-01',
    transformationType: 'expansion',
    description: 'Expanded time violence concept into full guild system',
    detectedAt: Date.now()
  };

  for (const transformation of [transformation1, transformation2]) {
    const { id, ...properties } = transformation;
    const deltas = createEntityDeltas(id, properties, creator, host);
    
    for (const delta of deltas) {
      await batchWriter.add(delta);
    }
  }

  await batchWriter.flush();
  console.log('✓ Detected and stored 2 transformations\n');

  // === STEP 5: Compute IdeaRank Scores ===
  console.log('Step 5: Computing IdeaRank scores...');

  // Simple scoring algorithm (in practice, this would be much more sophisticated)
  const computeIdeaRank = (content: any) => {
    const baseScore = 0.5;
    
    return {
      id: `idea-rank:${content.id.split(':')[1]}`,
      contentId: content.id,
      // Uniqueness: longer content tends to have more unique ideas
      uniqueness: Math.min(1.0, (content.wordCount || 100) / 3000),
      // Cohesion: placeholder - would analyze topic consistency
      cohesion: baseScore + Math.random() * 0.3,
      // Learning: placeholder - would detect new concepts
      learning: baseScore + Math.random() * 0.3,
      // Quality: placeholder - would analyze writing quality
      quality: baseScore + Math.random() * 0.3,
      // Citations: 0 for now - would count references
      citations: 0.0,
      // Density: ideas per word
      density: Math.min(1.0, 500 / (content.wordCount || 1)),
      overallScore: 0.0, // Computed below
      computedAt: Date.now()
    };
  };

  for (const content of contentItems) {
    const score = computeIdeaRank(content);
    
    // Compute overall score as weighted average
    score.overallScore = (
      score.uniqueness * 0.2 +
      score.cohesion * 0.15 +
      score.learning * 0.2 +
      score.quality * 0.2 +
      score.citations * 0.1 +
      score.density * 0.15
    );

    const { id, ...properties } = score;
    const deltas = createEntityDeltas(id, properties, creator, host);
    
    for (const delta of deltas) {
      await batchWriter.add(delta);
    }
  }

  await batchWriter.flush();
  console.log(`✓ Computed IdeaRank for ${contentItems.length} items\n`);

  // === STEP 6: Query and Display Results ===
  console.log('Step 6: Querying results...');

  // Read back one content item with its score
  const firstContentId = contentItems[0].id;
  const contentDeltas = await storage.getDeltasForEntity(firstContentId);
  
  console.log(`\n${firstContentId}:`);
  console.log(`  Deltas: ${contentDeltas.length}`);
  
  // Extract properties
  const contentProps: Record<string, any> = {};
  for (const delta of contentDeltas) {
    for (const pointer of delta.pointers) {
      if (pointer.localContext !== 'entity' && typeof pointer.target !== 'string') {
        contentProps[pointer.localContext] = pointer.target;
      }
    }
  }
  
  console.log('  Properties:');
  Object.entries(contentProps).forEach(([key, value]) => {
    console.log(`    ${key}: ${value}`);
  });

  // Get the IdeaRank score
  const scoreId = `idea-rank:${firstContentId.split(':')[1]}`;
  const scoreDeltas = await storage.getDeltasForEntity(scoreId);
  
  console.log(`\n${scoreId}:`);
  const scoreProps: Record<string, any> = {};
  for (const delta of scoreDeltas) {
    for (const pointer of delta.pointers) {
      if (pointer.localContext !== 'entity' && typeof pointer.target !== 'string') {
        scoreProps[pointer.localContext] = pointer.target;
      }
    }
  }
  
  console.log('  Scores:');
  Object.entries(scoreProps).forEach(([key, value]) => {
    if (typeof value === 'number') {
      console.log(`    ${key}: ${value.toFixed(3)}`);
    }
  });

  // === STEP 7: Summary ===
  console.log('\n=== Ingestion Summary ===\n');
  console.log(`Total deltas written: ${batchWriter.getTotalWritten()}`);
  console.log(`Content entities: ${contentItems.length}`);
  console.log(`Transformations detected: 2`);
  console.log(`IdeaRank scores computed: ${contentItems.length}`);
  console.log(`Storage: LevelDB at ./data/content-ingestion`);

  console.log('\n=== Pattern: Entity-Transformation-Attribute ===\n');
  console.log('✓ Entities: Content pieces (blog posts, videos, tweets)');
  console.log('✓ Transformations: How ideas evolved between content');
  console.log('✓ Attributes: Properties + computed scores (IdeaRank)');
  console.log('\nAll stored as deltas → Can be queried, filtered, and composed');

  console.log('\n=== Next Steps for Real Implementation ===\n');
  console.log('1. Extract entities from actual content sources');
  console.log('2. Implement proper NLP for transformation detection');
  console.log('3. Build sophisticated IdeaRank computation');
  console.log('4. Add reactor pattern for auto-computing scores on new content');
  console.log('5. Create queries to find highest-ranked content');
  console.log('6. Build temporal analysis (how scores change over time)');
}

// Run the example
main().catch(console.error);

