import { EntityProperties } from "../../../core/entity";
import { CollapsedDelta, Lossless } from "../../lossless";
import { Lossy } from '../../lossy';
import { DomainEntityID, PropertyID, PropertyTypes } from "../../../core/types";
import { ResolverPlugin, DependencyStates } from "./plugin";

// Extend the LosslessViewOne type to include entities
export interface CustomLosslessViewOne {
  id: string;
  entities: Array<{ id: string }>;
  propertyDeltas: Record<string, CollapsedDelta[]>;
}

type PropertyState<T = unknown, D extends string = never> = {
  plugin: ResolverPlugin<T, D>;
  state: T;
};

type EntityState = {
  [propertyId: PropertyID]: PropertyState;
};

type CustomResolverAccumulator = {
  [entityId: DomainEntityID]: {
    id: DomainEntityID;
    properties: EntityState;
  };
};

// Type to map property IDs to their plugin types
type PluginMap = {
  [P in PropertyID]: ResolverPlugin<unknown, string>;
};

type CustomResolverResult = Array<{
  id: DomainEntityID;
  properties: EntityProperties;
}>;

/**
 * Extract value from delta for a specific property
 */
function extractValueFromDelta(propertyId: PropertyID, delta: CollapsedDelta): PropertyTypes | undefined {
  for (const pointer of delta.pointers) {
    for (const [key, value] of Object.entries(pointer)) {
      if (key === propertyId && (typeof value === "string" || typeof value === "number")) {
        return value;
      }
    }
  }
  return undefined;
}

