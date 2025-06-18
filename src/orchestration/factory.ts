import { NodeOrchestrator, OrchestratorType } from './types';
import { DockerOrchestrator } from './docker-orchestrator';
import { TestOrchestrator } from './test-orchestrator';

/**
 * Factory function to create an appropriate orchestrator based on environment
 */
export function createOrchestrator(
  type: OrchestratorType = 'in-memory',
  options?: any
): NodeOrchestrator {
  switch (type) {
    case 'docker':
      return new DockerOrchestrator(options);
    case 'kubernetes':
      throw new Error('Kubernetes orchestrator not yet implemented');
    case 'in-memory':
    default:
      return new TestOrchestrator();
  }
}
