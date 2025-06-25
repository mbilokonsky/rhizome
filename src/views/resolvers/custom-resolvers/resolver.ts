import { CollapsedDelta, Lossless, LosslessViewOne } from "../../lossless";
import { Lossy } from '../../lossy';
import { DomainEntityID, PropertyID, PropertyTypes } from "../../../core/types";
import { ResolverPlugin, DependencyStates } from "./plugin";
import { EntityRecord } from "@src/core/entity";
import Debug from 'debug';

const debug = Debug('rz:resolver');
const debugState = Debug('rz:resolver:state');

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
  [P in PropertyID]: ResolverPlugin<unknown, PropertyID>;
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
   * @param lossless - The Lossless instance to use for delta tracking
   * @param config - A mapping of property IDs to their resolver plugins
   */
  constructor(
    lossless: Lossless,
    config: PluginMap
  ) {
    super(lossless);
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
  pluginBasenameFromKey(propertyId: PropertyID): PropertyID {
    return this.config[propertyId]?.name || propertyId;
  }

  /**
   * If you know the base name of a plugin, this will return the key by which it is registered
   * @param alias The alias of the plugin
   * @returns The key by which it is registered
   */
  pluginKeyFromBasename(alias: PropertyID): PropertyID {
    const entry = Object.entries(this.config).find(([_, plugin]) => plugin.name === alias);
    if (!entry) return alias;
    return entry[0];
  }

  /**
   * Build the dependency graph for all plugins.
   * We'll use the basenames of the plugins in the graph.
   */
  private buildDependencyGraph(): void {
    debug('Building dependency graph...');
    
    // Initialize the graph with all plugins
    Object.keys(this.config).forEach(propertyId => {
      const pluginId = this.pluginBasenameFromKey(propertyId);
      this.dependencyGraph.set(pluginId, new Set());
      debug(`Added plugin node: ${pluginId} (from property: ${propertyId})`);
    });

    debug('Processing plugin dependencies...');
    // Add edges based on dependencies
    Object.entries(this.config).forEach(([propertyId, plugin]) => {
      const pluginId = plugin.name || propertyId;
      const deps = plugin.dependencies || [];
      
      if (deps.length === 0) {
        debug(`Plugin ${pluginId} has no dependencies`);
      } else {
        debug(`Plugin ${pluginId} depends on: ${deps.join(', ')}`);
      }

      deps.forEach((depId: string) => {
        // This dependency may have an alias in our current config
        const depKey = this.pluginKeyFromBasename(depId);
        debug(`Processing dependency: ${depId} (resolved to key: ${depKey}) for plugin ${pluginId}`);
        
        if (!this.config[depKey]) {
          const errorMsg = `Dependency ${depId} not found for plugin ${propertyId}`;
          debug(`Error: ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Add the dependency edge
        this.dependencyGraph.get(depId)?.add(pluginId);
        debug(`Added edge: ${depId} -> ${pluginId}`);
      });
    });
    
    // Log the final dependency graph
    const graphLog: Record<string, string[]> = {};
    this.dependencyGraph.forEach((deps, plugin) => {
      graphLog[plugin] = Array.from(deps);
    });
    
    debug('Dependency graph construction complete');
    debug(`Config: ${JSON.stringify(this.config, null, 2)}`);
    debug(`Dependency graph: ${JSON.stringify(graphLog, null, 2)}`);
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
   * @param entityState The state of the entity
   * @param dependencies The dependencies to resolve
   * 
   */
  private getDependencyStates(
    entityState: EntityState,
    plugin: ResolverPlugin<unknown, string>
  ): DependencyStates {
    const dependencyStates = {} as DependencyStates;

    for (const depId of plugin.dependencies || []) {
      const depKey = this.pluginKeyFromBasename(depId);
      const depPlugin = this.config[depKey];

      // TODO: If this is not a plugin, see if it's an entity property, and include it

      const depValue = entityState[depKey];
      debug(`depId: ${depId}, depKey: ${depKey}, depPlugin: ${JSON.stringify(depPlugin)}, depValue: ${JSON.stringify(depValue)}`)
      if (depValue) {
        // Resolve the dependency's dependencies first
        const depDependencies = this.getDependencyStates(
          entityState,
          depPlugin
        );
        
        // Resolve the dependency's state
        dependencyStates[depId] = depPlugin.resolve(
          depValue,
          depDependencies
        );
      }
    }
    
    return dependencyStates;
  }

  /**
   * Update the state with new deltas from the view
   */
  reducer(acc: Accumulator, {id: entityId, propertyDeltas}: LosslessViewOne): Accumulator {
    debug(`Processing deltas for entity: ${entityId}`);
    debug('Property deltas:', JSON.stringify(propertyDeltas));
    
    if (!acc[entityId]) {
      acc[entityId] = {};
    }
    const entityState = acc[entityId];

    // Now let's go through each plugin in order. 
    for (const pluginId of this.executionOrder) {
      const pluginKey = this.pluginKeyFromBasename(pluginId);
      const plugin = this.config[pluginKey];
      if (!plugin) throw new Error(`Plugin for property ${pluginId} not found`);

      debug(`Processing plugin: ${pluginId} (key: ${pluginKey})`);

      // We need to resolve dependencies, including entity properties that are not plugins.
      const dependencies = this.getDependencyStates(entityState, plugin);
      debug('Dependencies for', pluginId, ':', JSON.stringify(dependencies));

      // Initialize the plugin if it hasn't been initialized yet
      const pluginState = entityState[pluginKey] ?? plugin.initialize(dependencies);

      const deltaPropertyValues : Record<PropertyID, PropertyTypes> = {};
      let propertyValue : PropertyTypes | undefined;
      let updateDelta : CollapsedDelta | undefined;
      for (const [propertyId, deltas] of Object.entries(propertyDeltas)) {
        for (const delta of deltas) {
          // Iterate through the pointers; throw an error if a duplicate key is found
          for (const pointer of delta.pointers) {
            if (deltaPropertyValues[propertyId]) {
              // It's possible that there are multiple deltas in this set with the same property ID.
              // That can only happen if they are part of a transaction. Otherwise this function is
              // only called once per delta, per entity affected.
              throw new Error(`Duplicate property ID ${propertyId} found in delta ${delta.id}`);
            }
            deltaPropertyValues[propertyId] = pointer[propertyId];
            // If there's an updated entity property matching the plugin key, 
            // pass it to the plugin update as the new property value.
            if (propertyId === pluginKey) {
              propertyValue = pointer[propertyId];
              updateDelta = delta;
            }
          }
        }
      }

      // Update the plugin state with the new delta
      entityState[pluginKey] = plugin.update(pluginState, propertyValue, updateDelta, dependencies);
      debugState(`Updated entity state for ${entityId}:`, JSON.stringify(entityState[pluginKey]));
    }
    
    return acc;
  }

  resolver(acc: Accumulator, entityIds: DomainEntityID[]) {
    const result: Result = {}; 
    debug('Initial accumulator state:', JSON.stringify(acc));
    
    for (const entityId in acc) {
      if (!entityIds.includes(entityId)) continue;
      result[entityId] = {
        id: entityId,
        properties: {}
      };

      for (const propertyId of this.executionOrder) {
        const pluginKey = this.pluginKeyFromBasename(propertyId);
        const plugin = this.config[pluginKey];
        if (!plugin) throw new Error(`Plugin for property ${propertyId} not found`);
        
        debug(`Processing property: ${propertyId} (key: ${pluginKey})`);
        const dependencies = this.getDependencyStates(acc[entityId], plugin);
        debug(`Dependencies for ${propertyId}:`, JSON.stringify(dependencies));
        const state = acc[entityId][pluginKey] || plugin.initialize(dependencies);
        debug(`State for ${propertyId}:`, JSON.stringify(state));

        const resolvedValue = plugin.resolve(state, dependencies);
        if (resolvedValue === undefined) throw new Error(`Resolved value for property ${propertyId} is undefined`)
        
        debug(`Resolved value for ${propertyId}:`, resolvedValue);
        result[entityId].properties[pluginKey] = resolvedValue;
      }
    }
    
    return result;
  }
}
