/**
 * Performance tests for nested object resolution with large object graphs
 * 
 * Tests performance characteristics of:
 * - Large networks of interconnected entities
 * - Deep nesting chains
 * - Wide arrays of references  
 * - Circular reference handling at scale
 */

import { RhizomeNode } from '../src/node';
import { Delta } from '../src/core';
import { DefaultSchemaRegistry } from '../src/schema';
import { SchemaBuilder, PrimitiveSchemas, ReferenceSchemas, ArraySchemas } from '../src/schema';
import { TypedCollectionImpl } from '../src/collections';

describe('Nested Object Resolution Performance', () => {
  let node: RhizomeNode;
  let schemaRegistry: DefaultSchemaRegistry;

  beforeEach(() => {
    node = new RhizomeNode();
    schemaRegistry = new DefaultSchemaRegistry();
  });

  describe('Large Network Performance', () => {
    it('should handle large networks of interconnected users efficiently', async () => {
      // Create a schema for users with multiple relationship types
      const networkUserSchema = SchemaBuilder
        .create('network-user')
        .name('Network User')
        .property('name', PrimitiveSchemas.requiredString())
        .property('friends', ArraySchemas.of(ReferenceSchemas.to('network-user-summary', 2)))
        .property('followers', ArraySchemas.of(ReferenceSchemas.to('network-user-summary', 2)))
        .property('mentor', ReferenceSchemas.to('network-user-summary', 2))
        .required('name')
        .build();

      const networkUserSummarySchema = SchemaBuilder
        .create('network-user-summary')
        .name('Network User Summary')
        .property('name', PrimitiveSchemas.requiredString())
        .required('name')
        .additionalProperties(false)
        .build();

      schemaRegistry.register(networkUserSchema);
      schemaRegistry.register(networkUserSummarySchema);

      const userCollection = new TypedCollectionImpl<{
        name: string;
        friends?: string[];
        followers?: string[];
        mentor?: string;
      }>('users', networkUserSchema, schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      const startSetup = performance.now();

      // Create 100 users
      const userCount = 100;
      const userIds: string[] = [];
      for (let i = 0; i < userCount; i++) {
        const userId = `user${i}`;
        userIds.push(userId);
        await userCollection.put(userId, { name: `User ${i}` });
      }

      // Create a network where each user has 5-10 friends, 10-20 followers, and 1 mentor
      for (let i = 0; i < userCount; i++) {
        const userId = userIds[i];
        
        // Add friends (5-10 random connections)
        const friendCount = 5 + Math.floor(Math.random() * 6);
        for (let j = 0; j < friendCount; j++) {
          const friendIndex = Math.floor(Math.random() * userCount);
          if (friendIndex !== i) {
            const friendId = userIds[friendIndex];
            const friendshipDelta = new Delta({
              creator: node.config.creator,
              host: node.config.peerId,
              pointers: [
                { localContext: 'users', target: userId, targetContext: 'friends' },
                { localContext: 'friends', target: friendId }
              ]
            });
            node.lossless.ingestDelta(friendshipDelta);
          }
        }

        // Add followers (10-20 random connections)
        const followerCount = 10 + Math.floor(Math.random() * 11);
        for (let j = 0; j < followerCount; j++) {
          const followerIndex = Math.floor(Math.random() * userCount);
          if (followerIndex !== i) {
            const followerId = userIds[followerIndex];
            const followDelta = new Delta({
              creator: node.config.creator,
              host: node.config.peerId,
              pointers: [
                { localContext: 'users', target: userId, targetContext: 'followers' },
                { localContext: 'followers', target: followerId }
              ]
            });
            node.lossless.ingestDelta(followDelta);
          }
        }

        // Add mentor (one per user, creating a hierarchy)
        if (i > 0) {
          const mentorIndex = Math.floor(i / 2); // Create a tree-like mentor structure
          const mentorId = userIds[mentorIndex];
          const mentorshipDelta = new Delta({
            creator: node.config.creator,
            host: node.config.peerId,
            pointers: [
              { localContext: 'users', target: userId, targetContext: 'mentor' },
              { localContext: 'mentor', target: mentorId }
            ]
          });
          node.lossless.ingestDelta(mentorshipDelta);
        }
      }

      const setupTime = performance.now() - startSetup;
      console.log(`Setup time for ${userCount} users with relationships: ${setupTime.toFixed(2)}ms`);

      // Test resolution performance for a user with many connections
      const testUserId = userIds[50]; // Pick a user in the middle
      const userViews = node.lossless.view([testUserId]);
      const userView = userViews[testUserId];

      const startResolution = performance.now();
      
      const nestedView = schemaRegistry.applySchemaWithNesting(
        userView,
        'network-user',
        node.lossless,
        { maxDepth: 2 }
      );

      const resolutionTime = performance.now() - startResolution;
      console.log(`Resolution time for user with many connections: ${resolutionTime.toFixed(2)}ms`);

      // Verify the resolution worked
      expect(nestedView.id).toBe(testUserId);
      expect(nestedView.schemaId).toBe('network-user');
      
      // Performance assertions (adjust thresholds based on acceptable performance)
      expect(setupTime).toBeLessThan(5000); // Setup should take less than 5 seconds
      expect(resolutionTime).toBeLessThan(1000); // Resolution should take less than 1 second

      // Verify we got some nested objects
      const totalNestedObjects = Object.values(nestedView.nestedObjects).reduce(
        (total, arr) => total + (arr?.length || 0), 0
      );
      console.log('Total nested objects resolved:', totalNestedObjects);
      
      // The test user should have friends, followers, and possibly a mentor
      expect(Object.keys(nestedView.nestedObjects).length).toBeGreaterThan(0);
    });

    it('should handle deep nesting chains efficiently', async () => {
      // Create a simple schema for chain testing
      const chainUserSchema = SchemaBuilder
        .create('chain-user')
        .name('Chain User')
        .property('name', PrimitiveSchemas.requiredString())
        .property('next', ReferenceSchemas.to('chain-user-summary', 3))
        .required('name')
        .build();

      const chainUserSummarySchema = SchemaBuilder
        .create('chain-user-summary')
        .name('Chain User Summary')
        .property('name', PrimitiveSchemas.requiredString())
        .required('name')
        .additionalProperties(false)
        .build();

      schemaRegistry.register(chainUserSchema);
      schemaRegistry.register(chainUserSummarySchema);

      const userCollection = new TypedCollectionImpl<{
        name: string;
        next?: string;
      }>('users', chainUserSchema, schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      const startSetup = performance.now();

      // Create a chain of 50 users
      const chainLength = 50;
      const userIds: string[] = [];
      
      for (let i = 0; i < chainLength; i++) {
        const userId = `chain-user${i}`;
        userIds.push(userId);
        await userCollection.put(userId, { name: `Chain User ${i}` });
      }

      // Link them in a chain
      for (let i = 0; i < chainLength - 1; i++) {
        const currentId = userIds[i];
        const nextId = userIds[i + 1];
        
        const linkDelta = new Delta({
          creator: node.config.creator,
          host: node.config.peerId,
          pointers: [
            { localContext: 'users', target: currentId, targetContext: 'next' },
            { localContext: 'next', target: nextId }
          ]
        });
        node.lossless.ingestDelta(linkDelta);
      }

      const setupTime = performance.now() - startSetup;
      console.log(`Setup time for chain of ${chainLength} users: ${setupTime.toFixed(2)}ms`);

      // Test resolution from the start of the chain
      const firstUserId = userIds[0];
      const userViews = node.lossless.view([firstUserId]);
      const userView = userViews[firstUserId];

      const startResolution = performance.now();
      
      const nestedView = schemaRegistry.applySchemaWithNesting(
        userView,
        'chain-user',
        node.lossless,
        { maxDepth: 5 } // Should resolve 5 levels deep
      );

      const resolutionTime = performance.now() - startResolution;
      console.log(`Resolution time for deep chain (maxDepth=5): ${resolutionTime.toFixed(2)}ms`);

      // Verify the resolution worked and respected depth limits
      expect(nestedView.id).toBe(firstUserId);
      expect(nestedView.schemaId).toBe('chain-user');
      
      // Performance assertions
      expect(setupTime).toBeLessThan(2000); // Setup should take less than 2 seconds
      expect(resolutionTime).toBeLessThan(500); // Resolution should take less than 500ms

      // Verify depth was respected
      let currentView = nestedView;
      let depth = 0;
      while (currentView.nestedObjects.next && currentView.nestedObjects.next.length > 0) {
        currentView = currentView.nestedObjects.next[0];
        depth++;
        if (depth >= 10) break; // Prevent infinite loop
      }
      
      expect(depth).toBeLessThanOrEqual(5);
      console.log(`Actual resolved depth: ${depth}`);
    });

    it('should handle circular references in large graphs without performance degradation', async () => {
      const circularUserSchema = SchemaBuilder
        .create('circular-user')
        .name('Circular User')
        .property('name', PrimitiveSchemas.requiredString())
        .property('connections', ArraySchemas.of(ReferenceSchemas.to('circular-user-summary', 3)))
        .required('name')
        .build();

      const circularUserSummarySchema = SchemaBuilder
        .create('circular-user-summary')
        .name('Circular User Summary')
        .property('name', PrimitiveSchemas.requiredString())
        .required('name')
        .additionalProperties(false)
        .build();

      schemaRegistry.register(circularUserSchema);
      schemaRegistry.register(circularUserSummarySchema);

      const userCollection = new TypedCollectionImpl<{
        name: string;
        connections?: string[];
      }>('users', circularUserSchema, schemaRegistry);
      
      userCollection.rhizomeConnect(node);

      const startSetup = performance.now();

      // Create 20 users
      const userCount = 20;
      const userIds: string[] = [];
      for (let i = 0; i < userCount; i++) {
        const userId = `circular-user${i}`;
        userIds.push(userId);
        await userCollection.put(userId, { name: `Circular User ${i}` });
      }

      // Create many circular connections - each user connects to 3 others
      for (let i = 0; i < userCount; i++) {
        const userId = userIds[i];
        
        // Connect to next 3 users (wrapping around)
        for (let j = 1; j <= 3; j++) {
          const connectedIndex = (i + j) % userCount;
          const connectedId = userIds[connectedIndex];
          
          const connectionDelta = new Delta({
            creator: node.config.creator,
            host: node.config.peerId,
            pointers: [
              { localContext: 'users', target: userId, targetContext: 'connections' },
              { localContext: 'connections', target: connectedId }
            ]
          });
          node.lossless.ingestDelta(connectionDelta);
        }
      }

      const setupTime = performance.now() - startSetup;
      console.log(`Setup time for circular graph with ${userCount} users: ${setupTime.toFixed(2)}ms`);

      // Test resolution performance with circular references
      const testUserId = userIds[0];
      const userViews = node.lossless.view([testUserId]);
      const userView = userViews[testUserId];

      const startResolution = performance.now();
      
      const nestedView = schemaRegistry.applySchemaWithNesting(
        userView,
        'circular-user',
        node.lossless,
        { maxDepth: 3 }
      );

      const resolutionTime = performance.now() - startResolution;
      console.log(`Resolution time for circular graph (maxDepth=3): ${resolutionTime.toFixed(2)}ms`);

      // Verify the resolution completed without hanging
      expect(nestedView.id).toBe(testUserId);
      expect(nestedView.schemaId).toBe('circular-user');
      
      // Performance assertions - should handle circular references efficiently
      expect(setupTime).toBeLessThan(2000);
      expect(resolutionTime).toBeLessThan(1000); // Should complete in reasonable time despite cycles

      // Verify we got some nested objects but didn't get stuck in infinite loops
      expect(nestedView.nestedObjects.connections).toBeDefined();
      if (nestedView.nestedObjects.connections) {
        expect(nestedView.nestedObjects.connections.length).toBeGreaterThan(0);
        expect(nestedView.nestedObjects.connections.length).toBeLessThanOrEqual(3);
      }
      
      console.log(`Connections resolved: ${nestedView.nestedObjects.connections?.length || 0}`);
    });
  });
});