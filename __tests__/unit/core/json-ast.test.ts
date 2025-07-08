import { jsonToAst } from '@src/utils/json-ast';
import { JsonNode } from '@src/utils/json-ast/types';

describe('jsonToAst', () => {
  test('should handle primitive values', () => {
    expect(jsonToAst(42)).toMatchObject({
      type: 'number',
      value: 42
    });

    expect(jsonToAst('test')).toMatchObject({
      type: 'string',
      value: 'test'
    });

    expect(jsonToAst(true)).toMatchObject({
      type: 'boolean',
      value: true
    });

    expect(jsonToAst(null)).toMatchObject({
      type: 'null',
      value: null
    });
  });

  test('should handle empty objects and arrays', () => {
    const emptyObj = jsonToAst({});
    expect(emptyObj).toMatchObject({
      type: 'object',
      children: []
    });

    const emptyArray = jsonToAst([]);
    expect(emptyArray).toMatchObject({
      type: 'array',
      children: []
    });
  });

  test('should handle nested objects', () => {
    const ast = jsonToAst({
      name: 'test',
      nested: { value: 42 }
    });

    expect(ast.type).toBe('object');
    expect(ast.children).toHaveLength(2);
    
    const nameNode = ast.children?.[0];
    const nestedNode = ast.children?.[1];
    
    expect(nameNode).toMatchObject({
      type: 'string',
      key: 'name',
      value: 'test'
    });

    expect(nestedNode).toMatchObject({
      type: 'object',
      key: 'nested'
    });

    expect(nestedNode?.children?.[0]).toMatchObject({
      type: 'number',
      key: 'value',
      value: 42
    });
  });

  test('should handle arrays', () => {
    const ast = jsonToAst([1, 'two', true]);
    
    expect(ast.type).toBe('array');
    expect(ast.children).toHaveLength(3);
    
    expect(ast.children?.[0]).toMatchObject({
      type: 'number',
      value: 1
    });
    
    expect(ast.children?.[1]).toMatchObject({
      type: 'string',
      value: 'two'
    });
    
    expect(ast.children?.[2]).toMatchObject({
      type: 'boolean',
      value: true
    });
  });

  test('should include paths when includePath is true', () => {
    const ast = jsonToAst({
      user: {
        name: 'test',
        roles: ['admin', 'user']
      }
    }, { includePath: true });

    const findNode = (node: JsonNode, key: string): JsonNode | undefined => {
      if (node.key === key) return node;
      if (!node.children) return undefined;
      for (const child of node.children) {
        const found = findNode(child, key);
        if (found) return found;
      }
      return undefined;
    };

    const nameNode = findNode(ast, 'name');
    const rolesNode = findNode(ast, 'roles');
    
    expect(nameNode?.path).toBe('user.name');
    expect(rolesNode?.path).toBe('user.roles');
    expect(rolesNode?.children?.[0].path).toBe('user.roles[0]');
  });

  test('should respect maxDepth option', () => {
    const deepObject = {
      level1: {
        level2: {
          level3: {
            value: 'too deep'
          }
        }
      }
    };

    const ast = jsonToAst(deepObject, { 
      maxDepth: 2,
      includePath: true 
    });

    const level2 = ast.children?.[0].children?.[0];
    expect(level2?.type).toBe('object');
    // The implementation sets value to undefined when max depth is exceeded
    expect(level2?.value).toBeUndefined();
    expect(level2?.path).toBe('level1.level2');
  });

  test('should apply filter function when provided', () => {
    const data = {
      name: 'test',
      age: 42,
      active: true,
      address: {
        street: '123 Main St',
        city: 'Anytown'
      }
    };

    // Only include string and number values
    const ast = jsonToAst(data, {
      filter: (node: JsonNode) => 
        node.type === 'string' || 
        node.type === 'number' ||
        node.type === 'object' // Keep objects to maintain structure
    });

    // Should have filtered out the boolean 'active' field
    expect(ast.children).toHaveLength(3);
    expect(ast.children?.some((c: any) => c.key === 'active')).toBe(false);
    
    // Nested object should only have string properties
    const addressNode = ast.children?.find((c: any) => c.key === 'address');
    expect(addressNode?.children).toHaveLength(2);
    expect(addressNode?.children?.every((c: any) => 
      c.type === 'string' || c.key === 'city' || c.key === 'street'
    )).toBe(true);
  });
});
