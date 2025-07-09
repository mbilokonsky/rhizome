# Rhizome Node Class Diagram

This document provides an overview of the main classes in the Rhizome Node system and their relationships.

```mermaid
classDiagram
    %% Core Classes
    class RhizomeNode {
        -config: RhizomeNodeConfig
        -pubSub: PubSub
        -requestReply: RequestReply
        -httpServer: HttpServer
        -deltaStream: DeltaStream
        -hyperview: Hyperview
        -peers: Peers
        -queryEngine: QueryEngine
        -storageQueryEngine: StorageQueryEngine
        -schemaRegistry: SchemaRegistry
        -deltaStorage: DeltaStorage
    }
    
    class Delta {
        +id: DeltaID
        +timeCreated: Timestamp
        +host: HostID
        +creator: CreatorID
        +pointers: PointerV1[]
    }
    
    class Hyperview {
        -domainEntities: Map<DomainEntityID, HyperviewEntity>
        -transactions: Transactions
        +view(ids: DomainEntityID[]): HyperviewMany
        +compose(ids: DomainEntityID[]): HyperviewMany
    }
    
    class QueryEngine {
        -hyperview: Hyperview
        -schemaRegistry: SchemaRegistry
        +query(schemaId: SchemaID, filter?: JsonLogic): Promise<SchemaAppliedViewWithNesting[]>
    }
    
    class StorageQueryEngine {
        -storage: DeltaQueryStorage
        -schemaRegistry: SchemaRegistry
        +query(schemaId: SchemaID, filter?: JsonLogic): Promise<StorageQueryResult>
    }
    
    class SchemaRegistry {
        +register(schema: ObjectSchema): void
        +get(id: SchemaID): ObjectSchema | undefined
        +list(): ObjectSchema[]
    }
    
    class DeltaStream {
        -deltas: Delta[]
        +receiveDelta(delta: Delta): void
        +ingestAll(): void
    }
    
    class DockerOrchestrator {
        -containerManager: ContainerManager
        -networkManager: NetworkManager
        -resourceManager: ResourceManager
        -statusManager: StatusManager
        +startNode(config: NodeConfig): Promise<NodeHandle>
        +stopNode(nodeId: string): Promise<void>
    }
    
    %% Relationships
    RhizomeNode --> DeltaStream
    RhizomeNode --> Hyperview
    RhizomeNode --> QueryEngine
    RhizomeNode --> StorageQueryEngine
    RhizomeNode --> SchemaRegistry
    RhizomeNode --> DeltaStorage
    
    Hyperview --> Transactions
    Hyperview --> HyperviewEntity
    
    QueryEngine --> SchemaRegistry
    QueryEngine --> Hyperview
    
    StorageQueryEngine --> DeltaStorage
    StorageQueryEngine --> SchemaRegistry
    
    DeltaStream --> Delta
    Hyperview --> Delta
    
    DockerOrchestrator --> ContainerManager
    DockerOrchestrator --> NetworkManager
    DockerOrchestrator --> ResourceManager
    DockerOrchestrator --> StatusManager
```

## Key Components

1. **RhizomeNode**: The main entry point that coordinates all other components
   - Manages the node's lifecycle and configuration
   - Coordinates between different subsystems

2. **Delta**: The fundamental data unit
   - Represents atomic changes in the system
   - Contains pointers to entities and their properties

3. **Hyperview**: Manages the hyperview of data
   - Maintains the complete history of deltas
   - Provides methods to view and compose entity states

4. **QueryEngine**: Handles data queries
   - Supports filtering with JSON Logic
   - Works with the schema system for validation

5. **StorageQueryEngine**: Handles storage-level queries
   - Interfaces with the underlying storage backend
   - Optimized for querying persisted data

6. **SchemaRegistry**: Manages data schemas
   - Validates data against schemas
   - Supports schema versioning and evolution

7. **DockerOrchestrator**: Manages containerized nodes
   - Handles node lifecycle (start/stop)
   - Manages networking between nodes

## Data Flow

1. Deltas are received through the DeltaStream
2. Hyperview processes and stores these deltas
3. Queries can be made through either QueryEngine (in-memory) or StorageQueryEngine (persisted)
4. The system maintains consistency through the schema system
5. In distributed mode, DockerOrchestrator manages multiple node instances
