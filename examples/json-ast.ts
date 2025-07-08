import { jsonToAst } from '../src/utils/json-ast/index';
import { JsonNode } from '../src/utils/json-ast/types';
import Debug from 'debug';
const debug = Debug('rz:json-ast');

// Example JSON data
const exampleJson = {
  name: "John Doe",
  age: 42,
  active: true,
  scores: [95, 87, 92],
  address: {
    street: "123 Main St",
    city: "Anytown",
    coordinates: {
      lat: 42.1234,
      lng: -71.2345
    }
  },
  tags: ["admin", "user", "premium"],
  metadata: {
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: "2023-06-21T12:34:56Z"
  }
};

// Convert JSON to AST with path information
const ast = jsonToAst(exampleJson, { 
  includePath: true,
  maxDepth: 10,
  // Optional filter - only include nodes with paths that include 'address'
  // filter: (node) => !node.path || node.path.includes('address')
});

debug("Original JSON:", JSON.stringify(exampleJson, null, 2));

debug("\nAST:", JSON.stringify(ast, null, 2));

// Example of traversing the AST
function traverse(node: JsonNode, indent = 0) {
  const padding = '  '.repeat(indent);
  const type = node.type.toUpperCase();
  const value = node.value !== undefined ? `: ${JSON.stringify(node.value)}` : '';
  const path = node.path ? ` [${node.path}]` : '';
  
  debug(`${padding}${type}${value}${path}`);
  
  if (node.children) {
    node.children.forEach((child: JsonNode) => traverse(child, indent + 2));
  }
}

debug('\nTraversed AST:');
traverse(ast);
