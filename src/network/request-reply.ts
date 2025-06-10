import Debug from 'debug';
import {EventEmitter} from 'node:events';
import {Message, Reply, Request} from 'zeromq';
import {RhizomeNode} from '../node';
import {PeerAddress, RequestMethods} from '../network/peers';
const debug = Debug('rz:request-reply');

export type PeerRequest = {
  method: RequestMethods;
};

export type RequestHandler = (req: PeerRequest, res: ResponseSocket) => void;

export class RequestSocket {
  sock?: Request;
  addrStr: string;

  constructor(readonly requestReply: RequestReply, addr: PeerAddress) {
    this.addrStr = `tcp://${addr.addr}:${addr.port}`;
    this.sock = new Request();
    this.sock.connect(this.addrStr);
    debug(`[${this.requestReply.rhizomeNode.config.peerId}]`, `Request socket connecting to ${this.addrStr}`);
  }

  async request(method: RequestMethods): Promise<Message> {
    if (!this.sock) throw new Error('Request socket is undefined');
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

  close() {
    this.sock?.close();
    // Make sure it goes out of scope
    this.sock = undefined;
    debug(`[${this.requestReply.rhizomeNode.config.peerId}]`, 'Request socket closed');
  }
}

export class ResponseSocket {
  constructor(readonly sock: Reply) {}

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
  replySock?: Reply;
  requestStream = new EventEmitter();
  requestBindAddrStr: string;

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    const {requestBindAddr, requestBindPort} = this.rhizomeNode.config;
    this.requestBindAddrStr = `tcp://${requestBindAddr}:${requestBindPort}`;
  }

  // Listen for incoming requests
  async start() {
    this.replySock = new Reply();

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
      if (this.replySock) {
        const res = new ResponseSocket(this.replySock);
        handler(req, res);
      }
    });
  }

  createRequestSocket(addr: PeerAddress) {
    return new RequestSocket(this, addr);
  }

  async stop() {
    if (this.replySock) {
      await this.replySock.unbind(this.requestBindAddrStr);
      this.replySock.close();
      this.replySock = undefined;
      debug(`[${this.rhizomeNode.config.peerId}]`, 'Reply socket closed');
    }
  }
}
