import Debug from 'debug';
import {Message} from 'zeromq';
import {SEED_PEERS} from "./config";
import {Delta} from "./delta";
import {RhizomeNode} from "./node";
import {Subscription} from './pub-sub';
import {PeerRequest, RequestSocket, ResponseSocket} from "./request-reply";
import {PeerAddress} from "./types";
const debug = Debug('peers');

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
    this.isSeedPeer = !!SEED_PEERS.find((seedPeer) => reqAddr.isEqual(seedPeer));
  }

  async request(method: RequestMethods): Promise<Message> {
    if (!this.reqSock) {
      this.reqSock = new RequestSocket(this.reqAddr);
    }
    return this.reqSock.request(method);
  }

  async subscribeDeltas() {
    if (!this.publishAddr) {
      debug(`requesting publish addr from peer ${this.reqAddr.toAddrString()}`);
      const res = await this.request(RequestMethods.GetPublishAddress);
      this.publishAddr = PeerAddress.fromString(res.toString());
      debug(`received publish addr ${this.publishAddr.toAddrString()} from peer ${this.reqAddr.toAddrString()}`);
    }

    this.subscription = this.rhizomeNode.pubSub.subscribe(
      this.publishAddr,
      "deltas",
      (sender, msg) => {
        const delta = this.rhizomeNode.deltaStream.deserializeDelta(msg.toString());
        delta.receivedFrom = sender;
        debug(`Received delta: ${JSON.stringify(delta)}`);
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
      debug('inspecting peer request');
      switch (req.method) {
        case RequestMethods.GetPublishAddress: {
          debug('it\'s a request for our publish address');
          await res.send(this.rhizomeNode.myPublishAddr.toAddrString());
          break;
        }
        case RequestMethods.AskForDeltas: {
          debug('it\'s a request for deltas');
          // TODO: stream these rather than
          // trying to write them all in one message
          const deltas = this.rhizomeNode.deltaStream.deltasAccepted;
          debug(`sending ${deltas.length} deltas`);
          await res.send(JSON.stringify(deltas));
          break;
        }
      }
    });

  }

  addPeer(addr: PeerAddress): Peer {
    const peer = new Peer(this.rhizomeNode, addr);
    this.peers.push(peer);
    debug('added peer', addr);
    return peer;
  }

  async subscribeToSeeds() {
    SEED_PEERS.forEach(async (addr, idx) => {
      debug(`SEED PEERS[${idx}]=${addr.toAddrString()}`);
      const peer = this.addPeer(addr);
      await peer.subscribeDeltas();
    });
  }

  //! TODO Expect abysmal scaling properties with this function
  async askAllPeersForDeltas() {
    this.peers.filter(({isSelf}) => !isSelf)
      .forEach(async (peer, idx) => {
        debug(`Asking peer ${idx} for deltas`);
        const deltas = await peer.askForDeltas();
        debug(`received ${deltas.length} deltas from ${peer.reqAddr.toAddrString()}`);
        for (const delta of deltas) {
          delta.receivedFrom = peer.reqAddr;
          this.rhizomeNode.deltaStream.receiveDelta(delta);
        }
        this.rhizomeNode.deltaStream.ingestAll();
      });
  }
}
