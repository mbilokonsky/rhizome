import { RhizomeNode } from '@src';
import { Lossless } from '@src/views/lossless';
import { Delta } from '@src/core/delta';
import { createDelta } from '@src/core/delta-builder';
import { CustomResolver } from '@src/views/resolvers/custom-resolvers';
import { ResolverPlugin } from '@src/views/resolvers/custom-resolvers/plugin';
import Debug from 'debug';
const debug = Debug('rz:test:resolver-test-helper');

// Define a test plugin map that enforces string dependencies
type TestPluginMap = {
  [key: string]: ResolverPlugin<unknown>;
};

interface TestHelperOptions<T extends TestPluginMap> {
  entityId?: string;
  plugins: T;
  deltas: Delta[];
}

export async function testResolverWithPlugins<T extends TestPluginMap>(
  options: TestHelperOptions<T>
) {
  const {
    entityId = 'test-entity',
    plugins,
    deltas,
  } = options;

  // Setup test environment
  const node = new RhizomeNode();
  const lossless = new Lossless(node);
  const view = new CustomResolver(lossless, plugins);

  // Ingest all deltas through the lossless instance
  for (const delta of deltas) {
    lossless.ingestDelta(delta);
  }

  // Get the resolved view
  const resolvedView = view.resolve([entityId]);
  if (!resolvedView) throw new Error(`Resolved view for entity ${entityId} is undefined`);
  debug(`Resolved view for entity ${entityId}:`, JSON.stringify(resolvedView));
  return resolvedView[entityId];
}

/**
 * Helper to create a test delta with proper typing
 * @param creator The creator of the delta
 * @param host The host of the delta
 * @returns A test delta
 */
export function createTestDelta(creator = 'user1',  host = 'host1') {
  return createDelta(creator, host);
}
