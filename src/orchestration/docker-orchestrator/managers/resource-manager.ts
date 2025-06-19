import Debug from 'debug';
import { Container } from 'dockerode';
import { IResourceManager } from './interfaces';

const debug = Debug('rz:docker:resource-manager');

// Define the structure of the Docker stats object
interface ContainerStats {
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
      usage_in_kernelmode?: number;
      usage_in_usermode?: number;
    };
    system_cpu_usage: number;
    online_cpus?: number;
    throttling_data?: Record<string, unknown>;
  };
  precpu_stats: {
    cpu_usage: {
      total_usage: number;
      usage_in_kernelmode?: number;
      usage_in_usermode?: number;
    };
    system_cpu_usage: number;
    online_cpus?: number;
    throttling_data?: Record<string, unknown>;
  };
  memory_stats: {
    usage?: number;
    max_usage?: number;
    limit?: number;
    stats?: {
      total_rss?: number;
      [key: string]: unknown;
    };
    usage_in_bytes?: number;
    limit_in_bytes?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Type guard to check if an object is a Node.js ReadableStream
function isReadableStream(obj: unknown): obj is NodeJS.ReadableStream {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as any).pipe === 'function' &&
    typeof (obj as any).on === 'function'
  );
}

export class ResourceManager implements IResourceManager {
  private debug = debug.extend('ResourceManager');

  constructor() {
    this.debug('ResourceManager initialized');
  }

