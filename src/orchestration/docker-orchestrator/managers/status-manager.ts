import { Container } from 'dockerode';
import { IStatusManager } from './interfaces';
import { NodeHandle, NodeStatus } from '../../types';
import Debug from 'debug';

const debug = Debug('rz:docker:status-manager');

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 1000;
const MAX_BACKOFF_MS = 30000; // 30 seconds max backoff

export class StatusManager implements IStatusManager {
  async waitForNodeReady(
    container: Container,
    port: number,
    maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    initialDelayMs: number = DEFAULT_DELAY_MS
  ): Promise<void> {
    debug(`[waitForNodeReady] Starting with port ${port}, maxAttempts: ${maxAttempts}, initialDelayMs: ${initialDelayMs}`);
    let lastError: Error | null = null;
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < maxAttempts) {
      attempt++;
      const attemptStartTime = Date.now();
      
      try {
        debug(`[Attempt ${attempt}/${maxAttempts}] Verifying container is running...`);
        
        // Add timeout to verifyContainerRunning
        const verifyPromise = this.verifyContainerRunning(container);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('verifyContainerRunning timed out')), 10000)
        );
        
        await Promise.race([verifyPromise, timeoutPromise]);
        debug(`[Attempt ${attempt}/${maxAttempts}] Container is running`);
        
        const healthUrl = `http://localhost:${port}/api/health`;
        debug(`[Attempt ${attempt}/${maxAttempts}] Checking health at: ${healthUrl}`);
        
        // Add timeout to health check
        const healthCheckPromise = this.healthCheck(healthUrl);
        const healthCheckTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timed out')), 10000)
        );
        
        const response = await Promise.race([healthCheckPromise, healthCheckTimeout]);
        
        if (response.ok) {
          debug(`✅ Node is ready! (Attempt ${attempt}/${maxAttempts})`);
          return; // Success!
        }
        
        throw new Error(`Health check failed with status: ${response.status}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        const attemptDuration = Date.now() - attemptStartTime;
        debug(`[Attempt ${attempt}/${maxAttempts}] Failed after ${attemptDuration}ms: %s`, errorMessage);
        
        // Log container state on error
        try {
          const containerInfo = await container.inspect();
          debug(`[Container State] Status: ${containerInfo.State.Status}, Running: ${containerInfo.State.Running}, ExitCode: ${containerInfo.State.ExitCode}`);
          
          // Log recent container logs on error
          if (containerInfo.State.Running) {
            try {
              const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 20,
                timestamps: true,
              });
              debug(`[Container Logs] Last 20 lines:\n${logs.toString()}`);
            } catch (logError) {
              debug('Failed to get container logs: %o', logError);
            }
          }
        } catch (inspectError) {
          debug('Failed to inspect container: %o', inspectError);
        }
        
        // Exponential backoff with jitter, but don't wait if we're out of attempts
        if (attempt < maxAttempts) {
          const jitter = Math.random() * 1000; // Add up to 1s of jitter
          const backoff = Math.min(delay + jitter, MAX_BACKOFF_MS);
          debug(`[Backoff] Waiting ${Math.round(backoff)}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          delay = Math.min(delay * 2, MAX_BACKOFF_MS); // Double the delay for next time, up to max
        }
      }
    }
    
    // If we get here, all attempts failed
    const errorMessage = `Node did not become ready after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`;
    debug('❌ %s', errorMessage);
    
    // Final attempt to get container logs before failing
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: true,
        follow: false
      });
      debug('=== FINAL CONTAINER LOGS ===\n%s\n=== END CONTAINER LOGS ===', logs.toString());
    } catch (logError) {
      debug('Failed to get final container logs: %o', logError);
    }
    
    throw new Error(errorMessage);
  }

  async healthCheck(healthUrl: string): Promise<{ ok: boolean; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(healthUrl, {
        headers: { 
          'Accept': 'application/json',
          'Connection': 'close'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      return {
        ok: response.ok,
        status: response.status
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Health check timed out after 5000ms (${healthUrl})`);
      }
      throw error;
    }
  }

  mapContainerState(state: string): NodeStatus['status'] {
    if (!state) return 'error';
    
    const stateLower = state.toLowerCase();
    if (['created', 'restarting'].includes(stateLower)) return 'starting';
    if (stateLower === 'running') return 'running';
    if (stateLower === 'paused') return 'stopping';
    if (['dead', 'exited', 'stopped'].includes(stateLower)) return 'stopped';
    
    return 'error';
  }

  private async verifyContainerRunning(container: Container): Promise<void> {
    debug('[verifyContainerRunning] Checking container status...');
    
    try {
      const data = await container.inspect();
      debug('[verifyContainerRunning] Container inspect data:', JSON.stringify({
        Id: data.Id,
        Name: data.Name,
        State: data.State,
        Config: {
          Image: data.Config?.Image,
          Env: data.Config?.Env?.filter(env => env.startsWith('NODE_') || env.startsWith('DEBUG')),
          Cmd: data.Config?.Cmd
        },
        HostConfig: {
          Memory: data.HostConfig?.Memory,
          NanoCpus: data.HostConfig?.NanoCpus,
          NetworkMode: data.HostConfig?.NetworkMode
        }
      }, null, 2));
      
      if (!data.State.Running) {
        const errorMessage = `Container is not running. Status: ${data.State.Status}, ExitCode: ${data.State.ExitCode}, Error: ${data.State.Error}`;
        debug(`[verifyContainerRunning] ${errorMessage}`);
        
        // Try to get container logs for more context
        try {
          const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 50 // Get last 50 lines of logs
          });
          debug('[verifyContainerRunning] Container logs:', logs.toString());
        } catch (logError) {
          debug('[verifyContainerRunning] Failed to get container logs:', logError);
        }
        
        throw new Error(errorMessage);
      }
      
      debug('[verifyContainerRunning] Container is running');
    } catch (error) {
      debug('[verifyContainerRunning] Error checking container status:', error);
      throw error;
    }
  }

  /**
   * Get the status of a node including container status, network info, and resource usage
   * @param handle The node handle containing node metadata
   * @param container The Docker container instance
   * @returns A promise that resolves to the node status
   */
  async getNodeStatus(handle: NodeHandle, container: Container): Promise<NodeStatus> {
    // Default error status for when container is not found or other errors occur
    const errorStatus: NodeStatus = {
      id: handle.id,
      status: 'error',
      error: 'Failed to get node status',
      network: {
        address: '',
        httpPort: 0,
        requestPort: 0,
        peers: []
      },
      resources: {
        cpu: { usage: 0, limit: 0 },
        memory: { usage: 0, limit: 0 }
      }
    };

    try {
      // Get container info
      const containerInfo = await container.inspect();
      
      // Get request port once since we use it multiple times
      const requestPort = handle.getRequestPort?.() || 0;
      
      // Initialize with default values
      const status: NodeStatus = {
        id: handle.id, // Use the node ID from handle
        containerId: container.id,
        status: this.mapContainerState(containerInfo.State?.Status || ''),
        network: {
          address: containerInfo.NetworkSettings?.IPAddress || '',
          httpPort: requestPort,
          requestPort: requestPort,
          peers: [],
          networkId: ''
        },
        resources: {
          cpu: { usage: 0, limit: 0 },
          memory: { usage: 0, limit: 0 }
        }
      };

      // Update network info if available
      if (containerInfo.NetworkSettings?.Networks) {
        const network = Object.values(containerInfo.NetworkSettings.Networks)[0];
        if (network) {
          // Ensure we have existing network values or use defaults
          const currentNetwork = status.network || {
            address: '',
            httpPort: 0,
            requestPort: 0,
            peers: []
          };
          
          // Create a new network object with all required properties
          status.network = {
            address: network.IPAddress || currentNetwork.address,
            httpPort: currentNetwork.httpPort,
            requestPort: currentNetwork.requestPort,
            peers: currentNetwork.peers,
            networkId: network.NetworkID || ''
          };
        }
      }

      // Get container stats for resource usage
      try {
        const stats = await container.stats({ stream: false });
        const statsData = JSON.parse(stats.toString());
        
        if (statsData?.cpu_stats?.cpu_usage) {
          status.resources!.cpu.usage = statsData.cpu_stats.cpu_usage.total_usage || 0;
          status.resources!.cpu.limit = (statsData.cpu_stats.online_cpus || 0) * 1e9; // Convert to nanoCPUs
        }
        
        if (statsData?.memory_stats) {
          status.resources!.memory.usage = statsData.memory_stats.usage || 0;
          status.resources!.memory.limit = statsData.memory_stats.limit || 0;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debug(`Failed to get container stats for ${container.id}: %s`, errorMessage);
        // Update status with error but don't return yet
        status.status = 'error';
        status.error = `Failed to get container stats: ${errorMessage}`;
      }
      
      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug(`Error getting node status for ${handle.id}: %s`, errorMessage);
      
      return {
        ...errorStatus,
        id: handle.id,
        error: errorMessage,
        status: 'error'
      };
    }
  }
}
