import { PropertyID, PropertyTypes } from "../../../core/types";
import { CollapsedDelta } from "../../lossless";

/**
 * Type representing a mapping of dependency names to their state types
 */
export type DependencyStates<D extends string> = {
  [K in D]: unknown;
};

/**
 * Plugin interface for custom resolvers with type-safe dependencies
 * @template T - Type of the plugin's internal state
 * @template D - Union type of dependency names (e.g., 'discount' | 'tax')
 */
export interface ResolverPlugin<
  T = unknown,
  D extends string = never
> {
  name: string;

  /**
   * Array of property IDs that this plugin depends on.
   * These properties will be processed before this plugin.
   */
  dependencies?: readonly D[];

  /**
   * Initialize the state for a property
   */
  initialize(): T;

  /**
   * Process a new value for the property
   */
  update(
    currentState: T,
    newValue: PropertyTypes,
    delta: CollapsedDelta,
    dependencies: DependencyStates<D>
  ): T;

  /**
   * Resolve the final value from the accumulated state
   */
  resolve(
    state: T,
    dependencies: DependencyStates<D>
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
