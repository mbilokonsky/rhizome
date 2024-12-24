import { Request, Reply, Message } from 'zeromq';
import { REQUEST_BIND_PORT, REQUEST_BIND_ADDR} from './config';
import { EventEmitter } from 'node:events';
import { PeerMethods } from './peers';
import Debug from 'debug';
const debug = Debug('request-reply');

export type PeerRequest = {
  method: PeerMethods;
};

export type RequestHandler = (req: PeerRequest, res: ResponseSocket) => void;

export const replySock = new Reply();
const requestStream = new EventEmitter();

export async function bindReply() {
  const addrStr = `tcp://${REQUEST_BIND_ADDR}:${REQUEST_BIND_PORT}`;
  await replySock.bind(addrStr);
  debug(`Reply socket bound to ${addrStr}`);
}

export async function runRequestHandlers() {
  for await (const [msg] of replySock) {
    debug(`Received message`, {msg: msg.toString()});
    const req = peerRequestFromMsg(msg);
    requestStream.emit('request', req);
  }
}

function peerRequestFromMsg(msg: Message): PeerRequest | null {
  let req: PeerRequest | null = null;
  try {
    const obj = JSON.parse(msg.toString());
    req = {...obj};
  } catch(e) {
    debug('error receiving command', e);
  }
  return req;
}

export class ResponseSocket {
  sock: Reply;
  constructor(sock: Reply) {
    this.sock = sock;
  }
  async send(msg: object | string) {
    if (typeof msg === 'object') {
      msg = JSON.stringify(msg);
    }
    debug('sending reply', {msg});
    await this.sock.send(msg);
  }
}

export function registerRequestHandler(handler: RequestHandler) {
  requestStream.on('request', (req) => {
    const res = new ResponseSocket(replySock);
    handler(req, res);
  });
}

export class RequestSocket {
  sock = new Request();
  constructor(host: string, port: number) {
    const addrStr = `tcp://${host}:${port}`;
    this.sock.connect(addrStr);
    debug(`Request socket connecting to ${addrStr}`);
  }
  async request(method: PeerMethods): Promise<Message> {
    const req: PeerRequest = {
      method
    };
    await this.sock.send(JSON.stringify(req));
    // Wait for a response.
    // TODO: Timeout
    // TODO: Retry
    // this.sock.receiveTimeout = ...
    const [res] = await this.sock.receive();
    return res;
  }
}
