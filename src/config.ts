import {randomUUID} from "crypto";
import {PeerAddress} from "./types.js";

// _HOST refers to the address from an external perspective
// _ADDR refers to the interface address from the service's perspective

export const LEVEL_DB_DIR = process.env.RHIZOME_LEVEL_DB_DIR ?? './data';
export const CREATOR = process.env.USER!;
export const PEER_ID = process.env.RHIZOME_PEER_ID || randomUUID();
export const ADDRESS = process.env.RHIZOME_ADDRESS ?? 'localhost';
export const REQUEST_BIND_ADDR = process.env.RHIZOME_REQUEST_BIND_ADDR || ADDRESS;
export const REQUEST_BIND_PORT = parseInt(process.env.RHIZOME_REQUEST_BIND_PORT || '4000');
export const REQUEST_BIND_HOST = process.env.RHIZOME_REQUEST_BIND_HOST || REQUEST_BIND_ADDR;
export const PUBLISH_BIND_ADDR = process.env.RHIZOME_PUBLISH_BIND_ADDR || ADDRESS;
export const PUBLISH_BIND_PORT = parseInt(process.env.RHIZOME_PUBLISH_BIND_PORT || '4001');
export const PUBLISH_BIND_HOST = process.env.RHIZOME_PUBLISH_BIND_HOST || PUBLISH_BIND_ADDR;
export const HTTP_API_ADDR = process.env.RHIZOME_HTTP_API_ADDR || ADDRESS || 'localhost';
export const HTTP_API_PORT = parseInt(process.env.RHIZOME_HTTP_API_PORT || '3000');
export const HTTP_API_ENABLE = process.env.RHIZOME_HTTP_API_ENABLE === 'true';
export const SEED_PEERS: PeerAddress[]  = (process.env.RHIZOME_SEED_PEERS || '').split(',')
  .filter(x => !!x)
  .map((peer: string) => PeerAddress.fromString(peer));

export const PUB_SUB_TOPIC = process.env.RHIZOME_PUB_SUB_TOPIC || `deltas-${randomUUID()}`;
