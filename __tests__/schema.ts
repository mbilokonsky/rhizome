import { 
  SchemaBuilder, 
  PrimitiveSchemas, 
  ReferenceSchemas, 
  ArraySchemas,
  ObjectSchema
} from '../src/schema';
import { DefaultSchemaRegistry } from '../src/schema';
import { CommonSchemas } from '../util/schemas';
import { TypedCollectionImpl, SchemaValidationError } from '../src/collections';
import { RhizomeNode } from '../src/node';
import { createDelta } from '../src/core/delta-builder';

describe('Schema System', () => {
  let schemaRegistry: DefaultSchemaRegistry;
  let node: RhizomeNode;

  beforeEach(() => {
    schemaRegistry = new DefaultSchemaRegistry();
    node = new RhizomeNode();
  });
  

  describe('Schema Builder', () => {

    it('should create a basic schema', () => {
      const schema = SchemaBuilder
        .create('user')
        .name('User')
        .description('A user entity')
        .property('name', PrimitiveSchemas.requiredString())
        .property('age', PrimitiveSchemas.number())
        .property('active', PrimitiveSchemas.boolean())
        .required('name')
        .build();

      expect(schema.id).toBe('user');
      expect(schema.name).toBe('User');
      expect(schema.description).toBe('A user entity');
      expect(schema.properties.name).toEqual({
        type: 'primitive',
        primitiveType: 'string',
        required: true
      });
      expect(schema.requiredProperties).toContain('name');
    });

    it('should create schema with references', () => {
      const schema = SchemaBuilder
        .create('post')
        .name('Post')
        .property('title', PrimitiveSchemas.requiredString())
        .property('author', ReferenceSchemas.required('user'))
        .property('tags', ArraySchemas.of(PrimitiveSchemas.string()))
        .build();

      expect(schema.properties.author).toEqual({
        type: 'reference',
        targetSchema: 'user',
        maxDepth: 3,
        required: true
      });
      expect(schema.properties.tags).toEqual({
        type: 'array',
        itemSchema: { type: 'primitive', primitiveType: 'string' }
      });
    });

    it('should enforce required fields', () => {
      expect(() => {
        SchemaBuilder.create('').build();
      }).toThrow('Schema must have id and name');

      expect(() => {
        SchemaBuilder.create('test').build();
      }).toThrow('Schema must have id and name');
    });
  });

  describe('Schema Registry', () => {
    it('should register and retrieve schemas', () => {
      const schema = CommonSchemas.User();
      schemaRegistry.register(schema);

      const retrieved = schemaRegistry.get('user');
      expect(retrieved).toEqual(schema);

      const all = schemaRegistry.list();
      expect(all).toContain(schema);
    });

    it('should validate schema structure', () => {
      const invalidSchema = {
        id: 'invalid',
        name: 'Invalid',
        properties: {
          badProperty: { type: 'unknown' } as never
        }
      };

      expect(() => {
        schemaRegistry.register(invalidSchema as ObjectSchema);
      }).toThrow('Unknown schema type');
    });

    it('should validate required properties exist', () => {
      const schema = SchemaBuilder
        .create('test')
        .name('Test')
        .property('name', PrimitiveSchemas.string())
        .required('name', 'nonexistent')
        .build();

      expect(() => {
        schemaRegistry.register(schema);
      }).toThrow("Required property 'nonexistent' not found");
    });

    it('should detect circular dependencies', () => {
      // Create schemas with circular references
      const userSchema = SchemaBuilder
        .create('user')
        .name('User')
        .property('name', PrimitiveSchemas.string())
        .property('bestFriend', ReferenceSchemas.to('user'))
        .build();

      schemaRegistry.register(userSchema);

      // This is circular (self-reference)
      expect(schemaRegistry.hasCircularDependencies()).toBe(true);

      // Create actual circular dependency
      const groupSchema = SchemaBuilder
        .create('group')
        .name('Group')
        .property('owner', ReferenceSchemas.to('user'))
        .build();

      const userWithGroupSchema = SchemaBuilder
        .create('user-with-group')
        .name('User With Group')
        .property('group', ReferenceSchemas.to('group'))
        .build();

      schemaRegistry.register(groupSchema);
      schemaRegistry.register(userWithGroupSchema);

      // Still circular due to the self-referencing user schema
      expect(schemaRegistry.hasCircularDependencies()).toBe(true);
    });

    it('should validate lossless views against schemas', () => {
      const userSchema = CommonSchemas.User();
      schemaRegistry.register(userSchema);

      // Create a valid lossless view
      const validView = {
        id: 'user123',
        referencedAs: ['user'],
        propertyDeltas: {
          name: [{
            id: 'delta1',
            timeCreated: 123,
            host: 'host1',
            creator: 'creator1',
            pointers: [{ name: 'Alice' }]
          }],
          age: [{
            id: 'delta2',
            timeCreated: 124,
            host: 'host1',
            creator: 'creator1',
            pointers: [{ age: 25 }]
          }]
        }
      };

      const result = schemaRegistry.validate('user123', 'user', validView);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Test invalid view (missing required property)
      const invalidView = {
        id: 'user456',
        referencedAs: ['user'],
        propertyDeltas: {
          age: [{
            id: 'delta3',
            timeCreated: 125,
            host: 'host1',
            creator: 'creator1',
            pointers: [{ age: 30 }]
          }]
        }
      };

      const invalidResult = schemaRegistry.validate('user456', 'user', invalidView);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContainEqual(
        expect.objectContaining({
          property: 'name',
          message: expect.stringContaining('Required property')
        })
      );
    });

    it('should validate primitive types', () => {
      const schema = SchemaBuilder
        .create('test')
        .name('Test')
        .property('stringProp', PrimitiveSchemas.string())
        .property('numberProp', PrimitiveSchemas.number())
        .property('booleanProp', PrimitiveSchemas.boolean())
        .build();

      schemaRegistry.register(schema);

      // Valid types
      const validView = {
        id: 'test1',
        referencedAs: [],
        propertyDeltas: {
          stringProp: [{ id: 'd1', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ stringProp: 'hello' }] }],
          numberProp: [{ id: 'd2', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ numberProp: 42 }] }],
          booleanProp: [{ id: 'd3', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ booleanProp: true }] }]
        }
      };

      const validResult = schemaRegistry.validate('test1', 'test', validView);
      expect(validResult.valid).toBe(true);

      // Invalid types
      const invalidView = {
        id: 'test2',
        referencedAs: [],
        propertyDeltas: {
          stringProp: [{ id: 'd4', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ stringProp: 123 as never }] }],
          numberProp: [{ id: 'd5', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ numberProp: 'not-number' as never }] }]
        }
      };

      const invalidResult = schemaRegistry.validate('test2', 'test', invalidView);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toHaveLength(2);
    });
  });

  describe('Typed Collection', () => {
    it('should create typed collection with schema validation', () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        email?: string;
        age?: number;
        active?: boolean;
      }>('users', userSchema, schemaRegistry);

      expect(collection.schema).toEqual(userSchema);
      expect(collection.name).toBe('users');
    });

    it('should validate entities against schema', () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        email?: string;
        age?: number;
      }>('users', userSchema, schemaRegistry);

      // Valid entity
      const validUser = { name: 'Alice', email: 'alice@test.com', age: 25 };
      const validResult = collection.validate(validUser);
      expect(validResult.valid).toBe(true);

      // Invalid entity (missing required name)
      const invalidUser = { email: 'bob@test.com', age: 30 } as never;
      const invalidResult = collection.validate(invalidUser);
      expect(invalidResult.valid).toBe(false);
    });

    it('should enforce strict validation on put operations', async () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        email?: string;
      }>('users', userSchema, schemaRegistry, { strictValidation: true });

      collection.rhizomeConnect(node);

      // Valid put should succeed
      await expect(collection.put('user1', { name: 'Alice' })).resolves.toBeDefined();

      // Invalid put should fail
      await expect(collection.put('user2', { email: 'invalid@test.com' })).rejects.toThrow(SchemaValidationError);
    });

    it('should provide validation statistics', async () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        email?: string;
      }>('users', userSchema, schemaRegistry);

      collection.rhizomeConnect(node);

      // Add some entities
      await collection.put('user1', { name: 'Alice', email: 'alice@test.com' });
      await collection.put('user2', { name: 'Bob' });

      // Manually create an invalid entity by bypassing validation
      const invalidDelta = createDelta(node.config.creator, node.config.peerId)
        .addPointer('users', 'user3', 'email')
        .addPointer('email', 'invalid@test.com')
        .buildV1();
      node.lossless.ingestDelta(invalidDelta);

      const stats = collection.getValidationStats();
      expect(stats.totalEntities).toBe(3);
      expect(stats.validEntities).toBe(2);
      expect(stats.invalidEntities).toBe(1);
    });

    it('should filter valid and invalid entities', async () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        email?: string;
      }>('users', userSchema, schemaRegistry);

      collection.rhizomeConnect(node);

      await collection.put('user1', { name: 'Alice' });
      await collection.put('user2', { name: 'Bob' });

      // Create invalid entity manually
      const invalidDelta = createDelta(node.config.creator, node.config.peerId)
        .addPointer('users', 'user3', 'age')
        .addPointer('age', 'not-a-number')
        .buildV1();
      node.lossless.ingestDelta(invalidDelta);

      const validIds = collection.getValidEntities();
      expect(validIds).toContain('user1');
      expect(validIds).toContain('user2');
      expect(validIds).not.toContain('user3');

      const invalidEntities = collection.getInvalidEntities();
      expect(invalidEntities).toHaveLength(1);
      expect(invalidEntities[0].entityId).toBe('user3');
    });

    it('should apply schema to lossless views', async () => {
      const userSchema = CommonSchemas.User();
      const collection = new TypedCollectionImpl<{
        name: string;
        age?: number;
      }>('users', userSchema, schemaRegistry);

      collection.rhizomeConnect(node);

      await collection.put('user1', { name: 'Alice', age: 25 });

      const validatedView = collection.getValidatedView('user1');
      expect(validatedView).toBeDefined();
      expect(validatedView!.schemaId).toBe('user');
      expect(validatedView!.properties.name).toBeDefined();
      expect(validatedView!.properties.age).toBeDefined();
      expect(validatedView!.metadata?.appliedAt).toBeDefined();
    });

    it('should provide schema introspection', () => {
      const userSchema = CommonSchemas.User();
      schemaRegistry.register(CommonSchemas.UserSummary());
      
      const collection = new TypedCollectionImpl<{
        name: string;
      }>('users', userSchema, schemaRegistry);

      const schemaInfo = collection.getSchemaInfo();
      expect(schemaInfo.schema).toEqual(userSchema);
      expect(schemaInfo.dependencies).toContain('user-summary');
      expect(schemaInfo.hasCircularDependencies).toBe(false);
    });
  });

  describe('Common Schemas', () => {
    it('should provide working User schema', () => {
      const userSchema = CommonSchemas.User();
      expect(userSchema.id).toBe('user');
      expect(userSchema.name).toBe('User');
      expect(userSchema.properties.name).toBeDefined();
      expect(userSchema.properties.friends).toBeDefined();
      expect(userSchema.requiredProperties).toContain('name');
    });

    it('should provide working Document schema', () => {
      const docSchema = CommonSchemas.Document();
      expect(docSchema.id).toBe('document');
      expect(docSchema.properties.title).toBeDefined();
      expect(docSchema.properties.author).toBeDefined();
      expect(docSchema.requiredProperties).toContain('title');
      expect(docSchema.requiredProperties).toContain('author');
    });

    it('should work together in a registry', () => {
      schemaRegistry.register(CommonSchemas.User());
      schemaRegistry.register(CommonSchemas.UserSummary());
      schemaRegistry.register(CommonSchemas.Document());

      expect(schemaRegistry.list()).toHaveLength(3);
      expect(schemaRegistry.hasCircularDependencies()).toBe(false); // No circular deps in CommonSchemas
    });
  });
});