  async setResourceLimits(
    container: Container,
    limits: {
      cpu?: number;
      memory?: number;
      memorySwap?: number;
    } = {}
  ): Promise<void> {
    try {
      const updateConfig: any = {};

      if (limits.cpu !== undefined) {
        updateConfig.CpuShares = limits.cpu;
        updateConfig.NanoCpus = limits.cpu * 1e9; // Convert to nanoCPUs
      }

      if (limits.memory !== undefined) {
        updateConfig.Memory = limits.memory * 1024 * 1024; // Convert MB to bytes
        updateConfig.MemorySwap = limits.memorySwap !== undefined
          ? limits.memorySwap * 1024 * 1024
          : updateConfig.Memory; // Default to same as memory if not specified
      }

      if (Object.keys(updateConfig).length > 0) {
        await container.update(updateConfig);
      }
    } catch (error) {
      throw new Error(`Failed to set resource limits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getResourceUsage(container: Container): Promise<{
    cpu: { usage: number; limit: number };
    memory: { usage: number; limit: number };
  }> {
    try {
      this.debug('Getting container stats...');

      // Get container stats with stream:false to get a single stats object
      const stats = await container.stats({ stream: false });

      // Log the raw stats type and constructor for debugging
      this.debug('Raw stats type: %s', typeof stats);
      this.debug('Raw stats constructor: %s', stats?.constructor?.name);

      // Handle the response based on its type
      let statsData: ContainerStats;

      if (typeof stats === 'string') {
        // If it's a string, parse it as JSON
        this.debug('Stats is a string, parsing JSON');
        try {
          statsData = JSON.parse(stats) as ContainerStats;
        } catch (error) {
          this.debug('Failed to parse stats JSON: %o', error);
          throw new Error(`Failed to parse stats JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (stats && typeof stats === 'object') {
        // Check if it's a Node.js stream using our type guard
        if (isReadableStream(stats)) {
          this.debug('Stats is a stream, reading data...');
          // Convert the stream to a string and parse as JSON
          const statsString = await this.streamToString(stats);
          try {
            statsData = JSON.parse(statsString) as ContainerStats;
            this.debug('Successfully parsed streamed stats');
          } catch (error) {
            this.debug('Failed to parse streamed stats: %o', error);
            throw new Error(`Failed to parse streamed stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          // If it's already an object, use it directly
          this.debug('Stats is a plain object');
          statsData = stats as unknown as ContainerStats;
        }
      } else {
        throw new Error(`Unexpected stats type: ${typeof stats}`);
      }

      // Calculate and return the resource usage
      return this.calculateResourceUsage(statsData);
    } catch (error: unknown) {
      this.debug('Error in getResourceUsage: %o', error);
      // Return default values on error
      return {
        cpu: { usage: 0, limit: 0 },
        memory: { usage: 0, limit: 0 },
      };
    }
  }

  /**
   * Convert a ReadableStream to a string
   */
  private streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf8'));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(Buffer.from(chunk));
        } else {
          this.debug('Unexpected chunk type: %s', typeof chunk);
          reject(new Error(`Unexpected chunk type: ${typeof chunk}`));
        }
      });

      stream.on('end', () => {
        try {
          const result = Buffer.concat(chunks).toString('utf8');
          resolve(result);
        } catch (error) {
          this.debug('Error concatenating chunks: %o', error);
          reject(error);
        }
      });

      stream.on('error', (error: Error) => {
        this.debug('Error reading stream: %o', error);
        reject(error);
      });
    });
  }

  /**
   * Calculate resource usage from stats data
   */
  private calculateResourceUsage(statsData: ContainerStats): {
    cpu: { usage: number; limit: number };
    memory: { usage: number; limit: number };
  } {
    this.debug('Calculating resource usage from stats data');

    // Log detailed CPU stats if available
    if (statsData.cpu_stats) {
      this.debug('CPU stats: %o', {
        online_cpus: statsData.cpu_stats.online_cpus,
        cpu_usage: statsData.cpu_stats.cpu_usage,
        system_cpu_usage: statsData.cpu_stats.system_cpu_usage,
      });
    } else {
      this.debug('No CPU stats available');
    }

    // Log detailed memory stats if available
    if (statsData.memory_stats) {
      this.debug('Memory stats: %o', {
        usage: statsData.memory_stats.usage,
        max_usage: statsData.memory_stats.max_usage,
        limit: statsData.memory_stats.limit,
        stats: statsData.memory_stats.stats,
      });
    } else {
      this.debug('No memory stats available');
    }

    // Calculate CPU usage percentage
    let cpuPercent = 0;
    const cpuCores = statsData.cpu_stats?.online_cpus || 1;

    // Check if we have the necessary data for CPU calculation
    if (statsData.cpu_stats?.cpu_usage?.total_usage !== undefined &&
      statsData.precpu_stats?.cpu_usage?.total_usage !== undefined) {
      const cpuDelta = statsData.cpu_stats.cpu_usage.total_usage -
        (statsData.precpu_stats.cpu_usage.total_usage || 0);
      const systemDelta = statsData.cpu_stats.system_cpu_usage -
        (statsData.precpu_stats.system_cpu_usage || 0);

      this.debug('CPU delta: %d, System delta: %d', cpuDelta, systemDelta);

      if (systemDelta > 0 && cpuDelta > 0) {
        cpuPercent = (cpuDelta / systemDelta) * cpuCores * 100.0;
        this.debug('Calculated CPU percent: %d%%', cpuPercent);
      }
    } else {
      this.debug('Insufficient CPU stats data for calculation');
      this.debug('Available CPU stats: %o', statsData.cpu_stats);
      this.debug('Available precpu_stats: %o', statsData.precpu_stats);
    }

    // Get memory usage with fallbacks
    const memoryUsage = statsData.memory_stats?.usage ||
      statsData.memory_stats?.stats?.total_rss ||
      statsData.memory_stats?.usage_in_bytes ||
      0;

    const memoryLimit = statsData.memory_stats?.limit ||
      statsData.memory_stats?.max_usage ||
      statsData.memory_stats?.limit_in_bytes ||
      0;

    this.debug('Memory usage: %d / %d bytes', memoryUsage, memoryLimit);

    return {
      cpu: {
        usage: cpuPercent,
        limit: 100, // 100% CPU limit as a percentage
      },
      memory: {
        usage: memoryUsage,
        limit: memoryLimit || 0, // Ensure we don't return undefined
      },
    };
  }
}
