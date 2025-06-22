# JSON AST (Abstract Syntax Tree)

JSON AST is a representation of a JSON object as a tree of nodes.

The following is obtained from running

    ts-node examples/json-ast.ts

## Original JSON:
```json
{
  "name": "John Doe",
  "age": 42,
  "active": true,
  "scores": [
    95,
    87,
    92
  ],
  "address": {
    "street": "123 Main St",
    "city": "Anytown",
    "coordinates": {
      "lat": 42.1234,
      "lng": -71.2345
    }
  },
  "tags": [
    "admin",
    "user",
    "premium"
  ],
  "metadata": {
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-06-21T12:34:56Z"
  }
}
```

## AST:
```json
{
  "type": "object",
  "children": [
    {
      "type": "string",
      "value": "John Doe",
      "path": "name",
      "key": "name"
    },
    {
      "type": "number",
      "value": 42,
      "path": "age",
      "key": "age"
    },
    {
      "type": "boolean",
      "value": true,
      "path": "active",
      "key": "active"
    },
    {
      "type": "array",
      "children": [
        {
          "type": "number",
          "value": 95,
          "path": "scores[0]"
        },
        {
          "type": "number",
          "value": 87,
          "path": "scores[1]"
        },
        {
          "type": "number",
          "value": 92,
          "path": "scores[2]"
        }
      ],
      "path": "scores",
      "key": "scores"
    },
    {
      "type": "object",
      "children": [
        {
          "type": "string",
          "value": "123 Main St",
          "path": "address.street",
          "key": "street"
        },
        {
          "type": "string",
          "value": "Anytown",
          "path": "address.city",
          "key": "city"
        },
        {
          "type": "object",
          "children": [
            {
              "type": "number",
              "value": 42.1234,
              "path": "address.coordinates.lat",
              "key": "lat"
            },
            {
              "type": "number",
              "value": -71.2345,
              "path": "address.coordinates.lng",
              "key": "lng"
            }
          ],
          "path": "address.coordinates",
          "key": "coordinates"
        }
      ],
      "path": "address",
      "key": "address"
    },
    {
      "type": "array",
      "children": [
        {
          "type": "string",
          "value": "admin",
          "path": "tags[0]"
        },
        {
          "type": "string",
          "value": "user",
          "path": "tags[1]"
        },
        {
          "type": "string",
          "value": "premium",
          "path": "tags[2]"
        }
      ],
      "path": "tags",
      "key": "tags"
    },
    {
      "type": "object",
      "children": [
        {
          "type": "string",
          "value": "2023-01-01T00:00:00Z",
          "path": "metadata.createdAt",
          "key": "createdAt"
        },
        {
          "type": "string",
          "value": "2023-06-21T12:34:56Z",
          "path": "metadata.updatedAt",
          "key": "updatedAt"
        }
      ],
      "path": "metadata",
      "key": "metadata"
    }
  ]
}
```

## Traversed AST:
```text
OBJECT
    STRING: "John Doe" [name]
    NUMBER: 42 [age]
    BOOLEAN: true [active]
    ARRAY [scores]
        NUMBER: 95 [scores[0]]
        NUMBER: 87 [scores[1]]
        NUMBER: 92 [scores[2]]
    OBJECT [address]
        STRING: "123 Main St" [address.street]
        STRING: "Anytown" [address.city]
        OBJECT [address.coordinates]
            NUMBER: 42.1234 [address.coordinates.lat]
            NUMBER: -71.2345 [address.coordinates.lng]
    ARRAY [tags]
        STRING: "admin" [tags[0]]
        STRING: "user" [tags[1]]
        STRING: "premium" [tags[2]]
    OBJECT [metadata]
        STRING: "2023-01-01T00:00:00Z" [metadata.createdAt]
        STRING: "2023-06-21T12:34:56Z" [metadata.updatedAt]
```
