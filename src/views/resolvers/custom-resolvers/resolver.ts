import { EntityProperties } from "../../../core/entity";
import { CollapsedDelta, Lossless, LosslessViewOne } from "../../lossless";
import { Lossy } from '../../lossy';
import { DomainEntityID, PropertyID, PropertyTypes, ViewMany } from "../../../core/types";
import { ResolverPlugin } from "./plugin";

type PropertyState = {
  plugin: ResolverPlugin;
  state: unknown;
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

type CustomResolverResult = ViewMany<{
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

export class CustomResolver extends Lossy<CustomResolverAccumulator, CustomResolverResult> {
  private executionOrder: PropertyID[];
  private readonly config: Record<PropertyID, ResolverPlugin>;

  constructor(
    lossless: Lossless,
    config: Record<PropertyID, ResolverPlugin>
  ) {
    super(lossless);
    this.config = config;
    this.validateDependencies();
    this.executionOrder = this.getExecutionOrder();
  }

  initializer(view: LosslessViewOne): CustomResolverAccumulator {
    return {
      [view.id]: { id: view.id, properties: {} }
    };
  }

  /**
   * Validates that there are no circular dependencies between plugins
   * @throws Error if circular dependencies are detected
   */
  private validateDependencies(): void {
    const visited = new Set<PropertyID>();
    const visiting = new Set<PropertyID>();
    const plugins = Object.entries(this.config);
    
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
      for (const dep of plugin?.dependencies || []) {
        if (this.config[dep]) {
          visit(dep);
        } else {
          throw new Error(`Plugin '${pluginId}' depends on unknown property: ${dep}`);
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
      for (const dep of plugin.dependencies || []) {
        visit(dep);
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

  public reducer(
    acc: CustomResolverAccumulator,
    cur: LosslessViewOne
  ): CustomResolverAccumulator {
    if (!acc[cur.id]) {
      acc[cur.id] = { id: cur.id, properties: {} };
    }
    
    // Get the execution order based on dependencies
    const executionOrder = this.getExecutionOrder();
    
    // First pass: collect all current states for this entity
    const allStates: Record<PropertyID, unknown> = {};
    for (const [propertyId, propertyState] of Object.entries(acc[cur.id].properties)) {
      allStates[propertyId] = propertyState.state;
    }

    // Process each property in dependency order
    for (const propertyId of executionOrder) {
      const deltas = cur.propertyDeltas[propertyId];
      if (!deltas) continue;
      
      const plugin = this.config[propertyId];
      if (!plugin) continue;

      // Initialize property state if it doesn't exist
      if (!acc[cur.id].properties[propertyId]) {
        acc[cur.id].properties[propertyId] = {
          plugin,
          state: plugin.initialize()
        };
        allStates[propertyId] = acc[cur.id].properties[propertyId].state;
      }

      // Process each delta for this property
      const propertyState = acc[cur.id].properties[propertyId];
      for (const delta of deltas) {
        const value = extractValueFromDelta(propertyId, delta);
        if (value !== undefined) {
          propertyState.state = propertyState.plugin.update(
            propertyState.state,
            value,
            delta,
            allStates
          );
          // Update the state in our tracking object
          allStates[propertyId] = propertyState.state;
        }
      }
    }
    
    // Handle any properties not in the execution order (shouldn't normally happen)
    for (const [propertyId, _deltas] of Object.entries(cur.propertyDeltas)) {
      if (!executionOrder.includes(propertyId) && this.config[propertyId]) {
        console.warn(`Property '${propertyId}' not in execution order but has deltas`);
      }
    }

    return acc;
  }

  resolver(cur: CustomResolverAccumulator): CustomResolverResult {
    const res: CustomResolverResult = {};

    for (const [entityId, entity] of Object.entries(cur)) {
      const entityResult: { id: string; properties: EntityProperties } = { id: entityId, properties: {} };

      // First pass: collect all states for this entity
      const allStates: Record<PropertyID, unknown> = {};
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        allStates[propertyId] = propertyState.state;
      }

      // Second pass: resolve each property with access to all states
      for (const [propertyId, propertyState] of Object.entries(entity.properties)) {
        const resolvedValue = propertyState.plugin.resolve(
          propertyState.state,
          allStates
        );
        // Only add the property if the resolved value is not undefined
        if (resolvedValue !== undefined) {
          entityResult.properties[propertyId] = resolvedValue;
        }
      }

      // Only include entities that have at least one resolved property
      if (Object.keys(entityResult.properties).length > 0) {
        res[entityId] = entityResult;
      }
    }

    return res;
  }
}
