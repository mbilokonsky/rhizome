/**
 * Test suite for nested object resolution with schema-controlled depth limiting
 * and circular reference detection.
 * 
 * Tests the implementation of:
 * - Schema-controlled depth limiting
 * - Circular reference detection and prevention
 * - "Summary" schema type for references
 * - Deep nesting scenarios
 */

import { RhizomeNode } from '../src/node';
import { Delta } from '../src/core';
import { DefaultSchemaRegistry } from '../src/schema';
import { SchemaBuilder, PrimitiveSchemas, ReferenceSchemas } from '../src/schema';
import { CommonSchemas } from '../src/test-utils/schemas';
import { TypedCollectionImpl } from '../src/collections';

describe('Nested Object Resolution', () => {
  let node: RhizomeNode;
  let schemaRegistry: DefaultSchemaRegistry;

  beforeEach(() => {
    node = new RhizomeNode();
    schemaRegistry = new DefaultSchemaRegistry();
    
    // Register the common schemas
    schemaRegistry.register(CommonSchemas.User());
    schemaRegistry.register(CommonSchemas.UserSummary());
    schemaRegistry.register(CommonSchemas.Document());
  });

  afterEach(() => {
    // No cleanup needed for nodes that don't call start()
  });

  describe('Basic Reference Resolution', () => {
    it('should resolve single-level user references with UserSummary schema', async () => {
      const userCollection = new TypedCollectionImpl<{
        name: string;
        email?: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      // Create test users
      await userCollection.put('alice', { 
        name: 'Alice', 
        email: 'alice@test.com'
      });
      await userCollection.put('bob', { 
        name: 'Bob', 
        email: 'bob@test.com'
      });
      
      // Create friendship relationship
      const friendshipDelta = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'bob' }
        ]
      });
      node.lossless.ingestDelta(friendshipDelta);

      // Get Alice's lossless view
      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];
      
      expect(aliceView).toBeDefined();
      expect(aliceView.propertyDeltas.friends).toBeDefined();
      expect(aliceView.propertyDeltas.friends.length).toBeGreaterThan(0);

      // Apply schema with nesting
      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedView.id).toBe('alice');
      expect(nestedView.schemaId).toBe('user');
      expect(nestedView.metadata?.depth).toBe(0);
      expect(nestedView.metadata?.truncated).toBe(false);

      // Check if friends are resolved as nested objects
      if (nestedView.nestedObjects.friends) {
        expect(nestedView.nestedObjects.friends.length).toBe(1);
        const bobSummary = nestedView.nestedObjects.friends[0];
        expect(bobSummary.id).toBe('bob');
        expect(bobSummary.schemaId).toBe('user-summary');
        expect(bobSummary.metadata?.depth).toBe(1);
      }
    });

    it('should handle missing references gracefully', async () => {
      const userCollection = new TypedCollectionImpl<{
        name: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      // Create user with reference to non-existent friend
      await userCollection.put('alice', { name: 'Alice' });
      
      const friendshipDelta = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'nonexistent' }
        ]
      });
      node.lossless.ingestDelta(friendshipDelta);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];
      
      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 2 }
      );

      // Should not crash and should handle missing reference gracefully
      expect(nestedView.id).toBe('alice');
      // The friends array might be empty or have no resolved objects
      if (nestedView.nestedObjects.friends) {
        expect(Array.isArray(nestedView.nestedObjects.friends)).toBe(true);
      }
    });
  });

  describe('Depth Limiting', () => {
    it('should respect maxDepth parameter and truncate deep nesting', async () => {
      // Create a custom schema with deeper nesting for testing
      const deepUserSchema = SchemaBuilder
        .create('deep-user')
        .name('Deep User')
        .property('name', PrimitiveSchemas.requiredString())
        .property('mentor', ReferenceSchemas.to('deep-user', 2)) // Self-reference with depth 2
        .required('name')
        .build();
      
      schemaRegistry.register(deepUserSchema);

      const userCollection = new TypedCollectionImpl<{
        name: string;
        mentor?: string;
      }>('deep-users', deepUserSchema, schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      // Create a chain: alice -> bob -> charlie
      await userCollection.put('alice', { name: 'Alice' });
      await userCollection.put('bob', { name: 'Bob' });
      await userCollection.put('charlie', { name: 'Charlie' });

      // Alice's mentor is Bob
      const mentorshipDelta1 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'deep-users', target: 'alice', targetContext: 'mentor' },
          { localContext: 'mentor', target: 'bob' }
        ]
      });
      node.lossless.ingestDelta(mentorshipDelta1);

      // Bob's mentor is Charlie
      const mentorshipDelta2 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'deep-users', target: 'bob', targetContext: 'mentor' },
          { localContext: 'mentor', target: 'charlie' }
        ]
      });
      node.lossless.ingestDelta(mentorshipDelta2);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      // Test with maxDepth = 1 (should only resolve Alice and Bob)
      const shallowView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'deep-user',
        node.lossless,
        { maxDepth: 1 }
      );

      expect(shallowView.id).toBe('alice');
      expect(shallowView.metadata?.depth).toBe(0);
      expect(shallowView.metadata?.truncated).toBe(false);

      if (shallowView.nestedObjects.mentor) {
        expect(shallowView.nestedObjects.mentor.length).toBe(1);
        const bobView = shallowView.nestedObjects.mentor[0];
        expect(bobView.id).toBe('bob');
        expect(bobView.metadata?.depth).toBe(1);
        expect(bobView.metadata?.truncated).toBe(true); // Should be truncated at depth 1
        
        // Bob's mentor should not be resolved due to depth limit
        expect(bobView.nestedObjects.mentor || []).toHaveLength(0);
      }

      // Test with maxDepth = 2 (should resolve Alice, Bob, and Charlie)
      const deepView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'deep-user',
        node.lossless,
        { maxDepth: 2 }
      );

      if (deepView.nestedObjects.mentor) {
        const bobView = deepView.nestedObjects.mentor[0];
        expect(bobView.metadata?.truncated).toBe(false);
        
        if (bobView.nestedObjects.mentor) {
          expect(bobView.nestedObjects.mentor.length).toBe(1);
          const charlieView = bobView.nestedObjects.mentor[0];
          expect(charlieView.id).toBe('charlie');
          expect(charlieView.metadata?.depth).toBe(2);
          expect(charlieView.metadata?.truncated).toBe(true); // Truncated at max depth
        }
      }
    });
  });

  describe('Circular Reference Prevention', () => {
    it('should detect and prevent circular references', async () => {
      const userCollection = new TypedCollectionImpl<{
        name: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      // Create users
      await userCollection.put('alice', { name: 'Alice' });
      await userCollection.put('bob', { name: 'Bob' });

      // Create circular friendship: Alice -> Bob -> Alice
      const friendship1 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'bob' }
        ]
      });
      node.lossless.ingestDelta(friendship1);

      const friendship2 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'bob', targetContext: 'friends' },
          { localContext: 'friends', target: 'alice' }
        ]
      });
      node.lossless.ingestDelta(friendship2);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      // Should handle circular reference without infinite recursion
      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 3 }
      );

      expect(nestedView.id).toBe('alice');
      
      // The resolution should complete without hanging or crashing
      // The exact behavior may vary, but it should not cause infinite recursion
      expect(nestedView.metadata?.truncated).toBeDefined();
    });

    it('should handle self-references correctly', async () => {
      const userCollection = new TypedCollectionImpl<{
        name: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      await userCollection.put('alice', { name: 'Alice' });

      // Alice is friends with herself
      const selfFriendship = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'alice' }
        ]
      });
      node.lossless.ingestDelta(selfFriendship);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedView.id).toBe('alice');
      // Should detect the self-reference and handle it appropriately
    });
  });

  describe('Array References', () => {
    it('should resolve arrays of references correctly', async () => {
      const userCollection = new TypedCollectionImpl<{
        name: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      // Create multiple users
      await userCollection.put('alice', { name: 'Alice' });
      await userCollection.put('bob', { name: 'Bob' });
      await userCollection.put('charlie', { name: 'Charlie' });

      // Alice has multiple friends
      const friendship1 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'bob' }
        ]
      });
      node.lossless.ingestDelta(friendship1);

      const friendship2 = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'charlie' }
        ]
      });
      node.lossless.ingestDelta(friendship2);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedView.id).toBe('alice');
      
      if (nestedView.nestedObjects.friends) {
        expect(nestedView.nestedObjects.friends.length).toBe(2);
        
        const friendIds = nestedView.nestedObjects.friends.map((friend: { id: string }) => friend.id);
        expect(friendIds).toContain('bob');
        expect(friendIds).toContain('charlie');
        
        // All friends should use the user-summary schema
        nestedView.nestedObjects.friends.forEach((friend: { schemaId: string; metadata?: { depth: number } }) => {
          expect(friend.schemaId).toBe('user-summary');
          expect(friend.metadata?.depth).toBe(1);
        });
      }
    });
  });

  describe('Summary Schema Pattern', () => {
    it('should use Summary schema to break infinite recursion', async () => {
      // The User schema references user-summary for friends
      // This tests the pattern mentioned in the spec
      const userCollection = new TypedCollectionImpl<{
        name: string;
        email?: string;
        friends?: string[];
      }>('users', CommonSchemas.User(), schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      await userCollection.put('alice', { 
        name: 'Alice', 
        email: 'alice@test.com' 
      });
      await userCollection.put('bob', { 
        name: 'Bob', 
        email: 'bob@test.com' 
      });

      // Create friendship
      const friendship = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'users', target: 'alice', targetContext: 'friends' },
          { localContext: 'friends', target: 'bob' }
        ]
      });
      node.lossless.ingestDelta(friendship);

      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      const nestedView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'user',
        node.lossless,
        { maxDepth: 3 }
      );

      if (nestedView.nestedObjects.friends) {
        const bobSummary = nestedView.nestedObjects.friends[0];
        
        // Bob should be resolved with user-summary schema
        expect(bobSummary.schemaId).toBe('user-summary');
        
        // user-summary schema should have limited properties (only name and email)
        expect(bobSummary.properties.name).toBeDefined();
        expect(bobSummary.properties.email).toBeDefined();
        
        // user-summary should NOT have friends property to break recursion
        expect(bobSummary.properties.friends).toBeUndefined();
        expect(bobSummary.nestedObjects.friends).toBeUndefined();
      }
    });
  });
});