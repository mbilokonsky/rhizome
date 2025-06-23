import { PropertyID, PropertyTypes } from "../../../core/types";
import { CollapsedDelta } from "../../lossless";

/**
 * Plugin interface for custom resolvers
 */
export interface ResolverPlugin<T = unknown> {
  name: string;

  /**
   * Array of property IDs that this plugin depends on.
   * These properties will be processed before this plugin.
   */
  dependencies?: PropertyID[];

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
    allStates?: Record<PropertyID, unknown>
  ): T;

  /**
   * Resolve the final value from the accumulated state
   */
  resolve(
    state: T,
    allStates?: Record<PropertyID, unknown>
  ): PropertyTypes | undefined;
}

/**
 * Configuration for custom resolver
 */
export type CustomResolverConfig = {
  [propertyId: PropertyID]: ResolverPlugin;
};
