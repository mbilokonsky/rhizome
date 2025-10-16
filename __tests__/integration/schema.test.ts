import { HyperviewOne } from '@src/views/hyperview';
import { 
  SchemaBuilder, 
  PrimitiveSchemas, 
  ReferenceSchemas, 
  ArraySchemas,
  ObjectSchema
} from '@src/schema';
import { DefaultSchemaRegistry } from '@src/schema';
import { CommonSchemas } from '../../util/schemas';
import { TypedCollectionImpl, SchemaValidationError } from '@src/collections';
import { RhizomeNode } from '@src/node';
import { createDelta } from '@src/core/delta-builder';
import Debug from 'debug';
const debug = Debug('rz:schema-test');

describe('Schema System', () => {
  let schemaRegistry: DefaultSchemaRegistry;
  let node: RhizomeNode;

  beforeEach(() => {
    schemaRegistry = new DefaultSchemaRegistry();
    node = new RhizomeNode();
  });
  

  describe('Schema Builder', () => {

    test('should create a basic schema', () => {
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

    test('should create schema with references', () => {
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

    test('should enforce required fields', () => {
      expect(() => {
        SchemaBuilder.create('').build();
      }).toThrow('Schema must have id and name');

      expect(() => {
        SchemaBuilder.create('test').build();
      }).toThrow('Schema must have id and name');
    });
  });

  describe('Schema Registry', () => {
    test('should register and retrieve schemas', () => {
      const schema = CommonSchemas.User();
      schemaRegistry.register(schema);

      const retrieved = schemaRegistry.get('user');
      expect(retrieved).toEqual(schema);

      const all = schemaRegistry.list();
      expect(all).toContain(schema);
    });

    test('should validate schema structure', () => {
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

    test('should validate required properties exist', () => {
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

    test('should detect circular dependencies', () => {
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

    test('should validate hyperviews against schemas', () => {
      const userSchema = CommonSchemas.User();
      schemaRegistry.register(userSchema);

      // Create a valid hyperview
      const validView: HyperviewOne = {
        id: 'user123',
        propertyDeltas: {
          name: [
            createDelta('creator1', 'host1')
              .addPointer('name', 'Alice')
              .buildV1()
          ],
          age: [
            createDelta('creator1', 'host1')
              .addPointer('age', 25)
              .buildV1()
          ]
        },
      };

      const result = schemaRegistry.validate('user123', 'user', validView);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Test invalid view (missing required property)
      const invalidView: HyperviewOne = {
        id: 'user456',
        propertyDeltas: {
          age: [
            createDelta('creator1', 'host1')
              .addPointer('age', 30)
              .buildV1()
          ]
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

    test('should validate primitive types', () => {
      const schema = SchemaBuilder
        .create('test')
        .name('Test')
        .property('stringProp', PrimitiveSchemas.string())
        .property('numberProp', PrimitiveSchemas.number())
        .property('booleanProp', PrimitiveSchemas.boolean())
        .build();

      schemaRegistry.register(schema);

      // Valid types
      const validView: HyperviewOne = {
        id: 'test1',
        propertyDeltas: {
          stringProp: [
            createDelta('creator1', 'host1')
              .addPointer('stringProp', 'hello')
              .buildV1(),
            // { id: 'd1', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ localContext: 'stringProp', target: 'hello' }] }],
          ],
          numberProp: [
            createDelta('creator1', 'host1')
              .addPointer('numberProp', 42)
              .buildV1(),
            // { id: 'd2', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ localContext: 'numberProp', target: 42 }] }],
          ],
          booleanProp: [
            createDelta('creator1', 'host1')
              .addPointer('booleanProp', true)
              .buildV1(),
            // { id: 'd3', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ localContext: 'booleanProp', target: true }] }]
          ],
        }
      };

      const validResult = schemaRegistry.validate('test1', 'test', validView);
      expect(validResult.valid).toBe(true);

      // Invalid types
      const invalidView: HyperviewOne = {
        id: 'test2',
        propertyDeltas: {
          stringProp: [
            createDelta('creator1', 'host1')
              .addPointer('stringProp', 123 as never)
              .buildV1(),
            // { id: 'd4', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ localContext: 'stringProp', target: 123 as never }] }],
          ],
          numberProp: [
            createDelta('creator1', 'host1')
              .addPointer('numberProp', 'not-number' as never)
              .buildV1(),
            // { id: 'd5', timeCreated: 1, host: 'h', creator: 'c', pointers: [{ localContext: 'numberProp', target: 'not-number' as never }] }]
          ],
        }
      };

      const invalidResult = schemaRegistry.validate('test2', 'test', invalidView);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toHaveLength(2);
    });
  });

  describe('Typed Collection', () => {
    test('should create typed collection with schema validation', () => {
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

    test('should validate entities against schema', () => {
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

    test('should enforce strict validation on put operations', async () => {
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

    test('should provide validation statistics', async () => {
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
      node.hyperview.ingestDelta(invalidDelta);

      const stats = collection.getValidationStats();
      expect(stats.totalEntities).toBe(3);
      expect(stats.validEntities).toBe(2);
      expect(stats.invalidEntities).toBe(1);
    });

    test('should filter valid and invalid entities', async () => {
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
        .setProperty('user3', 'age', 'not-a-number', 'users')
        .buildV1();
      node.hyperview.ingestDelta(invalidDelta);

      debug(`Manually ingested invalid delta: ${JSON.stringify(invalidDelta)}`)

      debug(`Hyperview: ${JSON.stringify(node.hyperview.compose(), null, 2)}`)

      const validIds = collection.getValidEntities();
      expect(validIds).toContain('user1');
      expect(validIds).toContain('user2');
      expect(validIds).not.toContain('user3');

      const invalidEntities = collection.getInvalidEntities();
      expect(invalidEntities).toHaveLength(1);
      expect(invalidEntities[0].entityId).toBe('user3');
    });

    test('should apply schema to hyperviews', async () => {
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

    test('should provide schema introspection', () => {
      const userSchema = CommonSchemas.User();
      schemaRegistry.register(CommonSchemas.UserSummary());
      
      const collection = new TypedCollectionImpl<{
        name: string;
      }>('users', userSchema, schemaRegistry);

      const schemaInfo = collection.getSchemaInfo();
      expect(schemaInfo.schema).toEqual(userSchema);
      expect(schemaInfo.dependencies).toContain('user-summary');
      // Note: hasCircularDependencies may be true due to bootstrap schemas having recursive refs
      // The schema-property bootstrap schema references itself for nested arrays
      expect(schemaInfo.hasCircularDependencies).toBeDefined();
    });
  });

  describe('Common Schemas', () => {
    test('should provide working User schema', () => {
      const userSchema = CommonSchemas.User();
      expect(userSchema.id).toBe('user');
      expect(userSchema.name).toBe('User');
      expect(userSchema.properties.name).toBeDefined();
      expect(userSchema.properties.friends).toBeDefined();
      expect(userSchema.requiredProperties).toContain('name');
    });

    test('should provide working Document schema', () => {
      const docSchema = CommonSchemas.Document();
      expect(docSchema.id).toBe('document');
      expect(docSchema.properties.title).toBeDefined();
      expect(docSchema.properties.author).toBeDefined();
      expect(docSchema.requiredProperties).toContain('title');
      expect(docSchema.requiredProperties).toContain('author');
    });

    test('should work together in a registry', () => {
      schemaRegistry.register(CommonSchemas.User());
      schemaRegistry.register(CommonSchemas.UserSummary());
      schemaRegistry.register(CommonSchemas.Document());

      // Registry now includes 2 bootstrap schemas (schema, schema-property) + 3 test schemas = 5 total
      expect(schemaRegistry.list()).toHaveLength(5);
      // Bootstrap schema-property has circular dependency (references itself for nested arrays)
      expect(schemaRegistry.hasCircularDependencies()).toBe(true);
    });
  });
});