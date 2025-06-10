/**
 * Tests for nested object resolution with deltas containing 3+ pointers
 * This tests the complex case where a single delta establishes relationships
 * between multiple entities and includes scalar values.
 */

import { RhizomeNode } from '../src/node';
import { Delta } from '../src/delta';
import { DefaultSchemaRegistry } from '../src/schema-registry';
import { SchemaBuilder, PrimitiveSchemas, ReferenceSchemas, SchemaAppliedViewWithNesting } from '../src/schema';
import { TypedCollectionImpl } from '../src/collection-typed';

describe('Multi-Pointer Delta Resolution', () => {
  let node: RhizomeNode;
  let schemaRegistry: DefaultSchemaRegistry;

  beforeEach(() => {
    node = new RhizomeNode();
    schemaRegistry = new DefaultSchemaRegistry();
  });

  describe('Three-Entity Relationship Deltas', () => {
    it('should handle movie casting deltas with actor, movie, role, and scalars', async () => {
      // Create schemas for a movie casting scenario
      const actorSchema = SchemaBuilder
        .create('actor')
        .name('Actor')
        .property('name', PrimitiveSchemas.requiredString())
        .property('filmography', ReferenceSchemas.to('casting-summary', 3))
        .required('name')
        .build();

      const movieSchema = SchemaBuilder
        .create('movie')
        .name('Movie')
        .property('title', PrimitiveSchemas.requiredString())
        .property('cast', ReferenceSchemas.to('casting-summary', 3))
        .required('title')
        .build();

      const roleSchema = SchemaBuilder
        .create('role')
        .name('Role')
        .property('name', PrimitiveSchemas.requiredString())
        .property('portrayals', ReferenceSchemas.to('casting-summary', 3))
        .required('name')
        .build();

      const castingSummarySchema = SchemaBuilder
        .create('casting-summary')
        .name('Casting Summary')
        .property('name', PrimitiveSchemas.string())
        .property('title', PrimitiveSchemas.string())
        .property('salary', PrimitiveSchemas.number())
        .property('contract_date', PrimitiveSchemas.string())
        .additionalProperties(false)
        .build();

      schemaRegistry.register(actorSchema);
      schemaRegistry.register(movieSchema);
      schemaRegistry.register(roleSchema);
      schemaRegistry.register(castingSummarySchema);

      // Create collections
      const actorCollection = new TypedCollectionImpl<{ name: string }>('actors', actorSchema, schemaRegistry);
      const movieCollection = new TypedCollectionImpl<{ title: string }>('movies', movieSchema, schemaRegistry);
      const roleCollection = new TypedCollectionImpl<{ name: string }>('roles', roleSchema, schemaRegistry);

      actorCollection.rhizomeConnect(node);
      movieCollection.rhizomeConnect(node);
      roleCollection.rhizomeConnect(node);

      // Create entities
      await actorCollection.put('keanu', { name: 'Keanu Reeves' });
      await movieCollection.put('matrix', { title: 'The Matrix' });
      await roleCollection.put('neo', { name: 'Neo' });

      // Create a complex casting delta with multiple entity references and scalar values
      const castingDelta = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'actors', target: 'keanu', targetContext: 'filmography' },
          { localContext: 'movies', target: 'matrix', targetContext: 'cast' },
          { localContext: 'roles', target: 'neo', targetContext: 'portrayals' },
          { localContext: 'salary', target: 15000000 },
          { localContext: 'contract_date', target: '1999-03-31' }
        ]
      });
      node.lossless.ingestDelta(castingDelta);

      // Test from Keanu's perspective
      const keanuViews = node.lossless.view(['keanu']);
      const keanuView = keanuViews['keanu'];

      expect(keanuView.propertyDeltas.filmography).toBeDefined();
      expect(keanuView.propertyDeltas.filmography.length).toBe(1);

      const nestedKeanuView = schemaRegistry.applySchemaWithNesting(
        keanuView,
        'actor',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedKeanuView.id).toBe('keanu');
      
      // Should resolve references to matrix and neo, but not keanu (self)
      expect(nestedKeanuView.nestedObjects.filmography).toBeDefined();
      if (nestedKeanuView.nestedObjects.filmography) {
        const castingEntry = nestedKeanuView.nestedObjects.filmography[0];
        expect(castingEntry).toBeDefined();
        
        // The casting entry should be resolved with casting-summary schema
        expect(castingEntry.schemaId).toBe('casting-summary');
        
        // Should not contain a reference to keanu (the parent)
        expect(castingEntry.id).not.toBe('keanu');
      }

      // Test from Matrix's perspective
      const matrixViews = node.lossless.view(['matrix']);
      const matrixView = matrixViews['matrix'];

      const nestedMatrixView = schemaRegistry.applySchemaWithNesting(
        matrixView,
        'movie',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedMatrixView.id).toBe('matrix');
      expect(nestedMatrixView.nestedObjects.cast).toBeDefined();
    });

    it('should handle deltas with mixed scalar and reference values correctly', async () => {
      // Create a simpler schema for testing mixed values
      const personSchema = SchemaBuilder
        .create('person')
        .name('Person')
        .property('name', PrimitiveSchemas.requiredString())
        .property('relationships', ReferenceSchemas.to('relationship-summary', 3))
        .required('name')
        .build();

      const relationshipSummarySchema = SchemaBuilder
        .create('relationship-summary')
        .name('Relationship Summary')
        .property('partner_name', PrimitiveSchemas.string())
        .property('type', PrimitiveSchemas.string())
        .property('since', PrimitiveSchemas.string())
        .property('intensity', PrimitiveSchemas.number())
        .additionalProperties(false)
        .build();

      schemaRegistry.register(personSchema);
      schemaRegistry.register(relationshipSummarySchema);

      const personCollection = new TypedCollectionImpl<{ name: string }>('people', personSchema, schemaRegistry);
      personCollection.rhizomeConnect(node);

      // Create people
      await personCollection.put('alice', { name: 'Alice' });
      await personCollection.put('bob', { name: 'Bob' });

      // Create a relationship delta with one entity reference and multiple scalars
      const relationshipDelta = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'people', target: 'alice', targetContext: 'relationships' },
          { localContext: 'partner', target: 'bob' }, // Entity reference
          { localContext: 'type', target: 'friendship' }, // Scalar
          { localContext: 'since', target: '2020-01-15' }, // Scalar
          { localContext: 'intensity', target: 8 } // Scalar number
        ]
      });
      node.lossless.ingestDelta(relationshipDelta);

      // Test from Alice's perspective
      const aliceViews = node.lossless.view(['alice']);
      const aliceView = aliceViews['alice'];

      const nestedAliceView = schemaRegistry.applySchemaWithNesting(
        aliceView,
        'person',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedAliceView.id).toBe('alice');
      expect(nestedAliceView.nestedObjects.relationships).toBeDefined();
      
      if (nestedAliceView.nestedObjects.relationships) {
        expect(nestedAliceView.nestedObjects.relationships.length).toBe(1);
        const relationshipEntry = nestedAliceView.nestedObjects.relationships[0];
        
        // Should be resolved with relationship-summary schema
        expect(relationshipEntry.schemaId).toBe('relationship-summary');
        
        // Should contain scalar values and reference to bob but not alice
        expect(relationshipEntry.id).not.toBe('alice');
        
        // The relationship should contain the scalar values from the delta
        // Note: The exact structure depends on how the resolution logic handles mixed values
      }
    });

    it('should correctly identify multiple entity references within a single delta', async () => {
      // Test a scenario with multiple entity references that should all be resolved
      const projectSchema = SchemaBuilder
        .create('project')
        .name('Project')
        .property('name', PrimitiveSchemas.requiredString())
        .property('collaborations', ReferenceSchemas.to('collaboration-summary', 3))
        .required('name')
        .build();

      const collaborationSummarySchema = SchemaBuilder
        .create('collaboration-summary')
        .name('Collaboration Summary')
        .property('project_name', PrimitiveSchemas.string())
        .property('developer_name', PrimitiveSchemas.string())
        .property('designer_name', PrimitiveSchemas.string())
        .property('budget', PrimitiveSchemas.number())
        .additionalProperties(false)
        .build();

      schemaRegistry.register(projectSchema);
      schemaRegistry.register(collaborationSummarySchema);

      const projectCollection = new TypedCollectionImpl<{ name: string }>('projects', projectSchema, schemaRegistry);
      const developerCollection = new TypedCollectionImpl<{ name: string }>('developers', projectSchema, schemaRegistry);
      const designerCollection = new TypedCollectionImpl<{ name: string }>('designers', projectSchema, schemaRegistry);

      projectCollection.rhizomeConnect(node);
      developerCollection.rhizomeConnect(node);
      designerCollection.rhizomeConnect(node);

      // Create entities
      await projectCollection.put('website', { name: 'Company Website' });
      await developerCollection.put('alice', { name: 'Alice Developer' });
      await designerCollection.put('bob', { name: 'Bob Designer' });

      // Create a collaboration delta with multiple entity references
      const collaborationDelta = new Delta({
        creator: node.config.creator,
        host: node.config.peerId,
        pointers: [
          { localContext: 'projects', target: 'website', targetContext: 'collaborations' },
          { localContext: 'developer', target: 'alice' }, // Entity reference
          { localContext: 'designer', target: 'bob' },   // Entity reference  
          { localContext: 'budget', target: 50000 },     // Scalar
          { localContext: 'deadline', target: '2024-06-01' } // Scalar
        ]
      });
      node.lossless.ingestDelta(collaborationDelta);

      // Test from project's perspective
      const projectViews = node.lossless.view(['website']);
      const projectView = projectViews['website'];

      const nestedProjectView = schemaRegistry.applySchemaWithNesting(
        projectView,
        'project',
        node.lossless,
        { maxDepth: 2 }
      );

      expect(nestedProjectView.id).toBe('website');
      expect(nestedProjectView.nestedObjects.collaborations).toBeDefined();
      
      if (nestedProjectView.nestedObjects.collaborations) {
        
        // Verify we get exactly 1 composite object (not 2 separate objects)
        expect(nestedProjectView.nestedObjects.collaborations.length).toBe(1);
        const collaboration = nestedProjectView.nestedObjects.collaborations[0];
        
        expect(collaboration.schemaId).toBe('collaboration-summary');
        expect(collaboration.id).toMatch(/^composite-/); // Should be a synthetic composite ID
        
        // Verify the composite object contains scalar properties
        expect(collaboration.properties.budget).toBe(50000);
        expect(collaboration.properties.deadline).toBe('2024-06-01');
        
        // Verify the composite object contains nested entity references
        expect(collaboration.nestedObjects.developer).toBeDefined();
        expect(collaboration.nestedObjects.designer).toBeDefined();
        
        // The nested entities should be resolved as arrays with single objects
        const developers = collaboration.nestedObjects.developer as SchemaAppliedViewWithNesting[];
        const designers = collaboration.nestedObjects.designer as SchemaAppliedViewWithNesting[];
        
        // Each should have exactly one entity
        expect(developers.length).toBe(1);
        expect(designers.length).toBe(1);
        
        // Verify each entity reference resolves to the correct entity
        expect(developers[0].id).toBe('alice');
        expect(developers[0].schemaId).toBe('collaboration-summary');
        
        expect(designers[0].id).toBe('bob');
        expect(designers[0].schemaId).toBe('collaboration-summary');
      }
    });
  });
});