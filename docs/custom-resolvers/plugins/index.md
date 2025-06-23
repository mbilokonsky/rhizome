# Resolver Plugins

## Overview

Resolver plugins implement the core resolution logic for properties in the Custom Resolver system. Each plugin is responsible for:

1. Initializing its internal state
2. Processing updates to the property
3. Resolving the final value from the current state

## Plugin Lifecycle

1. **Initialization**: When a resolver is created, each plugin's `initialize()` method is called to set up its initial state.
2. **Update Processing**: For each new delta, the `update()` method is called with the current state, new value, and any dependency states.
3. **Resolution**: The `resolve()` method is called to produce the final value from the current state.

## Built-in Plugins

The system includes several common resolution strategies:

- [Last Write Wins](./builtin-plugins.md#last-write-wins)
- [First Write Wins](./builtin-plugins.md#first-write-wins)
- [Concatenation](./builtin-plugins.md#concatenation)
- [Majority Vote](./builtin-plugins.md#majority-vote)
- [Minimum Value](./builtin-plugins.md#min)
- [Maximum Value](./builtin-plugins.md#max)

## Creating Custom Plugins

See the [Creating Custom Plugins](./creating-plugins.md) guide for detailed information on implementing your own resolver plugins.
