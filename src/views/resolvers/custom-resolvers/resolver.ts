import { Hyperview, HyperviewViewOne } from "../../hyperview";
import { Lossy } from '../../view';
import { DomainEntityID, PropertyID, PropertyTypes } from "../../../core/types";
import { ResolverPlugin, DependencyStates } from "./plugin";
import { EntityRecord } from "@src/core/entity";
import Debug from 'debug';
import { Delta } from "@src/core";

const debug = Debug('rz:custom-resolver');
const debugState = Debug('rz:custom-resolver:state');

/**
 * The state of a property for a single entity
 */
type EntityState = Record<PropertyID, unknown>;

/**
 * Entities with their plugin states
 */
type Accumulator = Record<DomainEntityID, EntityState>;

/**
 * Entities with their resolved properties
 */
type Result = Record<DomainEntityID, EntityRecord>;
/**
 * Type to map property IDs to their plugin types
 * 
 * @template T - The type of the plugin's state
 * @template D - The type of the plugin's dependencies (defaults to PropertyID)
 */
type PluginMap = {
  [P in PropertyID]: ResolverPlugin<unknown>;
};

/**
 * Resolver plugins are able to define (virtual) properties on entities.
 * Plugins can depend on other plugins, which will be resolved in topological order
 * each time the view is updated. (The view is updated when the hyperview ingests a delta
 * pertaining to an entity.)
 */
export class CustomResolver extends Lossy<Accumulator, Result> {
  readonly config: PluginMap;
  readonly executionOrder: PropertyID[] = [];
  readonly dependencyGraph: Map<PropertyID, Set<PropertyID>> = new Map();

  /**
   * Creates a new CustomResolver instance
   * @param hyperview - The Hyperview instance to use for delta tracking
   * @param config - A mapping of property IDs to their resolver plugins
   */
  constructor(
    hyperview: Hyperview,
    config: PluginMap
  ) {
    super(hyperview);
    this.config = config;
    this.buildDependencyGraph();
    this.executionOrder = this.calculateExecutionOrder();
    debug(`Execution order: ${this.executionOrder.join(' -> ')}`);
  }

  /**
   * If you know the key by which a plugin is registered, this will return the base name
   * @param propertyId The key by which a plugin is registered
   * @returns The base name of the plugin
   */
  pluginBasenameFromKey(propertyId: string): string {
    return this.config[propertyId]?.name || propertyId;
  }

  /**
   * If you know the base name of a plugin, this will return the key by which it is registered
   * @param alias The alias of the plugin
   * @returns The key by which it is registered
   */
  pluginKeyFromBasename(name: string): string {
    const entry = Object.entries(this.config).find(([_, plugin]) => plugin.name === name);
    if (!entry) return name;
    return entry[0];
  }

  private logGraph(): void {
    // Log the final dependency graph
    const graphLog: Record<string, string[]> = {};
    this.dependencyGraph.forEach((deps, plugin) => {
      graphLog[plugin] = Array.from(deps);
    });
    debug(`Dependency graph: ${JSON.stringify(graphLog)}`);
  }
    

