# Entity Relationship Graph

## Background

Deltas can express relationships by declaring a domain entity for the relationship itself.

Our initial implementation assumes there is only one structure for a relationship: a directed edge from one entity to another.
- `source` and `target` are required properties.
- `type` as well as arbitrary additional properties are optional.

Future work may allow for more complex relationships.

## Goal

Resolve a graph of relationships among entities.

## Discussion of Strategy

### Lossy View Composition




