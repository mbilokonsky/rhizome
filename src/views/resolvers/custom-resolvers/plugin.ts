import { PropertyID, PropertyTypes } from "../../../core/types";
import { CollapsedDelta } from "../../lossless";

/**
 * Type representing a mapping of dependency names to their state types
 */
// export type DependencyStates = {
//   [K in D]: unknown;
// };

export type DependencyStates = Record<string, unknown>;

/**
 * Plugin interface for custom resolvers with type-safe dependencies
 * @template T - Type of the plugin's internal state
 * @template D - Union type of dependency names (e.g., 'discount' | 'tax')
 */
export abstract class ResolverPlugin<
  T = unknown,
  D extends string = never
> {

  name?: PropertyID;

  /**
   * Array of property IDs that this plugin depends on.
   * The plugins corresponding to these properties will be processed before this plugin.
   */
  dependencies?: readonly D[];

  /**
   * Convenience wrapper to avoid calling update() when there is no new value
   * @param currentState The current state of the plugin
   * @param newValue The new value to apply
   * @param delta The delta that triggered the update
   * @param dependencies The dependencies of the plugin
   * @returns The updated state
   */
  applyUpdate(
    currentState: T,
    newValue?: PropertyTypes,
    delta?: CollapsedDelta,
    dependencies?: DependencyStates
  ): T {
    if (newValue === undefined) {
      switch(this.dependencies?.length) {
        case 0: {
          // No dependencies, no new value -- nothing to do.
          return currentState;
        }
        case 1: {
          // Only one dependency, use it as the new value.
          newValue = dependencies![this.dependencies[0]] as PropertyTypes;
          break;
        }
        default: {
          // Pass dependencies as is, and leave newValue undefined.
          break;
        }
      }
    }
    return this.update(currentState, newValue, delta, dependencies);
  };

  /**
   * Initialize the state for a property
   */
  abstract initialize(
    dependencies: DependencyStates
  ): T;

  /**
   * Process a new value for the property
   */
  protected abstract update(
    currentState: T,
    newValue?: PropertyTypes,
    delta?: CollapsedDelta,
    dependencies?: DependencyStates
  ): T;

  /**
   * Resolve the final value from the accumulated state
   */
  abstract resolve(
    state: T,
    dependencies: DependencyStates
  ): PropertyTypes | undefined;
}

/**
 * Configuration for custom resolver with type-safe plugin configurations
 */
export type CustomResolverConfig = {
  [P in PropertyID]: ResolverPlugin<unknown, string>;
};

/**
 * Helper type to extract the state type from a ResolverPlugin
 */
export type PluginState<T> = T extends ResolverPlugin<infer S, string> ? S : never;

/**
 * Helper type to extract the dependency names from a ResolverPlugin
 */
export type PluginDependencies<T> = T extends ResolverPlugin<unknown, infer D> ? D : never;
