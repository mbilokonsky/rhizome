import Docker, { Container } from 'dockerode';
import { IResourceManager } from './interfaces';

export class ResourceManager implements IResourceManager {
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
      const stats = await container.stats({ stream: false });
      const statsData = JSON.parse(stats.toString());
      
      const cpuDelta = statsData.cpu_stats.cpu_usage.total_usage - (statsData.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta = statsData.cpu_stats.system_cpu_usage - (statsData.precpu_stats?.system_cpu_usage || 0);
      const cpuCores = statsData.cpu_stats.online_cpus || 1;
      
      let cpuPercent = 0;
      if (systemDelta > 0 && cpuDelta > 0) {
        cpuPercent = (cpuDelta / systemDelta) * cpuCores * 100.0;
      }
      
      return {
        cpu: {
          usage: parseFloat(cpuPercent.toFixed(2)),
          limit: cpuCores * 100, // Percentage of total CPU
        },
        memory: {
          usage: statsData.memory_stats.usage || 0,
          limit: statsData.memory_stats.limit || 0,
        },
      };
    } catch (error) {
      console.error('Error getting resource usage:', error);
      return {
        cpu: { usage: 0, limit: 0 },
        memory: { usage: 0, limit: 0 },
      };
    }
  }
}
