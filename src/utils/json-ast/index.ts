import { JsonValue, JsonNode, JsonAstOptions } from './types';

/**
 * Convert a JSON value to an Abstract Syntax Tree (AST)
 * @param json The JSON value to convert
 * @param options Configuration options
 * @param currentPath Internal use: current path in the JSON structure
 * @param depth Internal use: current depth in the JSON structure
 * @returns The root node of the AST
 */
export function jsonToAst(
  json: JsonValue,
  options: JsonAstOptions = {},
  currentPath: string = '',
  depth: number = 0
): JsonNode {
  const { includePath = true, maxDepth = 100, filter } = options;
  
  // Handle max depth
  if (depth > maxDepth) {
    return { 
      type: typeof json === 'object' && json !== null ? 'object' : typeof json as 'string' | 'number' | 'boolean' | 'object',
      value: '[Max depth exceeded]',
      ...(includePath && currentPath ? { path: currentPath } : {})
    };
  }

  // Handle null
  if (json === null) {
    return createNode('null', null, currentPath, includePath);
  }

  // Handle primitive types
  const type = typeof json as 'string' | 'number' | 'boolean' | 'object';
  if (type !== 'object') {
    return createNode(type, json, currentPath, includePath);
  }

  // Handle arrays
  if (Array.isArray(json)) {
    const node: JsonNode = {
      type: 'array',
      children: json
        .map((item, index) => {
          const childPath = includePath ? `${currentPath}[${index}]` : '';
          return jsonToAst(item, options, childPath, depth + 1);
        })
    };
    
    if (includePath && currentPath) {
      node.path = currentPath;
    }
    
    return node;
  }

  // Handle objects
  const children: JsonNode[] = [];
  for (const [key, value] of Object.entries(json)) {
    const childPath = includePath 
      ? currentPath ? `${currentPath}.${key}` : key 
      : '';
      
    const childNode = jsonToAst(value, options, childPath, depth + 1);
    childNode.key = key;
    children.push(childNode);
  }

  const node: JsonNode = { 
    type: 'object',
    children: filter ? children.filter(filter) : children 
  };
  
  if (includePath && currentPath) {
    node.path = currentPath;
  }
  
  return node;
}

/**
 * Create a new AST node with the given properties
 */
function createNode(
  type: JsonNode['type'],
  value: JsonValue,
  path: string = '',
  includePath: boolean = true
): JsonNode {
  const node: JsonNode = { type, value };
  if (includePath && path) {
    node.path = path;
  }
  return node;
}

