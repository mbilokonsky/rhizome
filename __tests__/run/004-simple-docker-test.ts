import Docker from 'dockerode';
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';

// Simple test to verify Docker is working
describe('Docker Smoke Test', () => {
  let docker: Docker;
  let container: any;

  beforeAll(async () => {
    console.log('Setting up Docker client...');
    docker = new Docker();
    
    // Verify Docker is running
    try {
      await docker.ping();
      console.log('Docker daemon is responding');
    } catch (error) {
      console.error('Docker daemon is not responding:', error);
      throw error;
    }
  });

  it('should run a simple container', async () => {
    console.log('Starting test container...');
    
    // Pull the hello-world image
    try {
      await new Promise<void>((resolve, reject) => {
        docker.pull('hello-world:latest', (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          
          docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
      
      console.log('Successfully pulled hello-world image');
      
      // Create and start a container
      container = await docker.createContainer({
        Image: 'hello-world:latest',
        Tty: false
      });
      
      console.log(`Created container with ID: ${container.id}`);
      
      // Start the container
      await container.start();
      console.log('Started container');
      
      // Wait for container to finish
      await container.wait();
      console.log('Container finished execution');
      
      // Get container logs
      const logs = await container.logs({
        stdout: true,
        stderr: true
      });
      
      const logOutput = logs.toString();
      console.log('Container logs:', logOutput);
      
      // Verify the expected output is in the logs
      expect(logOutput).toContain('Hello from Docker!');
      
    } catch (error) {
      console.error('Error running container:', error);
      throw error;
    }
  }, 30000); // 30 second timeout

  afterAll(async () => {
    // Clean up container if it was created
    if (container) {
      try {
        console.log(`Removing container ${container.id}...`);
        await container.remove({ force: true });
        console.log('Container removed');
      } catch (error) {
        console.error('Error removing container:', error);
      }
    }
  });
});
