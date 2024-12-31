import Debug from 'debug';
import {EventEmitter} from 'node:events';
import {Message, Reply, Request} from 'zeromq';
import {RhizomeNode} from './node.js';
import {RequestMethods} from './peers.js';
import {PeerAddress} from './types.js';
const debug = Debug('rz:request-reply');

export type PeerRequest = {
  method: RequestMethods;
};

export type RequestHandler = (req: PeerRequest, res: ResponseSocket) => void;

// TODO: Retain handle to request socket for each peer, so we only need to open once
export class RequestSocket {
  sock = new Request();

  constructor(readonly requestReply: RequestReply, addr: PeerAddress) {
    const addrStr = `tcp://${addr.addr}:${addr.port}`;
    this.sock.connect(addrStr);
    debug(`[${this.requestReply.rhizomeNode.config.peerId}]`, `Request socket connecting to ${addrStr}`);
  }

  async request(method: RequestMethods): Promise<Message> {
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

export class ResponseSocket {
  sock: Reply;
  constructor(sock: Reply) {
    this.sock = sock;
  }
  async send(msg: object | string) {
    if (typeof msg === 'object') {
      msg = JSON.stringify(msg);
    }
    await this.sock.send(msg);
  }
}

function peerRequestFromMsg(msg: Message): PeerRequest | null {
  let req: PeerRequest | null = null;
  try {
    const obj = JSON.parse(msg.toString());
    req = {...obj};
  } catch (e) {
    console.error('error receiving command', e);
  }
  return req;
}

export class RequestReply {
  rhizomeNode: RhizomeNode;
  replySock = new Reply();
  requestStream = new EventEmitter();
  requestBindAddrStr: string;

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    const {requestBindAddr, requestBindPort} = this.rhizomeNode.config;
    this.requestBindAddrStr = `tcp://${requestBindAddr}:${requestBindPort}`;
  }

  // Listen for incoming requests
  async start() {

    await this.replySock.bind(this.requestBindAddrStr);
    debug(`[${this.rhizomeNode.config.peerId}]`, `Reply socket bound to ${this.requestBindAddrStr}`);

    for await (const [msg] of this.replySock) {
      debug(`[${this.rhizomeNode.config.peerId}]`, `Received message`, {msg: msg.toString()});
      const req = peerRequestFromMsg(msg);
      this.requestStream.emit('request', req);
    }
  }

  // Add a top level handler for incoming requests.
  // Each handler will get a copy of every message.
  registerRequestHandler(handler: RequestHandler) {
    this.requestStream.on('request', (req) => {
      const res = new ResponseSocket(this.replySock);
      handler(req, res);
    });
  }

  createRequestSocket(addr: PeerAddress) {
    return new RequestSocket(this, addr);
  }

  async stop() {
    await this.replySock.unbind(this.requestBindAddrStr);
    this.replySock.close();
    this.replySock = new Reply();
  }
}
