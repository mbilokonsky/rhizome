import { createServer } from 'net';

/**
 * Find an available port by trying to bind to it
 * @param startPort Starting port to check from
 * @returns Promise that resolves to an available port number
 */
export function findAvailablePort(startPort: number = 6000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port;
      server.close(() => {
        resolve(port);
      });
    });
    
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Find multiple consecutive available ports
 * @param count Number of consecutive ports needed
 * @param startPort Starting port to check from
 * @returns Promise that resolves to an array of available port numbers
 */
export async function findAvailablePortRange(count: number, startPort: number = 6000): Promise<number[]> {
  const ports: number[] = [];
  let currentPort = startPort;
  
  while (ports.length < count) {
    const availablePort = await findAvailablePort(currentPort);
    
    // Check if we have enough consecutive ports
    if (ports.length === 0 || availablePort === ports[ports.length - 1] + 1) {
      ports.push(availablePort);
      currentPort = availablePort + 1;
    } else {
      // Not consecutive, start over
      ports.length = 0;
      ports.push(availablePort);
      currentPort = availablePort + 1;
    }
  }
  
  return ports;
}

/**
 * Check if a specific port is available
 * @param port Port number to check
 * @returns Promise that resolves to true if port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}