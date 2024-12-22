export const LEVEL_DB_DIR = process.env.RHIZOME_LEVEL_DB_DIR ?? './data';
export const CREATOR = process.env.USER!;
export const HOST = process.env.HOST!;
export const ADDRESS = process.env.ADDRESS ?? '127.0.0.1';
export const REQUEST_BIND_PORT = parseInt(process.env.REQUEST_BIND_PORT || '4000');
export const PUBLISH_BIND_PORT = parseInt(process.env.PUBLISH_BIND_PORT || '4001');
export const REQUEST_BIND_ADDR = process.env.ADDRESS || '127.0.0.1';
export const PUBLISH_BIND_ADDR = process.env.ADDRESS || '127.0.0.1';
export const HTTP_API_PORT = parseInt(process.env.HTTP_API_PORT || '3000');
export const HTTP_API_ADDR = process.env.ADDRESS || '127.0.0.1';
export const ENABLE_HTTP_API = process.env.ENABLE_HTTP_API === 'true';
export const SEED_PEERS = (process.env.SEED_PEERS || '').split(',')
  .filter(x => !!x)
  .map((peer: string) => {
    const [addr, port] = peer.trim().split(':');
    return {addr, port: parseInt(port)};
  });
