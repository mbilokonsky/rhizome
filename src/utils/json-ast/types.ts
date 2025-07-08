export type JsonValue = 
  | string 
  | number 
  | boolean 
  | null 
  | JsonValue[] 
  | { [key: string]: JsonValue };

export interface JsonNode {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  value?: any;
  children?: JsonNode[];
  key?: string;
  path?: string; // Path to this node in the JSON (e.g., 'address.city')
}

export interface JsonAstOptions {
  includePath?: boolean;  // Whether to include path information in nodes
  maxDepth?: number;      // Maximum depth to traverse
  filter?: (node: JsonNode) => boolean; // Optional filter function
}
