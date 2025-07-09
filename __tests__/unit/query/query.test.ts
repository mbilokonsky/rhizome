import { QueryEngine } from '@src/query';
import { Hyperview } from '@src/views';
import { DefaultSchemaRegistry } from '@src/schema';
import { SchemaBuilder, PrimitiveSchemas } from '@src/schema';
import { CommonSchemas } from '../../../util/schemas';
import { createDelta } from '@src/core/delta-builder';
import { RhizomeNode } from '@src/node';

describe('Query Engine', () => {
  let queryEngine: QueryEngine;
  let hyperview: Hyperview;
  let schemaRegistry: DefaultSchemaRegistry;
  let rhizomeNode: RhizomeNode;

  beforeEach(async () => {
    rhizomeNode = new RhizomeNode({
      peerId: 'test-query-node',
      publishBindPort: 4002,
      requestBindPort: 4003
    });
    
    hyperview = rhizomeNode.hyperview;
    schemaRegistry = new DefaultSchemaRegistry();
    queryEngine = new QueryEngine(hyperview, schemaRegistry);

    // Register test schemas
    schemaRegistry.register(CommonSchemas.User());
    schemaRegistry.register(CommonSchemas.UserSummary());
    
    // Create a custom test schema
    const blogPostSchema = SchemaBuilder
      .create('blog-post')
      .name('Blog Post')
      .property('title', PrimitiveSchemas.requiredString())
      .property('content', PrimitiveSchemas.string())
      .property('author', PrimitiveSchemas.requiredString())
      .property('published', PrimitiveSchemas.boolean())
      .property('views', PrimitiveSchemas.number())
      .required('title', 'author')
      .build();
    
    schemaRegistry.register(blogPostSchema);
  });

  afterEach(async () => {
    // No cleanup needed for now
  });

  async function createUser(id: string, name: string, age?: number, email?: string) {
    // Create user entity with name
    const nameDelta = createDelta('test', 'test-host')
      .withId(`delta-${id}-name-${Date.now()}`)
      .withTimestamp(Date.now())
      .setProperty(id, 'name', name, 'user')
      .buildV1();
    hyperview.ingestDelta(nameDelta);

    // Add age if provided
    if (age !== undefined) {
      const ageDelta = createDelta('test', 'test-host')
        .withId(`delta-${id}-age-${Date.now()}`)
        .withTimestamp(Date.now())
        .setProperty(id, 'age', age, 'user')
        .buildV1();
      hyperview.ingestDelta(ageDelta);
    }

    // Add email if provided
    if (email) {
      const emailDelta = createDelta('test', 'test-host')
        .withId(`delta-${id}-email-${Date.now()}`)
        .withTimestamp(Date.now())
        .setProperty(id, 'email', email, 'user')
        .buildV1();
      hyperview.ingestDelta(emailDelta);
    }
  }

  async function createBlogPost(id: string, title: string, author: string, published = false, views = 0) {
    // Title delta
    const titleDelta = createDelta('test', 'test-host')
      .withId(`delta-${id}-title-${Date.now()}`)
      .withTimestamp(Date.now())
      .setProperty(id, 'title', title, 'post')
      .buildV1();
    hyperview.ingestDelta(titleDelta);

    // Author delta
    const authorDelta = createDelta('test', 'test-host')
      .withId(`delta-${id}-author-${Date.now()}`)
      .withTimestamp(Date.now())
      .setProperty(id, 'author', author, 'post')
      .buildV1();
    hyperview.ingestDelta(authorDelta);

    // Published delta
    const publishedDelta = createDelta('test', 'test-host')
      .withId(`delta-${id}-published-${Date.now()}`)
      .withTimestamp(Date.now())
      .setProperty(id, 'published', published, 'post')
      .buildV1();
    hyperview.ingestDelta(publishedDelta);

    // Views delta
    const viewsDelta = createDelta('test', 'test-host')
      .withId(`delta-${id}-views-${Date.now()}`)
      .withTimestamp(Date.now())
      .setProperty(id, 'views', views, 'post')
      .buildV1();
    hyperview.ingestDelta(viewsDelta);
  }

  describe('Basic Query Operations', () => {
    test('can query all entities of a schema type', async () => {
      // Create test users
      await createUser('user1', 'Alice', 25, 'alice@example.com');
      await createUser('user2', 'Bob', 30);
      await createUser('user3', 'Charlie', 35, 'charlie@example.com');

      const result = await queryEngine.query('user');
      
      expect(result.totalFound).toBe(3);
      expect(result.limited).toBe(false);
      expect(Object.keys(result.entities)).toHaveLength(3);
      expect(result.entities['user1']).toBeDefined();
      expect(result.entities['user2']).toBeDefined();
      expect(result.entities['user3']).toBeDefined();
    });

    test('can query a single entity by ID', async () => {
      await createUser('user1', 'Alice', 25, 'alice@example.com');
      
      const result = await queryEngine.queryOne('user', 'user1');
      
      expect(result).toBeDefined();
      expect(result?.id).toBe('user1');
      expect(result?.propertyDeltas.name).toBeDefined();
      expect(result?.propertyDeltas.age).toBeDefined();
      expect(result?.propertyDeltas.email).toBeDefined();
    });

    test('returns null for non-existent entity', async () => {
      const result = await queryEngine.queryOne('user', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('JSON Logic Filtering', () => {
    beforeEach(async () => {
      // Create test data
      await createUser('user1', 'Alice', 25, 'alice@example.com');
      await createUser('user2', 'Bob', 30, 'bob@example.com');
      await createUser('user3', 'Charlie', 35, 'charlie@example.com');
      await createUser('user4', 'Diana', 20);
    });

    test('can filter by primitive property values', async () => {
      // Find users older than 28
      const result = await queryEngine.query('user', {
        '>': [{ 'var': 'age' }, 28]
      });

      expect(result.totalFound).toBe(2);
      expect(result.entities['user2']).toBeDefined(); // Bob, 30
      expect(result.entities['user3']).toBeDefined(); // Charlie, 35
      expect(result.entities['user1']).toBeUndefined(); // Alice, 25
      expect(result.entities['user4']).toBeUndefined(); // Diana, 20
    });

    test('can filter by string properties', async () => {
      // Find users with name starting with 'A' - using substring check instead of startsWith
      const result = await queryEngine.query('user', {
        'in': ['A', { 'var': 'name' }]
      });

      expect(result.totalFound).toBe(1);
      expect(result.entities['user1']).toBeDefined(); // Alice
    });

    test('can filter by null/missing properties', async () => {
      // Find users without email
      const result = await queryEngine.query('user', {
        '==': [{ 'var': 'email' }, null]
      });

      expect(result.totalFound).toBe(1);
      expect(result.entities['user4']).toBeDefined(); // Diana has no email
    });

    test('can use complex logic expressions', async () => {
      // Find users who are (older than 30) OR (younger than 25 AND have email)
      const result = await queryEngine.query('user', {
        'or': [
          { '>': [{ 'var': 'age' }, 30] },
          {
            'and': [
              { '<': [{ 'var': 'age' }, 25] },
              { '!=': [{ 'var': 'email' }, null] }
            ]
          }
        ]
      });

      expect(result.totalFound).toBe(1);
      expect(result.entities['user3']).toBeDefined(); // Charlie, 35 (older than 30)
      // Diana is younger than 25 but has no email
      // Alice is 25, not younger than 25
    });
  });

  describe('Blog Post Queries', () => {
    beforeEach(async () => {
      await createBlogPost('post1', 'Introduction to Rhizome', 'alice', true, 150);
      await createBlogPost('post2', 'Advanced Queries', 'bob', true, 75);
      await createBlogPost('post3', 'Draft Post', 'alice', false, 0);
      await createBlogPost('post4', 'Popular Post', 'charlie', true, 1000);
    });

    test('can filter published posts', async () => {
      const result = await queryEngine.query('blog-post', {
        '==': [{ 'var': 'published' }, true]
      });

      expect(result.totalFound).toBe(3);
      expect(result.entities['post1']).toBeDefined();
      expect(result.entities['post2']).toBeDefined();
      expect(result.entities['post4']).toBeDefined();
      expect(result.entities['post3']).toBeUndefined(); // Draft
    });

    test('can filter by author', async () => {
      const result = await queryEngine.query('blog-post', {
        '==': [{ 'var': 'author' }, 'alice']
      });

      expect(result.totalFound).toBe(2);
      expect(result.entities['post1']).toBeDefined();
      expect(result.entities['post3']).toBeDefined();
    });

    test('can filter by view count ranges', async () => {
      // Posts with more than 100 views
      const result = await queryEngine.query('blog-post', {
        '>': [{ 'var': 'views' }, 100]
      });

      expect(result.totalFound).toBe(2);
      expect(result.entities['post1']).toBeDefined(); // 150 views
      expect(result.entities['post4']).toBeDefined(); // 1000 views
    });
  });

  describe('Query Options', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 10; i++) {
        await createUser(`user${i}`, `User${i}`, 20 + i);
      }
    });

    test('can limit query results', async () => {
      const result = await queryEngine.query('user', undefined, { maxResults: 5 });

      expect(result.totalFound).toBe(10);
      expect(result.limited).toBe(true);
      expect(Object.keys(result.entities)).toHaveLength(5);
    });

    test('respects delta filters', async () => {
      const result = await queryEngine.query('user', undefined, {
        deltaFilter: (delta) => delta.creator === 'test'
      });

      expect(result.totalFound).toBe(10);
      expect(result.limited).toBe(false);
    });
  });

  describe('Statistics', () => {
    test('provides query engine statistics', async () => {
      await createUser('user1', 'Alice', 25);
      await createBlogPost('post1', 'Test Post', 'alice', true, 50);

      const stats = queryEngine.getStats();

      expect(stats.totalEntities).toBe(2);
      expect(stats.registeredSchemas).toBeGreaterThan(0);
      expect(stats.schemasById['user']).toBe(1);
      expect(stats.schemasById['blog-post']).toBe(1);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid schema IDs gracefully', async () => {
      const result = await queryEngine.query('nonexistent-schema');
      expect(result.totalFound).toBe(0);
      expect(Object.keys(result.entities)).toHaveLength(0);
    });

    test('rejects invalid JSON Logic operators', async () => {
      await createUser('user1', 'Alice', 25);
      
      // Should throw an error for invalid operator
      await expect(
        queryEngine.query('user', {
          'invalid-operator': [{ 'var': 'age' }, 25]
        })
      ).rejects.toThrow('Invalid query operator: invalid-operator');
    });

    test('handles valid JSON Logic expressions with runtime errors', async () => {
      await createUser('user1', 'Alice', 25);
      
      // This is a valid operator but will cause a runtime error due to type mismatch
      const result = await queryEngine.query('user', {
        '>': [{ 'var': 'name' }, 25] // Can't compare string and number with >
      });

      // Should still return a result but log the error
      expect(result).toBeDefined();
      expect(result.totalFound).toBe(0); // No matches due to the error
    });
  });
});
