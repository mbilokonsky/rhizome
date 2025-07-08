import { PropertyID, PropertyTypes } from "../../../core/types";
import { CollapsedDelta } from "../../lossless";
import Debug from 'debug';
const debug = Debug('rz:custom-resolver:plugin');

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
export abstract class ResolverPlugin< T = unknown > {
  name?: string;
  dependencies?: readonly string[];

  constructor(readonly target?: string) {
    if (target) {
      this.dependencies = [target];
    }
  }


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
    debug(`applyUpdate, currentState: ${JSON.stringify(currentState)}, newValue: ${JSON.stringify(newValue)}, dependencies: ${JSON.stringify(dependencies)}`)
    if (newValue === undefined) {
      debug(`No new value, checking dependencies. Plugin target is ${JSON.stringify(this.target)}`)
      if (this.target && dependencies) {
        // Pass the target value as the new value
        newValue = dependencies[this.target] as PropertyTypes;
        debug(`Found target ${JSON.stringify(this.target)}, value: ${JSON.stringify(newValue)}`)
      } else if (!this.dependencies?.length) {
        // No dependencies, no new value -- nothing to do.
        debug(`No dependencies, no new value -- nothing to do.`)
        return currentState;
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
  [P in PropertyID]: ResolverPlugin<unknown>;
};

/**
 * Helper type to extract the state type from a ResolverPlugin
 */
export type PluginState<T> = T extends ResolverPlugin<infer S> ? S : never;

/**
 * Helper type to extract the dependency names from a ResolverPlugin
 */
export type PluginDependencies<T> = T extends ResolverPlugin<unknown> ? string[] : never;