  /**
   * Build the dependency graph for all plugins.
   * We'll use the basenames of the plugins in the graph.
   */
  private buildDependencyGraph(): void {
    debug('Building dependency graph...');
    
    // Initialize the graph with all plugins
    Object.keys(this.config).forEach(pluginKey => {
      this.dependencyGraph.set(pluginKey, new Set());
    });

    // Add edges based on dependencies
    Object.entries(this.config).forEach(([pluginKey, plugin]) => {
      const deps = plugin.dependencies || [];

      deps.forEach((depId: string) => {
        // This dependency may have an alias in our current config
        const depKey = this.pluginKeyFromBasename(depId);
        
        if (!this.config[depKey]) {
          // TODO: This could still be a property, not a plugin
          const errorMsg = `Dependency ${depKey} not found for plugin ${pluginKey}`;
          debug(`Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Add the dependency edge
        const dep = this.dependencyGraph.get(depKey)
        if (!dep) {
          throw new Error(`Dependency ${depKey} not found in dependency graph`);
        }
        dep.add(pluginKey);
      });
    });
    
    debug('Dependency graph construction complete');
    this.logGraph();
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
    this.dependencyGraph.forEach((deps) => {
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
   * Get the resolved states of all dependencies for a plugin
   * @param entityPluginStates The state of the entity
   * @param dependencies The dependencies to resolve
   * 
   */
  private getDependencyStates(
    entityPluginStates: EntityState,
    pluginKey: string
  ): DependencyStates {
    const plugin = this.config[pluginKey];
    if (!plugin) throw new Error(`Plugin ${pluginKey} not found`);

    const dependencyStates: DependencyStates = {};

    for (const depKey of this.executionOrder) {
      if (depKey === pluginKey) continue;
      const depPlugin = this.config[depKey];
      if (!depPlugin) continue;
      if (!entityPluginStates[depKey]) {
        dependencyStates[depKey] = depPlugin.initialize(dependencyStates);
        entityPluginStates[depKey] = dependencyStates[depKey];
      }
      dependencyStates[depKey] = depPlugin.resolve(entityPluginStates[depKey], dependencyStates);
      
    }

    // We should only include the dependencies for this plugin
    Object.keys(dependencyStates).forEach(key => {
      if (!plugin.dependencies?.includes(key)) {
        delete dependencyStates[key];
      }
    });

    return dependencyStates;
  }

  private getEntityState(acc: Accumulator, entityId: DomainEntityID) {
    if (!acc[entityId]) {
      acc[entityId] = {};
    }
    const entityState = acc[entityId];

    for (const pluginKey of this.executionOrder) {
      const plugin = this.config[pluginKey];
      if (!plugin) throw new Error(`Plugin ${pluginKey} not found`);

      // We need to resolve dependencies, including entity properties that are not plugins.
      const dependencies = this.getDependencyStates(entityState, pluginKey);
      debug('Dependencies for', pluginKey, ':', JSON.stringify(dependencies));

      // Initialize the plugin if it hasn't been initialized yet
      entityState[pluginKey] = entityState[pluginKey] ?? plugin.initialize(dependencies);
    }

    return entityState;
  }
  
  /**
   * Update the state with new deltas from the view
   */
  reducer(acc: Accumulator, {id: entityId, propertyDeltas}: HyperviewViewOne): Accumulator {
    debug(`Processing deltas for entity: ${entityId}`);
    debug('Property deltas:', JSON.stringify(propertyDeltas));

    const entityState = this.getEntityState(acc, entityId);

    type PropertyRecord = {
      delta: Delta;
      value: PropertyTypes;
    }

    // First pass through deltas to see if there are any duplicate property values
    const deltaPropertyRecords : Record<PropertyID, PropertyRecord> = {};
    for (const [propertyId, deltas] of Object.entries(propertyDeltas)) {
      for (const delta of deltas) {
        // Iterate through the pointers; throw an error if a duplicate key is found
        for (const pointer of delta.pointers.filter(p => p.localContext === propertyId)) {
          const deltaPropertyValue = deltaPropertyRecords[propertyId];
          if (deltaPropertyValue) {
            // It's possible that there are multiple deltas in this set with the same property ID.
            // That can only happen if they are part of a transaction. Otherwise this function is
            // only called once per delta, per entity affected.
            // TODO: More flexible/robust error handling protocols?
            // Some views might be more tolerant of errors than others.
            debug(`propertyDeltas: ${JSON.stringify(propertyDeltas, null, 2)}`);
            throw new Error(`Delta ${delta.id}: '${propertyId}' already has value '${deltaPropertyValue}'`);
          }
          deltaPropertyRecords[propertyId] = {
            delta,
            value: pointer.target
          };
        }
      }
    }

    debug('Delta property records:', JSON.stringify(deltaPropertyRecords));

    // Now let's go through each plugin in order. 
    for (const pluginId of this.executionOrder) {
      const pluginKey = this.pluginKeyFromBasename(pluginId);
      const plugin = this.config[pluginKey];
      if (!plugin) throw new Error(`Plugin for property ${pluginId} not found`);
      const pluginState = entityState[pluginKey];

      debug(`Processing plugin: ${pluginId} (key: ${pluginKey})`);
      
      // If there's an updated entity property matching the plugin key, 
      // pass it to plugin.applyUpdate as the new property value.
      let propertyValue : PropertyTypes | undefined;
      let updateDelta : Delta | undefined;
      for (const [propertyId, record] of Object.entries(deltaPropertyRecords)) {
        if (propertyId === pluginKey) {
          if (propertyValue !== undefined) {
            throw new Error(`Delta ${record.delta.id}: '${propertyId}' already has value '${propertyValue}'`);
          }
          debug(`Found delta for plugin ${pluginKey}: ${JSON.stringify(record)}`);
          propertyValue = record.value;
          updateDelta = record.delta;
        }
      }

      // Update the plugin state with the new delta
      debug(`Getting dependency states for plugin ${pluginKey}`)
      // TODO: There is some redundancy in calling the dependency resolvers. They can be cached/memoized.
      const dependencies = this.getDependencyStates(entityState, pluginKey);
      debug(`Updating plugin ${pluginKey} with value ${JSON.stringify(propertyValue)}, dependencies: ${JSON.stringify(dependencies)}`)
      entityState[pluginKey] = plugin.applyUpdate(pluginState, propertyValue, updateDelta, dependencies);
      debugState(`Updated state for entity ${entityId} plugin ${pluginKey}:`, 
        JSON.stringify(entityState[pluginKey]));
    }
    
    return acc;
  }

  resolver(acc: Accumulator, entityIds: DomainEntityID[]) {
    const result: Result = {}; 
    debug('Initial accumulator state:', JSON.stringify(acc));

    for (const entityId in acc) {
      if (!entityIds.includes(entityId)) continue;

      this.getEntityState(acc, entityId);
    
      result[entityId] = {
        id: entityId,
        properties: {}
      };

      for (const pluginKey of this.executionOrder) {
        const plugin = this.config[pluginKey];
        if (!plugin) throw new Error(`Plugin ${pluginKey} not found`);
        
        debug(`Processing property: ${pluginKey}`);
        const dependencies = this.getDependencyStates(acc[entityId], pluginKey);
        debug(`Dependencies for ${pluginKey}:`, JSON.stringify(dependencies));
        const state = acc[entityId][pluginKey] || plugin.initialize(dependencies);
        debug(`State for ${pluginKey}:`, JSON.stringify(state));

        const resolvedValue = plugin.resolve(state, dependencies);
        //if (resolvedValue === undefined) throw new Error(`Resolved value for property ${pluginKey} is undefined`)
        
        if (resolvedValue !== undefined) {
          debug(`Resolved value for ${pluginKey}:`, resolvedValue);
          result[entityId].properties[pluginKey] = resolvedValue;
        }
      }
    }

    debug(`Result:`, JSON.stringify(result));
    
    return result;
  }
}
