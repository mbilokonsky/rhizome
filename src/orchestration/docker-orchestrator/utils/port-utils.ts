/**
 * Get a random available port in the range 30000-50000
 * @returns A random port number
 */
export function getRandomPort(): number {
  return Math.floor(30000 + Math.random() * 20000);
}

/**
 * Check if a port is available
 * @param port Port number to check
 * @returns True if the port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  const net = await import('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

/**
 * Get an available port, optionally starting from a specific port
 * @param startPort Optional starting port (default: 30000)
 * @returns A promise that resolves to an available port
 */
export async function getAvailablePort(startPort: number = 30000): Promise<number> {
  let port = startPort;
  while (port <= 65535) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  throw new Error('No available ports found');
}

export default {
  getRandomPort,
  isPortAvailable,
  getAvailablePort
};
