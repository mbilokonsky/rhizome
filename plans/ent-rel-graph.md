# Entity Relationship Graph Implementation Plan

## Overview
This document outlines the plan to implement entity relationship tracking in the rhizome-node system. The implementation treats relationships as first-class entities, each with their own identity and properties.

## Core Design

### Relationship as First-Class Entities
- Each relationship is a domain entity with its own unique ID
- Relationships have standard properties: `source`, `target`, and `type`
- Additional properties can be added to relationships
- Relationships are created using the `relate()` method in `DeltaBuilder`

### Delta Structure for Relationships
```typescript
// Creating a relationship
createDelta(creator, host)
  .relate(
    sourceId,     // ID of the source entity
    targetId,     // ID of the target entity
    'REL_TYPE',   // Relationship type
    {             // Optional properties
      prop1: 'value1',
      prop2: 'value2'
    }
  )
  .build();
```

### Data Structures

#### `LosslessEntity` Updates
```typescript
class LosslessEntity {
  // Existing properties
  properties = new Map<PropertyID, Set<Delta>>();
  
  // Track relationships where this entity is the source
  outboundRelationships = new Map<string, Set<string>>();  // relationshipType -> Set<relationshipId>
  
  // Track relationships where this entity is the target
  inboundRelationships = new Map<string, Set<string>>();   // relationshipType -> Set<relationshipId>
  
  // ... rest of the class
}
```

#### `LosslessViewOne` Extension
```typescript
type RelationshipView = {
  id: string;            // Relationship ID
  type: string;          // Relationship type
  direction: 'inbound' | 'outbound';
  target: string;        // Target entity ID
  properties: Record<string, any>;  // Relationship properties
};

type LosslessViewOne = {
  id: DomainEntityID;
  // ... existing fields ...
  relationships?: {
    outbound: RelationshipView[];
    inbound: RelationshipView[];
  };
};
```

## Implementation Steps

### Phase 1: Core Data Structures
1. [x] Update `DeltaBuilder.relate()` to create relationship entities
2. [ ] Update `LosslessEntity` to track relationship IDs
3. [ ] Extend `LosslessViewOne` type to include relationships

### Phase 2: Relationship Management
1. [ ] Implement relationship tracking in `Lossless` class
   - Track all relationships by ID
   - Maintain source/target indexes
2. [ ] Implement methods for querying relationships
   - Get relationships for an entity
   - Filter by type and direction
   - Support pagination

### Phase 3: Delta Processing
1. [ ] Update `ingestDelta` to handle relationship deltas
   - Extract relationship information from deltas
   - Update relationship indexes
   - Handle relationship updates and deletions
2. [ ] Add conflict resolution for concurrent relationship updates

### Phase 4: View Generation
1. [ ] Update `view` method to include relationships
   - Option to include/exclude relationships
   - Support for filtering relationships
   - Handle circular references

### Phase 5: Performance Optimization
1. [ ] Add indexing for relationship lookups
2. [ ] Implement lazy loading for large relationship sets
3. [ ] Add caching for frequently accessed relationships

## API Extensions

### Get Entity with Relationships
```typescript
// Get an entity with its relationships
GET /entities/{id}?include=relationships

// Response
{
  "id": "entity1",
  "properties": { /* ... */ },
  "relationships": {
    "outbound": [
      {
        "id": "rel-123",
        "type": "OWNS",
        "target": "entity2",
        "direction": "outbound",
        "properties": {
          "since": "2023-01-01"
        }
      }
    ],
    "inbound": []
  }
}
```

### Query Relationships
```typescript
// Get relationships for an entity
GET /entities/{id}/relationships?type=OWNS&direction=outbound

// Response
{
  "relationships": [
    {
      "id": "rel-123",
      "type": "OWNS",
      "source": "entity1",
      "target": "entity2",
      "properties": {
        "since": "2023-01-01"
      }
    }
  ]
}
```

### Create Relationship
```typescript
// Create a new relationship
POST /relationships
{
  "source": "entity1",
  "target": "entity2",
  "type": "OWNS",
  "properties": {
    "since": "2023-01-01"
  }
}

// Response
{
  "id": "rel-123",
  "source": "entity1",
  "target": "entity2",
  "type": "OWNS",
  "properties": {
    "since": "2023-01-01"
  }
}
```

## Performance Considerations

1. **Memory Usage**:
   - Store only relationship IDs in entity maps
   - Use lazy loading for relationship properties
   - Consider weak references if memory becomes an issue

2. **Query Performance**:
   - Add indexes for common relationship queries
   - Cache frequently accessed relationships
   - Support pagination for large relationship sets

3. **Delta Processing**:
   - Batch process relationship updates
   - Optimize delta application for relationship-heavy workloads

## Future Enhancements

1. **Advanced Querying**:
   - GraphQL support for complex relationship queries
   - Support for recursive relationship traversal

2. **Schema Validation**:
   - Define relationship schemas with property validation
   - Support for required/optional properties
   - Default values for relationship properties

3. **Indexing**:
   - Add support for indexing relationship properties
   - Implement efficient querying of relationships by property values

## Testing Strategy

1. **Unit Tests**:
   - Test relationship creation and deletion
   - Verify relationship queries with various filters
   - Test delta processing for relationships

2. **Integration Tests**:
   - Test relationship persistence across restarts
   - Verify concurrent relationship updates
   - Test with large numbers of relationships

3. **Performance Tests**:
   - Measure memory usage with large relationship graphs
   - Test query performance with complex relationship patterns
   - Benchmark delta processing speed for relationship operations
