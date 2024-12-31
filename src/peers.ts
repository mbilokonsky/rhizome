import Debug from 'debug';
import {Message} from 'zeromq';
import {Delta} from "./delta.js";
import {RhizomeNode} from "./node.js";
import {Subscription} from './pub-sub.js';
import {PeerRequest, RequestSocket, ResponseSocket} from "./request-reply.js";
const debug = Debug('rz:peers');

export class PeerAddress {
  addr: string;
  port: number;

  constructor(addr: string, port: number) {
    this.addr = addr;
    this.port = port;
  }

  static fromString(addrString: string): PeerAddress {
    const [addr, port] = addrString.trim().split(':');
    return new PeerAddress(addr, parseInt(port));
  }

  toAddrString() {
    return `${this.addr}:${this.port}`;
  }

  toJSON() {
    return this.toAddrString();
  }

  isEqual(other: PeerAddress) {
    return this.addr === other.addr && this.port === other.port;
  }
};

export function parseAddressList(input: string): PeerAddress[] {
  return input.split(',')
    .filter(x => !!x)
    .map((peer: string) => PeerAddress.fromString(peer));
}

export enum RequestMethods {
  GetPublishAddress,
  AskForDeltas
}

class Peer {
  rhizomeNode: RhizomeNode;
  reqAddr: PeerAddress;
  reqSock?: RequestSocket;
  publishAddr: PeerAddress | undefined;
  isSelf: boolean;
  isSeedPeer: boolean;
  subscription?: Subscription;

  constructor(rhizomeNode: RhizomeNode, reqAddr: PeerAddress) {
    this.rhizomeNode = rhizomeNode;
    this.reqAddr = reqAddr;
    this.isSelf = reqAddr.isEqual(this.rhizomeNode.myRequestAddr);
    this.isSeedPeer = this.rhizomeNode.config.seedPeers.some((seedPeer) => reqAddr.isEqual(seedPeer));
  }

  async request(method: RequestMethods): Promise<Message> {
    if (!this.reqSock) {
      this.reqSock = this.rhizomeNode.requestReply.createRequestSocket(this.reqAddr);
    }
    return this.reqSock.request(method);
  }

  async subscribeDeltas() {
    if (!this.publishAddr) {
      debug(`[${this.rhizomeNode.config.peerId}]`, `Requesting publish addr from peer ${this.reqAddr.toAddrString()}`);
      const res = await this.request(RequestMethods.GetPublishAddress);
      this.publishAddr = PeerAddress.fromString(res.toString());
      debug(`[${this.rhizomeNode.config.peerId}]`, `Received publish addr ${this.publishAddr.toAddrString()} from peer ${this.reqAddr.toAddrString()}`);
    }

    debug(`[${this.rhizomeNode.config.peerId}]`, `Subscribing to peer ${this.reqAddr.toAddrString()}`);

    // ZeroMQ subscription
    this.subscription = this.rhizomeNode.pubSub.subscribe(
      this.publishAddr,
      this.rhizomeNode.config.pubSubTopic,
      (sender, msg) => {
        const delta = this.rhizomeNode.deltaStream.deserializeDelta(msg);
        delta.receivedFrom = sender;
        debug(`[${this.rhizomeNode.config.peerId}]`, `Received delta: ${JSON.stringify(delta)}`);
        this.rhizomeNode.deltaStream.ingestDelta(delta);
      });

    this.subscription.start();
  }

  async askForDeltas(): Promise<Delta[]> {
    // TODO as a first approximation we are trying to cram the entire history
    // of accepted deltas, into one (potentially gargantuan) json message.
    // A second approximation would be to stream the deltas.
    // Third pass should find a way to reduce the number of deltas transmitted.

    // TODO: requestTimeout
    const res = await this.request(RequestMethods.AskForDeltas);
    const deltas = JSON.parse(res.toString());
    return deltas;
  }
}

export class Peers {
  rhizomeNode: RhizomeNode;
  peers: Peer[] = [];

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;

    // Add self to the list of peers, but don't connect
    this.addPeer(this.rhizomeNode.myRequestAddr);

    this.rhizomeNode.requestReply.registerRequestHandler(async (req: PeerRequest, res: ResponseSocket) => {
      debug(`[${this.rhizomeNode.config.peerId}]`, 'Inspecting peer request');
      switch (req.method) {
        case RequestMethods.GetPublishAddress: {
          debug(`[${this.rhizomeNode.config.peerId}]`, 'It\'s a request for our publish address');
          await res.send(this.rhizomeNode.myPublishAddr.toAddrString());
          break;
        }
        case RequestMethods.AskForDeltas: {
          debug(`[${this.rhizomeNode.config.peerId}]`, 'It\'s a request for deltas');
          // TODO: stream these rather than
          // trying to write them all in one message
          const deltas = this.rhizomeNode.deltaStream.deltasAccepted;
          debug(`[${this.rhizomeNode.config.peerId}]`, `Sending ${deltas.length} deltas`);
          await res.send(JSON.stringify(deltas));
          break;
        }
      }
    });
  }

  start() {
    // TODO: Move this somewhere that makes more sense
    this.rhizomeNode.pubSub.subscribeTopic(
      this.rhizomeNode.config.pubSubTopic,
      (sender, msg) => {
        const delta = this.rhizomeNode.deltaStream.deserializeDelta(msg);
        delta.receivedFrom = sender;
        debug(`[${this.rhizomeNode.config.peerId}]`, `Received delta: ${JSON.stringify(delta)}`);
        this.rhizomeNode.deltaStream.ingestDelta(delta);
      }
    );
  }

  stop() {
    debug(`[${this.rhizomeNode.config.peerId}]`, 'Closing all peer request sockets');
    for (const peer of this.peers) {
      peer.reqSock?.close();
    }
  }

  addPeer(addr: PeerAddress): Peer {
    const peer = new Peer(this.rhizomeNode, addr);
    this.peers.push(peer);
    debug(`[${this.rhizomeNode.config.peerId}]`, 'Added peer', addr);
    return peer;
  }

  async subscribeToSeeds() {
    const {seedPeers} = this.rhizomeNode.config;
    debug(`[${this.rhizomeNode.config.peerId}]`, `SubscribeToSeeds, seedPeers: ${JSON.stringify(seedPeers)}`);
    seedPeers.forEach(async (addr, idx) => {
      const peer = this.addPeer(addr);

      debug(`[${this.rhizomeNode.config.peerId}]`, `SEED PEERS[${idx}]=${addr.toAddrString()}, isSelf:`, peer.isSelf);
      if (!peer.isSelf) {
        await peer.subscribeDeltas();
      }
    });
  }

  //! TODO Expect abysmal scaling properties with this function
  async askAllPeersForDeltas() {
    this.peers
      .forEach(async (peer, idx) => {
        debug(`[${this.rhizomeNode.config.peerId}]`, `Peer ${peer.reqAddr.toAddrString()} isSelf`, peer.isSelf);
        if (peer.isSelf) return;
        debug(`[${this.rhizomeNode.config.peerId}]`, `Asking peer ${idx} for deltas`);
        const deltas = await peer.askForDeltas();
        debug(`[${this.rhizomeNode.config.peerId}]`, `Received ${deltas.length} deltas from ${peer.reqAddr.toAddrString()}`);
        for (const delta of deltas) {
          delta.receivedFrom = peer.reqAddr;
          this.rhizomeNode.deltaStream.receiveDelta(delta);
        }
        this.rhizomeNode.deltaStream.ingestAll();
      });
  }
}