// Helper type to make properties optional except for required ones
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export class CustomResolver extends Lossy<CustomResolverAccumulator, CustomResolverResult> {
  private readonly config: PluginMap;
  private readonly executionOrder: PropertyID[] = [];
  private readonly dependencyGraph: Map<PropertyID, Set<PropertyID>> = new Map();
  private initialized: boolean = false;

  constructor(
    lossless: Lossless,
    config: PluginMap
  ) {
    super(lossless);
    this.config = config;
    this.buildDependencyGraph();
    this.executionOrder = this.calculateExecutionOrder();
  }

  /**
   * Build the dependency graph for all plugins
   */
  private buildDependencyGraph(): void {
    // Initialize the graph with all plugins
    Object.keys(this.config).forEach(propertyId => {
      this.dependencyGraph.set(propertyId, new Set());
    });

    // Add edges based on dependencies
    Object.entries(this.config).forEach(([propertyId, plugin]) => {
      const deps = plugin.dependencies || [];
      deps.forEach(depId => {
        if (!this.dependencyGraph.has(depId)) {
          throw new Error(`Dependency ${depId} not found for plugin ${propertyId}`);
        }
        this.dependencyGraph.get(propertyId)?.add(depId);
      });
    });
  }

  /**
   * Calculate the execution order of properties based on their dependencies
   * using Kahn's algorithm for topological sorting
   */
  private calculateExecutionOrder(): PropertyID[] {
    const order: PropertyID[] = [];
    const inDegree = new Map<PropertyID, number>();
    
    // Initialize in-degree count for all nodes
    this.dependencyGraph.forEach((_, node) => {
      inDegree.set(node, 0);
    });

    // Calculate in-degree for each node
    this.dependencyGraph.forEach((deps, node) => {
      deps.forEach(dep => {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      });
    });

    // Queue for nodes with no incoming edges
    const queue: PropertyID[] = [];
    inDegree.forEach((degree, node) => {
      if (degree === 0) {
        queue.push(node);
      }
    });

    // Process nodes in topological order
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);

      // Decrease in-degree for all neighbors
      this.dependencyGraph.get(node)?.forEach(neighbor => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        
        // If in-degree becomes zero, add to queue
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // Check for cycles
    if (order.length !== this.dependencyGraph.size) {
      throw new Error('Circular dependency detected in plugin dependencies');
    }

    return order;
  }

  /**
   * Initialize the state for each entity in the view
   */
  initializer(view: WithOptional<CustomLosslessViewOne, 'entities'>): CustomResolverAccumulator {
    const accumulator: CustomResolverAccumulator = {};
    
    // Ensure entities is defined
    const entities = view.entities || [];
    
    // Initialize state for each entity in the view
    for (const entity of entities) {
      const entityId = entity.id as DomainEntityID;
      const entityState: EntityState = {};
      
      // Initialize state for each property in execution order
      for (const propertyId of this.executionOrder) {
        const plugin = this.config[propertyId];
        if (!plugin) continue;
        
        entityState[propertyId] = {
          plugin,
          state: plugin.initialize()
        };
      }
      
      accumulator[entityId] = {
        id: entityId,
        properties: entityState
      };
    }
    
    this.initialized = true;
    return accumulator;
  }

  /**
   * Validates plugin dependencies:
   * 1. Ensures no circular dependencies exist
   * 2. Ensures all declared dependencies exist
   * @throws Error if validation fails
   */
  private validateDependencies(): void {
    const visited = new Set<PropertyID>();
    const visiting = new Set<PropertyID>();
    const plugins = Object.entries(this.config) as [PropertyID, ResolverPlugin<unknown, string>][];

    // First pass: check for unknown dependencies
    for (const [pluginId, plugin] of plugins) {
      if (!plugin.dependencies) continue;

      const depsArray = Array.isArray(plugin.dependencies) ? plugin.dependencies : [];
      for (const dep of depsArray) {
        if (!this.config[dep as PropertyID]) {
          throw new Error(`Plugin '${pluginId}' depends on unknown plugin '${dep}'`);
        }
      }
    }

    // Second pass: detect circular dependencies
    const visit = (pluginId: PropertyID): void => {
      if (visiting.has(pluginId)) {
        throw new Error(`Circular dependency detected involving property: ${pluginId}`);
      }

      if (visited.has(pluginId)) {
        return;
      }

      visiting.add(pluginId);
      const plugin = this.config[pluginId];

      // Visit all dependencies first
      if (plugin.dependencies) {
        const depsArray = Array.isArray(plugin.dependencies) ? plugin.dependencies : [];
        for (const dep of depsArray) {
          visit(dep as PropertyID);
        }
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
    };

    // Check each plugin for circular dependencies
    for (const [id] of plugins) {
      if (!visited.has(id)) {
        visit(id);
      }
    }
  }

  /**
   * Gets the execution order of properties based on their dependencies
   * @returns Array of property IDs in execution order
   */
  private getExecutionOrder(): PropertyID[] {
    const visited = new Set<PropertyID>();
    const order: PropertyID[] = [];

    const visit = (pluginId: PropertyID): void => {
      if (visited.has(pluginId)) return;

      const plugin = this.config[pluginId];
      if (!plugin) return;

      // Visit dependencies first
      if (plugin.dependencies) {
        const depsArray = Array.isArray(plugin.dependencies) ? plugin.dependencies : [];
        for (const dep of depsArray) {
          visit(dep as PropertyID);
        }
      }

      // Then add this plugin
      if (!visited.has(pluginId)) {
        visited.add(pluginId);
        order.push(pluginId);
      }
    };
    
    // Visit each plugin
    for (const id of Object.keys(this.config)) {
      visit(id);
    }
    
    return order;
  }

  /**
   * Get the resolved states of all dependencies for a plugin
   */
  private getDependencyStates<TDeps extends readonly string[]>(
    properties: EntityState,
    dependencies: TDeps & readonly string[]
  ): DependencyStates<TDeps> {
    const dependencyStates = {} as Record<string, unknown>;
    
    for (const depId of dependencies) {
      const depState = properties[depId];
      if (depState) {
        // Resolve the dependency's dependencies first
        const depDependencies = this.getDependencyStates(
          properties,
          depState.plugin.dependencies || []
        );
        
        // Resolve the dependency's state
        dependencyStates[depId] = depState.plugin.resolve(
          depState.state,
          depDependencies
        );
      }
    }
    
    return dependencyStates as DependencyStates<TDeps>;
  }

  /**
   * Update the state with new deltas from the view
   */
  reducer(acc: CustomResolverAccumulator, view: WithOptional<CustomLosslessViewOne, 'entities'>): CustomResolverAccumulator {
    // Ensure entities is defined
    const entities = view.entities || [];
    
    // Process each entity in the view
    for (const entity of entities) {
      const entityId = entity.id as DomainEntityID;
      
      // Initialize entity state if it doesn't exist
      if (!acc[entityId]) {
        const entityState: EntityState = {};
        
        // Initialize all property states for this entity in execution order
        for (const propertyId of this.executionOrder) {
          const plugin = this.config[propertyId];
          if (!plugin) continue;
          
          entityState[propertyId] = {
            plugin,
            state: plugin.initialize()
          };
        }
        
        acc[entityId] = {
          id: entityId,
          properties: entityState
        };
      }
      
      // Process each property update in the view
      for (const [propertyId, deltas] of Object.entries(view.propertyDeltas)) {
        const plugin = this.config[propertyId];
        if (!plugin) continue;
        
        let propertyState = acc[entityId].properties[propertyId];
        
        // Initialize property state if it doesn't exist
        if (!propertyState) {
          propertyState = {
            plugin,
            state: plugin.initialize()
          };
          acc[entityId].properties[propertyId] = propertyState;
        }
        
        // Process each delta for this property
        for (const delta of deltas) {
          const value = extractValueFromDelta(propertyId as PropertyID, delta);
          if (value === undefined) continue;
          
          // Get the states of all dependencies
          const dependencyStates = this.getDependencyStates(
            acc[entityId].properties,
            plugin.dependencies || []
          );
          
          // Update the property state with type-safe dependencies
          propertyState.state = plugin.update(
            propertyState.state,
            value,
            delta,
            dependencyStates
          );
        }
      }
    }
    
    return acc;
  }

  /**
   * Resolve the final state of all entities and properties
   */
  resolver(acc: CustomResolverAccumulator): CustomResolverResult {
    const result: Array<{ id: DomainEntityID; properties: EntityProperties }> = [];
    
    for (const entityId in acc) {
      const entity = acc[entityId];
      const properties: EntityProperties = {};
      
      // First pass: collect all states for this entity
      const allStates: Record<PropertyID, unknown> = {};
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        allStates[propertyId] = propertyState.state;
      }
      
      // Second pass: resolve each property with access to all states
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        const plugin = propertyState.plugin;
        const visibleStates: Record<PropertyID, unknown> = {};
        
        // Only include declared dependencies in visibleStates
        if (plugin.dependencies) {
          const depsArray = Array.isArray(plugin.dependencies) ? plugin.dependencies : [];
          for (const dep of depsArray) {
            const depId = dep as PropertyID;
            if (allStates[depId] !== undefined) {
              visibleStates[depId] = allStates[depId];
            }
          }
        }
        
        // Resolve the property value with only the visible states
        const resolvedValue = plugin.resolve(propertyState.state, visibleStates);
        properties[propertyId as PropertyID] = resolvedValue as PropertyTypes;
      }
      
      result.push({
        id: entity.id,
        properties
      });
    }
    
    return result;
  }
}
